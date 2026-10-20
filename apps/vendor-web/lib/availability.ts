'use client';

import { supabase, isSupabaseConfigured } from './supabase';
import { NO_LISTING_PERMISSION } from './permissions';
import { capacityFor } from './vendorData';
import type { DemoExperience } from '@cvip/demo';

/**
 * The availability write path — V-03.
 *
 * Same shape as `lib/listings.ts`: one async surface, the demo/live branch inside this file.
 *
 * ## A capacity change is a listing write
 *
 * `availability_slots` is gated by the same `is_vendor_listing_manager()` policy as
 * `experiences`, so `setSlotCapacity` takes the caller's permission and refuses before either
 * branch — including the demo branch, which has no RLS behind it.
 *
 * ## Capacity cannot go below what is already sold
 *
 * `availability_slots_not_oversold` (`booked_count <= capacity`) is a table constraint, so the
 * live path would reject an oversell with a Postgres error that means nothing to an operator.
 * The rule is therefore enforced here too, in words — and in the demo path as well, so a vendor
 * who learns the rule in a demonstration meets the same rule in production.
 *
 * The constraint stays the authority. This check is the explanation, not the guarantee: a second
 * scanner selling the last seat between the read and the write is exactly what the constraint is
 * there to catch, and `reserve_availability()`'s row lock (AD-03) is what makes booking safe.
 */

export interface Slot {
  /** Null in demo mode, where slots are generated rather than stored. */
  id: string | null;
  time: string;
  capacity: number;
  sold: number;
}

export interface Day {
  iso: string;
  label: string;
  slots: Slot[];
}

export const isDemoAvailability = !isSupabaseConfigured;

/** Thrown for a capacity an operator can correct, as opposed to a transport failure. */
export class SlotInvalid extends Error {}

const dayLabel = (d: Date) =>
  d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

type SlotRow = {
  id: string;
  starts_at: string;
  capacity: number;
  booked_count: number;
};

export async function loadAvailability(
  experience: DemoExperience | { id: string; durationMinutes: number },
  days = 7,
): Promise<Day[]> {
  if (isDemoAvailability) {
    return capacityFor(experience as DemoExperience, days).map((d) => ({
      iso: d.iso,
      label: d.label,
      slots: d.slots.map((s) => ({ id: null, time: s.time, capacity: s.capacity, sold: s.sold })),
    }));
  }

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + days);

  const { data, error } = await supabase
    .from('availability_slots')
    .select('id, starts_at, capacity, booked_count')
    .eq('experience_id', experience.id)
    .gte('starts_at', from.toISOString())
    .lt('starts_at', to.toISOString())
    .order('starts_at');

  if (error) throw new Error(error.message);

  /*
   * Every day in the window gets a row, including the empty ones. A calendar that silently omits
   * the days with no slots reads as "nothing to do here" when it means "nothing scheduled yet",
   * and those are opposite instructions to an operator.
   */
  const byDay = new Map<string, Slot[]>();
  for (const r of (data as unknown as SlotRow[]) ?? []) {
    const starts = new Date(r.starts_at);
    const iso = starts.toISOString().slice(0, 10);
    const time = starts.toTimeString().slice(0, 5);
    const list = byDay.get(iso) ?? [];
    list.push({ id: r.id, time, capacity: r.capacity, sold: r.booked_count });
    byDay.set(iso, list);
  }

  const out: Day[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    out.push({ iso, label: dayLabel(d), slots: byDay.get(iso) ?? [] });
  }
  return out;
}

export async function setSlotCapacity(
  canManage: boolean,
  slot: Slot,
  capacity: number,
): Promise<Slot> {
  if (!canManage) throw new SlotInvalid(NO_LISTING_PERMISSION);
  if (!Number.isFinite(capacity) || capacity < 0) {
    throw new SlotInvalid('Capacity cannot be negative.');
  }
  const next = Math.round(capacity);

  if (next < slot.sold) {
    throw new SlotInvalid(
      `${slot.sold} ${slot.sold === 1 ? 'seat is' : 'seats are'} already booked on this slot, so capacity cannot go below ${slot.sold}.`,
    );
  }

  if (isDemoAvailability || !slot.id) return { ...slot, capacity: next };

  const { data, error } = await supabase
    .from('availability_slots')
    .update({ capacity: next })
    .eq('id', slot.id)
    .select('id, starts_at, capacity, booked_count')
    .single();

  if (error) throw new Error(error.message);
  const r = data as unknown as SlotRow;
  return { ...slot, capacity: r.capacity, sold: r.booked_count };
}
