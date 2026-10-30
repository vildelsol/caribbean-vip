'use client';

import { supabase, isSupabaseConfigured } from './supabase';
import { NO_LISTING_PERMISSION } from './permissions';
import { capacityFor } from './vendorData';
import type { DemoExperience } from '@cvip/demo';
import { dayKey, timeLabel } from './operations';
import { SlotInputInvalid, buildSlotRows, zonedToUtc, type NewSlotInput } from './slotTime';

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

const dayLabel = (d: Date, timeZone?: string) =>
  d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone });

type SlotRow = {
  id: string;
  starts_at: string;
  capacity: number;
  booked_count: number;
};

export async function loadAvailability(
  experience: DemoExperience | { id: string; durationMinutes: number },
  days = 7,
  /** The island's timezone. Required live: days and times are the island's, not the browser's. */
  timeZone?: string,
): Promise<Day[]> {
  if (isDemoAvailability) {
    return capacityFor(experience as DemoExperience, days).map((d) => ({
      iso: d.iso,
      label: d.label,
      slots: d.slots.map((s) => ({ id: null, time: s.time, capacity: s.capacity, sold: s.sold })),
    }));
  }

  if (!timeZone) throw new Error('The island timezone is not known yet.');

  // Island calendar days, midnight to midnight. These zones have no daylight saving, so 24 h steps
  // land on consecutive dates.
  const now = new Date();
  const dayKeys = Array.from({ length: days }, (_, i) =>
    dayKey(new Date(now.getTime() + i * 86_400_000), timeZone),
  );
  const from = zonedToUtc(dayKeys[0]!, '00:00', timeZone);
  const to = new Date(from.getTime() + days * 86_400_000);

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
    const key = dayKey(r.starts_at, timeZone);
    const list = byDay.get(key) ?? [];
    list.push({ id: r.id, time: timeLabel(r.starts_at, timeZone), capacity: r.capacity, sold: r.booked_count });
    byDay.set(key, list);
  }

  return dayKeys.map((iso) => ({
    iso,
    label: dayLabel(zonedToUtc(iso, '12:00', timeZone), timeZone),
    slots: byDay.get(iso) ?? [],
  }));
}

/**
 * Schedule a departure, optionally repeated daily. Live only: the demo calendar is generated, so
 * there is nothing to add to, and a demo that appeared to accept a slot it then forgot would be a
 * fake flow.
 *
 * `booked_count` is not sent: it starts at zero and only the booking functions move it
 * (`guard_availability_booked_count`).
 */
export async function addSlots(
  canManage: boolean,
  input: Omit<NewSlotInput, 'now'>,
): Promise<number> {
  if (!canManage) throw new SlotInvalid(NO_LISTING_PERMISSION);
  if (isDemoAvailability) throw new SlotInvalid('Adding departures is not available in the demo.');

  let rows;
  try {
    rows = buildSlotRows({ ...input, now: new Date() });
  } catch (e) {
    if (e instanceof SlotInputInvalid) throw new SlotInvalid(e.message);
    throw e;
  }

  const { error } = await supabase.from('availability_slots').insert(rows);
  if (error) {
    // 23505: unique (experience_id, starts_at). Nothing was written, the insert is one statement.
    if (error.code === '23505') {
      throw new SlotInvalid('There is already a departure at one of those times. Nothing was added.');
    }
    throw new Error(error.message);
  }
  return rows.length;
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
