/**
 * Live booking recovery: what `useLiveSync` does, without React.
 *
 * In demo mode (null client) nothing may happen: no subscription, no fetch, no dispatch. That
 * denial is paired with a positive control on a fake client that records every call.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// liveSync and the store both import the app's Supabase client, built from VITE_SUPABASE_* at
// import time. Pin demo mode, so no test here depends on (or reaches) the developer's project.
vi.mock('../lib/supabase', () => ({ supabase: null, isLiveMode: false }));
import { visibleExperiences } from '../data/catalogue';
import type { ServerBookingRow } from '../data/serverBooking';
import type { BookingStatusResponse } from '../lib/api';
import {
  SYNC_EVENTS,
  bookingsFromRows,
  findMyBookingRow,
  parseStoredParty,
  returnedBookingAction,
  shouldSyncOn,
  startLiveSync,
  type LiveSyncClient,
} from './liveSync';
import { initialState, reducer, type AppState } from './store';

const catamaran = visibleExperiences().find((e) => e.title === 'Catamaran Snorkel & Sunset')!;

function row(over: Partial<ServerBookingRow> = {}): ServerBookingRow {
  return {
    id: 'b1',
    reference: 'VIPJ-7M24-83A1',
    status: 'confirmed',
    seats: 2,
    currency: 'USD',
    subtotal_minor: 20000,
    tax_minor: 3000,
    service_fee_minor: 1000,
    total_minor: 24000,
    created_at: '2026-10-20T14:03:11.123+00:00',
    ticket_token: 'tok',
    experience_title: catamaran.title,
    island_code: 'JM',
    starts_at: '2026-10-22T09:00:00+00:00',
    guests: [{ kind: 'adult', label: 'Adult', quantity: 2, unit_amount_minor: 10000 }],
    ...over,
  };
}

type AuthCallback = (event: string, session: unknown) => void;

function fakeClient(rows: unknown[] = [row()], { signedIn = true }: { signedIn?: boolean } = {}) {
  let callback: AuthCallback | null = null;
  const unsubscribe = vi.fn();
  const client = {
    auth: {
      updateUser: vi.fn(),
      verifyOtp: vi.fn(),
      signInWithOtp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: signedIn ? { user: { id: 'u-1' } } : null } })),
      onAuthStateChange: vi.fn((cb: AuthCallback) => {
        callback = cb;
        return { data: { subscription: { unsubscribe } } };
      }),
    },
    rpc: vi.fn(async () => ({ data: rows, error: null })),
  };
  return {
    client: client as unknown as LiveSyncClient,
    raw: client,
    unsubscribe,
    emit: (event: string) => callback?.(event, null),
  };
}

/** Runs deferred work synchronously, so a test can await the fetch it starts. */
function immediate() {
  const pending: Promise<unknown>[] = [];
  const schedule = (fn: () => Promise<unknown> | void) => {
    pending.push(Promise.resolve(fn()));
  };
  return { schedule, flush: () => Promise.all(pending.splice(0)) };
}

afterEach(() => vi.restoreAllMocks());

describe('shouldSyncOn', () => {
  it.each(['SIGNED_IN', 'USER_UPDATED', 'TOKEN_REFRESHED'])('syncs on %s', (e) => {
    expect(shouldSyncOn(e)).toBe(true);
  });

  it.each(['INITIAL_SESSION', 'SIGNED_OUT', 'PASSWORD_RECOVERY', 'MFA_CHALLENGE_VERIFIED', ''])(
    'does not sync on %j',
    (e) => {
      expect(shouldSyncOn(e)).toBe(false);
    },
  );

  it('the list is exactly the three events', () => {
    expect([...SYNC_EVENTS]).toEqual(['SIGNED_IN', 'USER_UPDATED', 'TOKEN_REFRESHED']);
  });
});

