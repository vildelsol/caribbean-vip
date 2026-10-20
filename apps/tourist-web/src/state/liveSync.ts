/**
 * Booking recovery from the server — LIVE MODE ONLY. The body of `useLiveSync`, kept free of
 * React so it can be tested.
 *
 * On start, and whenever the session changes in a way that could change whose bookings these are
 * (`SIGNED_IN` on a new device, `USER_UPDATED` after an email is linked, `TOKEN_REFRESHED`), it
 * reads `my_bookings()`, converts each row and dispatches `mergeServerBookings`. The merge is
 * idempotent and never removes a local booking, so a repeated or overlapping sync is harmless.
 *
 * With no session it does not call `my_bookings()` at all: anon holds no EXECUTE on it, and a
 * permission error on every cold start is noise. `SIGNED_OUT` purges the server bookings from the
 * device (`purgeServerBookings`), and any sync still in flight from before it is dropped.
 *
 * With a null client (demo mode) it does nothing at all and returns a no-op cleanup.
 */

import type { PartySelection } from '../data/catalogue';
import { bookingFromServer, type ServerBookingRow } from '../data/serverBooking';
import { fetchMyBookings, type AccountClient } from '../lib/account';
import type { BookingStatusResponse } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { Booking, StoreAction } from './store';

export const SYNC_EVENTS = ['SIGNED_IN', 'USER_UPDATED', 'TOKEN_REFRESHED'] as const;

export function shouldSyncOn(event: string): boolean {
  return (SYNC_EVENTS as readonly string[]).includes(event);
}

export function bookingsFromRows(rows: readonly ServerBookingRow[]): Booking[] {
  return rows.map(bookingFromServer).filter((b): b is Booking => b !== null);
}

export interface LiveSyncClient extends AccountClient {
  auth: AccountClient['auth'] & {
    getSession(): Promise<{ data: { session: { user?: unknown } | null } }>;
    onAuthStateChange(callback: (event: string, session: unknown) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
  };
}

type Schedule = (fn: () => Promise<unknown> | void) => void;

type SyncAction = Extract<StoreAction, { type: 'mergeServerBookings' } | { type: 'purgeServerBookings' }>;

/**
 * supabase-js runs `onAuthStateChange` callbacks while holding its auth lock; awaiting another
 * Supabase call inside one deadlocks. So the fetch is always deferred to a fresh task.
 */
const nextTask: Schedule = (fn) => {
  setTimeout(() => void fn(), 0);
};

async function hasUser(client: LiveSyncClient): Promise<boolean> {
  try {
    const { data } = await client.auth.getSession();
    return Boolean(data.session?.user);
  } catch {
    return false;
  }
}

/** Starts syncing. Returns the cleanup: unsubscribe, and ignore any fetch still in flight. */
export function startLiveSync(
  client: LiveSyncClient | null,
  dispatch: (action: SyncAction) => void,
  schedule: Schedule = nextTask,
): () => void {
  if (!client) return () => {};

  let active = true;
  // Bumped on every sign-out. A sync that started under an earlier session must not merge the
  // bookings it read back into a device that has since signed out.
  let generation = 0;

  const sync = async () => {
    if (!active) return;
    const started = generation;
    if (!(await hasUser(client))) return;
    if (!active || started !== generation) return;
    const result = await fetchMyBookings(client);
    if (!active || started !== generation || !result.ok) return;
    const bookings = bookingsFromRows(result.rows);
    if (bookings.length > 0) dispatch({ type: 'mergeServerBookings', bookings });
  };

  schedule(sync);

  const { data } = client.auth.onAuthStateChange((event) => {
    if (!active) return;
    if (event === 'SIGNED_OUT') {
      generation += 1;
      // A local state change only, so it is safe inside the auth callback.
      dispatch({ type: 'purgeServerBookings' });
      return;
    }
    if (shouldSyncOn(event)) schedule(sync);
  });

  return () => {
    active = false;
    data.subscription.unsubscribe();
  };
}

// ---------------------------------------------------------------------------
// BookingReturn
// ---------------------------------------------------------------------------

/**
 * The `my_bookings()` row for a just-paid booking, or null (not there yet, or the read failed).
 * One read: BookingReturn takes everything it needs from this row.
 */
export async function findMyBookingRow(
  bookingId: string,
  client: AccountClient | null = supabase,
): Promise<ServerBookingRow | null> {
  const result = await fetchMyBookings(client);
  if (!result.ok) return null;
  return result.rows.find((r) => r.id === bookingId) ?? null;
}

/** The party Checkout put in sessionStorage. Anything unreadable falls back to seats as adults. */
export function parseStoredParty(raw: string | null, seats: number): PartySelection {
  const fallback: PartySelection = { adults: seats, children: 0, photoPackage: false };
  if (!raw) return fallback;
  try {
    const p: unknown = JSON.parse(raw);
    if (typeof p !== 'object' || p === null) return fallback;
    const r = p as Record<string, unknown>;
    const count = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;
    if (!count(r.adults) || !count(r.children) || typeof r.photoPackage !== 'boolean') return fallback;
    return { adults: r.adults as number, children: r.children as number, photoPackage: r.photoPackage };
  } catch {
    return fallback;
  }
}

/** What Checkout left in sessionStorage for this booking, read by BookingReturn. */
export interface ReturnStorage {
  slotDate: string | null;
  slotTime: string | null;
  party: string | null;
  attendee: string | null;
}

/**
 * The store action for a booking BookingReturn has just seen confirmed.
 *
 * With the `my_bookings()` row in hand, it is that row mapped by `bookingFromServer`: a plain
 * merge, identical to what `useLiveSync` would dispatch, so the arrival order does not matter.
 *
 * Without it (the read failed or has not caught up), it falls back to a reconstruction from
 * booking-status and the device's sessionStorage, dispatched `fillOnly`: those device-derived
 * values may fill what is still empty, never overwrite a real server value that got there first.
 */
export function returnedBookingAction(
  row: ServerBookingRow | null,
  result: BookingStatusResponse,
  stored: ReturnStorage,
  islandId: string,
): Extract<StoreAction, { type: 'mergeServerBookings' }> {
  const mapped = row ? bookingFromServer(row) : null;
  if (mapped) return { type: 'mergeServerBookings', bookings: [mapped] };

  const slotDate = stored.slotDate ?? '';
  return {
    type: 'mergeServerBookings',
    fillOnly: true,
    bookings: [
      {
        id: result.bookingId,
        reference: result.reference,
        // The DB uuid: the catalogue does not know it, and the sync's merge replaces it.
        experienceId: result.experienceId,
        islandId,
        dateISO: slotDate ? (slotDate.split('T')[0] ?? '') : '',
        time: stored.slotTime ?? '',
        party: parseStoredParty(stored.party, result.seats),
        totalMinor: result.totalMinor,
        lines: [],
        taxMinor: result.taxMinor,
        serviceFeeMinor: result.serviceFeeMinor,
        subtotalMinor: result.subtotalMinor,
        status: 'confirmed',
        createdAtISO: result.createdAt,
        ticketToken: result.ticketToken ?? '',
        voucherId: null,
        attendeeName: stored.attendee || null,
        source: 'server',
      },
    ],
  };
}
