'use client';

import { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from './supabase';
import { useVendorSession } from './session';
import { demoOperations, liveOperations, type BookingRow, type Operations } from './operations';

export type OperationsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Operations };

const DAY_MS = 86_400_000;

/**
 * Today's manifest and earnings for the active organisation.
 *
 * Demo mode is ready on the first render, so the server-rendered page is the same one it always
 * was. Live mode reads `bookings` through RLS: a vendor member can select their own organisation's
 * rows (`bookings_self_read`), so the org filter below narrows the query, it is not the boundary.
 */
export function useOperations(): OperationsState {
  const { memberships, activeOrgId } = useVendorSession();
  const demo = useMemo(() => (isSupabaseConfigured ? null : demoOperations()), []);
  const [live, setLive] = useState<OperationsState>({ status: 'loading' });

  const membership = memberships.find((m) => m.vendor_org_id === activeOrgId) ?? null;
  const orgId = membership?.vendor_org_id ?? null;
  const vendorName = membership?.vendor_organizations?.trading_name ?? 'Your business';
  const islandId = membership?.vendor_organizations?.island_id ?? null;

  useEffect(() => {
    if (!isSupabaseConfigured || !orgId || !islandId) return;
    let active = true;
    setLive({ status: 'loading' });

    void (async () => {
      const now = new Date();
      // A window wide enough to hold seven island days whichever side of UTC midnight they fall.
      const from = new Date(now.getTime() - 8 * DAY_MS).toISOString();
      const to = new Date(now.getTime() + 2 * DAY_MS).toISOString();

      const [island, bookings, listings] = await Promise.all([
        supabase.from('islands').select('timezone').eq('id', islandId).maybeSingle(),
        supabase
          .from('bookings')
          .select(
            'id, reference, status, seats, subtotal_minor, discount_minor, commission_minor, experience_id, experiences(title), availability_slots!inner(starts_at), booking_guests(guest_name), vouchers(state)',
          )
          .eq('vendor_org_id', orgId)
          .in('status', ['confirmed', 'completed'])
          .gte('availability_slots.starts_at', from)
          .lte('availability_slots.starts_at', to),
        supabase
          .from('experiences')
          .select('id', { count: 'exact', head: true })
          .eq('vendor_org_id', orgId),
      ]);

      if (!active) return;
      const failure = island.error ?? bookings.error ?? listings.error;
      if (failure) {
        setLive({ status: 'error', message: failure.message });
        return;
      }
      if (!island.data?.timezone) {
        // Guessing a timezone would put bookings on the wrong day, so say so instead.
        setLive({ status: 'error', message: 'Your island has no timezone set.' });
        return;
      }

      setLive({
        status: 'ready',
        data: liveOperations({
          rows: (bookings.data ?? []) as unknown as BookingRow[],
          vendorName,
          listingCount: listings.count ?? 0,
          timeZone: island.data.timezone as string,
          now,
        }),
      });
    })();

    return () => {
      active = false;
    };
  }, [orgId, islandId, vendorName]);

  if (demo) return { status: 'ready', data: demo };
  return live;
}