describe('bookingsFromRows', () => {
  it('maps rows and skips those bookingFromServer rejects', () => {
    const out = bookingsFromRows([
      row(),
      row({ id: 'b2', reference: 'R2', status: 'pending_payment' }),
      row({ id: 'b3', reference: 'R3', ticket_token: null }),
    ]);
    expect(out.map((b) => b.id)).toEqual(['b1']);
    expect(out[0]?.experienceId).toBe(catamaran.id);
  });

  it('is empty for no rows', () => {
    expect(bookingsFromRows([])).toEqual([]);
  });
});

describe('startLiveSync', () => {
  it('demo: a null client subscribes to nothing, fetches nothing and dispatches nothing', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const dispatch = vi.fn();
    const { schedule } = immediate();
    const cleanup = startLiveSync(null, dispatch, schedule);
    expect(dispatch).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });

  it('positive control: a client is fetched on start, subscribed to, and its rows dispatched', async () => {
    const f = fakeClient();
    const dispatch = vi.fn();
    const { schedule, flush } = immediate();
    startLiveSync(f.client, dispatch, schedule);
    await flush();

    expect(f.raw.rpc).toHaveBeenCalledWith('my_bookings');
    expect(f.raw.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]![0]).toMatchObject({
      type: 'mergeServerBookings',
      bookings: [expect.objectContaining({ id: 'b1', experienceId: catamaran.id })],
    });
  });

  it('refetches on SIGNED_IN, USER_UPDATED and TOKEN_REFRESHED only', async () => {
    const f = fakeClient();
    const dispatch = vi.fn();
    const { schedule, flush } = immediate();
    startLiveSync(f.client, dispatch, schedule);
    await flush();
    expect(f.raw.rpc).toHaveBeenCalledTimes(1);

    f.emit('INITIAL_SESSION');
    f.emit('SIGNED_OUT');
    await flush();
    expect(f.raw.rpc).toHaveBeenCalledTimes(1);

    f.emit('SIGNED_IN');
    f.emit('USER_UPDATED');
    f.emit('TOKEN_REFRESHED');
    await flush();
    expect(f.raw.rpc).toHaveBeenCalledTimes(4);
  });

  it('defers the fetch out of the auth callback (supabase-js deadlocks on a call made inside it)', () => {
    const f = fakeClient();
    const deferred: (() => unknown)[] = [];
    startLiveSync(f.client, vi.fn(), (fn) => {
      deferred.push(fn);
    });
    // Nothing runs until the scheduler does, including the start-up fetch.
    f.emit('SIGNED_IN');
    expect(f.raw.rpc).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(2);
  });

  it('does not dispatch when the server has nothing to merge', async () => {
    const f = fakeClient([]);
    const dispatch = vi.fn();
    const { schedule, flush } = immediate();
    startLiveSync(f.client, dispatch, schedule);
    await flush();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not dispatch on an rpc error, and does not throw', async () => {
    const f = fakeClient();
    f.raw.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } } as never);
    const dispatch = vi.fn();
    const { schedule, flush } = immediate();
    startLiveSync(f.client, dispatch, schedule);
    await expect(flush()).resolves.toBeDefined();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('cleanup unsubscribes, and a fetch still in flight does not dispatch afterwards', async () => {
    const f = fakeClient();
    const dispatch = vi.fn();
    const { schedule, flush } = immediate();
    const cleanup = startLiveSync(f.client, dispatch, schedule);
    cleanup();
    await flush();
    expect(f.unsubscribe).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('an event after cleanup schedules nothing', async () => {
    const f = fakeClient();
    const { schedule, flush } = immediate();
    const cleanup = startLiveSync(f.client, vi.fn(), schedule);
    await flush();
    cleanup();
    f.emit('SIGNED_IN');
    await flush();
    expect(f.raw.rpc).toHaveBeenCalledTimes(1);
  });

  it('with no session, the sync returns before calling my_bookings (anon may not execute it)', async () => {
    const f = fakeClient([row()], { signedIn: false });
    const dispatch = vi.fn();
    const { schedule, flush } = immediate();
    startLiveSync(f.client, dispatch, schedule);
    await flush();
    expect(f.raw.auth.getSession).toHaveBeenCalledTimes(1);
    expect(f.raw.rpc).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('a getSession that throws is no session, not a crash', async () => {
    const f = fakeClient();
    f.raw.auth.getSession.mockRejectedValueOnce(new Error('storage unavailable'));
    const { schedule, flush } = immediate();
    startLiveSync(f.client, vi.fn(), schedule);
    await expect(flush()).resolves.toBeDefined();
    expect(f.raw.rpc).not.toHaveBeenCalled();
  });

  it('SIGNED_OUT purges the server bookings from the device', async () => {
    const f = fakeClient();
    const dispatch = vi.fn();
    const { schedule, flush } = immediate();
    startLiveSync(f.client, dispatch, schedule);
    await flush();
    dispatch.mockClear();
    f.emit('SIGNED_OUT');
    expect(dispatch).toHaveBeenCalledWith({ type: 'purgeServerBookings' });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('control: no other event purges', async () => {
    const f = fakeClient([]);
    const dispatch = vi.fn();
    const { schedule, flush } = immediate();
    startLiveSync(f.client, dispatch, schedule);
    for (const e of ['INITIAL_SESSION', 'SIGNED_IN', 'USER_UPDATED', 'TOKEN_REFRESHED']) f.emit(e);
    await flush();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('a sync still in flight when SIGNED_OUT lands does not put the bookings back', async () => {
    const f = fakeClient();
    let release!: () => void;
    f.raw.rpc.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ data: [row()], error: null }))) as never,
    );
    const dispatch = vi.fn();
    const { schedule, flush } = immediate();
    startLiveSync(f.client, dispatch, schedule);
    await vi.waitFor(() => expect(f.raw.rpc).toHaveBeenCalledTimes(1));
    f.emit('SIGNED_OUT');
    release();
    await flush();
    expect(dispatch.mock.calls.map((c) => c[0].type)).toEqual(['purgeServerBookings']);
  });

  it('after SIGNED_OUT, the purge leaves no server booking in the store', () => {
    let s = reducer({ ...initialState(), onboarded: true }, { type: 'mergeServerBookings', bookings: bookingsFromRows([row()]) });
    expect(s.bookings).toHaveLength(1);
    s = reducer(s, { type: 'purgeServerBookings' });
    expect(s.bookings).toEqual([]);
  });
});

describe('findMyBookingRow (BookingReturn)', () => {
  it('demo: null client finds nothing, without a fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await findMyBookingRow('b1', null)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('positive control: reads my_bookings once and returns the matching row', async () => {
    const f = fakeClient([row({ id: 'other', reference: 'R0' }), row()]);
    expect(await findMyBookingRow('b1', f.client)).toEqual(row());
    expect(f.raw.rpc).toHaveBeenCalledTimes(1);
    expect(f.raw.rpc).toHaveBeenCalledWith('my_bookings');
  });

  it('a booking not among the rows, or an rpc failure, is null', async () => {
    const f = fakeClient([row()]);
    expect(await findMyBookingRow('missing', f.client)).toBeNull();
    f.raw.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await findMyBookingRow('b1', f.client)).toBeNull();
  });
});

describe('parseStoredParty', () => {
  it('reads the party Checkout stored', () => {
    expect(parseStoredParty(JSON.stringify({ adults: 2, children: 1, photoPackage: true }), 3)).toEqual({
      adults: 2,
      children: 1,
      photoPackage: true,
    });
  });

  it.each([null, '', 'not json', '{', '"a string"', '42', 'null', '{"adults":"2"}', '{"adults":2}'])(
    'falls back to seats as adults for %j instead of throwing',
    (raw) => {
      expect(() => parseStoredParty(raw, 3)).not.toThrow();
      expect(parseStoredParty(raw, 3)).toEqual({ adults: 3, children: 0, photoPackage: false });
    },
  );
});

/**
 * BookingReturn and the start-up sync can both deliver the same just-paid booking. Whichever
 * lands first, the result must be ONE booking, with the attendee BookingReturn carried through
 * Stripe and the server's real departure.
 */
describe('BookingReturn and sync delivering the same booking', () => {
  const status: BookingStatusResponse = {
    bookingId: 'b1',
    status: 'confirmed',
    reference: 'VIPJ-7M24-83A1',
    experienceId: 'db-experience-uuid',
    availabilitySlotId: 'slot-uuid',
    totalMinor: 24000,
    taxMinor: 3000,
    serviceFeeMinor: 1000,
    subtotalMinor: 20000,
    seats: 2,
    createdAt: '2026-10-20T14:03:11.123+00:00',
    ticketToken: 'tok',
  };
  // Device-derived values that disagree with the server, so an overwrite would show.
  const stored = { slotDate: '2099-01-01T23:59', slotTime: '23:59', party: 'corrupt{', attendee: 'Ana' };
  const deviceIsland = 'island-from-device';

  const fromSync = bookingsFromRows([row()]);
  const base = (): AppState => ({ ...initialState(), onboarded: true });

  function returnDispatches(state: AppState, found: ServerBookingRow | null): AppState {
    let s = reducer(state, returnedBookingAction(found, status, stored, deviceIsland));
    s = reducer(s, { type: 'assignAttendee', bookingId: 'b1', attendeeName: stored.attendee });
    return s;
  }

  it('with the row found, the action is the mapped server row (a plain merge)', () => {
    const action = returnedBookingAction(row(), status, stored, deviceIsland);
    expect(action).toEqual({ type: 'mergeServerBookings', bookings: fromSync });
  });

  it('with no row, the action is the reconstruction, fill-only, server-sourced', () => {
    const action = returnedBookingAction(null, status, stored, deviceIsland);
    expect(action.fillOnly).toBe(true);
    expect(action.bookings[0]).toMatchObject({
      id: 'b1',
      experienceId: 'db-experience-uuid',
      islandId: deviceIsland,
      dateISO: '2099-01-01',
      time: '23:59',
      party: { adults: 2, children: 0, photoPackage: false },
      ticketToken: 'tok',
      status: 'confirmed',
      source: 'server',
    });
  });

  for (const found of [row(), null]) {
    const label = found ? 'row found' : 'row not found';

    it(`${label}: sync first, then BookingReturn — one booking, attendee kept, server departure kept`, () => {
      let s = reducer(base(), { type: 'mergeServerBookings', bookings: fromSync });
      s = returnDispatches(s, found);
      expect(s.bookings).toHaveLength(1);
      expect(s.bookings[0]).toMatchObject({
        id: 'b1',
        attendeeName: 'Ana',
        experienceId: catamaran.id,
        islandId: 'island-jm',
        dateISO: '2026-10-22',
        time: '09:00',
      });
    });

    it(`${label}: BookingReturn first, then sync — one booking, attendee kept, server departure wins`, () => {
      let s = returnDispatches(base(), found);
      s = reducer(s, { type: 'mergeServerBookings', bookings: fromSync });
      expect(s.bookings).toHaveLength(1);
      expect(s.bookings[0]).toMatchObject({
        id: 'b1',
        attendeeName: 'Ana',
        experienceId: catamaran.id,
        islandId: 'island-jm',
        dateISO: '2026-10-22',
        time: '09:00',
      });
    });
  }

  it('control: a reconstruction merged as if from the server WOULD overwrite the real departure', () => {
    const reconstruction = returnedBookingAction(null, status, stored, deviceIsland).bookings[0]!;
    let s = reducer(base(), { type: 'mergeServerBookings', bookings: fromSync });
    s = reducer(s, { type: 'mergeServerBookings', bookings: [reconstruction] });
    expect(s.bookings[0]!.time).toBe('23:59');
  });

  it('control: addBooking, as BookingReturn used to dispatch, duplicates when sync was first', () => {
    let s = reducer(base(), { type: 'mergeServerBookings', bookings: fromSync });
    s = reducer(s, { type: 'addBooking', booking: { ...fromSync[0]!, attendeeName: 'Ana' } });
    expect(s.bookings).toHaveLength(2);
  });
});
