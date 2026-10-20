/**
 * The `mergeServerBookings` reducer action — live-mode recovery only.
 *
 * Dispatched by live code after `my_bookings()` returns. Demo mode never dispatches it, so these
 * tests pin that it changes nothing it should not: vouchers, version and every other field.
 */

import { describe, expect, it, vi } from 'vitest';

// store.tsx imports the Supabase client (reset signs out in live mode). Pin demo mode so these
// reducer tests never depend on the developer's VITE_SUPABASE_* env.
vi.mock('../lib/supabase', () => ({ supabase: null, isLiveMode: false }));

import { initialState, reducer, type AppState, type Booking } from './store';
import { visibleExperiences } from '../data/catalogue';

const [first, second, third] = visibleExperiences();

function booking(over: Partial<Booking> = {}): Booking {
  return {
    id: 'b-1',
    reference: 'VIPJ-0001',
    experienceId: first!.id,
    islandId: first!.islandId,
    dateISO: '2026-11-02',
    time: '09:00',
    party: { adults: 2, children: 0, photoPackage: false },
    totalMinor: 21360,
    lines: [{ label: 'Adult', quantity: 2, amountMinor: 17800 }],
    taxMinor: 2670,
    serviceFeeMinor: 890,
    subtotalMinor: 17800,
    status: 'confirmed',
    createdAtISO: '2026-10-20T00:00:00.000Z',
    ticketToken: 'tok-1',
    voucherId: null,
    attendeeName: null,
    ...over,
  };
}

function stateWith(over: Partial<AppState> = {}): AppState {
  return {
    ...initialState(),
    vouchers: [
      {
        id: 'v-1',
        promotionId: 'promo-1',
        experienceId: null,
        state: 'available',
        savedAtISO: '2026-10-19T00:00:00.000Z',
        redeemedAtISO: null,
        redeemedBy: null,
      },
    ],
    ...over,
  };
}

describe('mergeServerBookings', () => {
  it('adds server bookings and keeps local-only ones', () => {
    const demo = booking({ id: 'demo-1', reference: 'VIPJ-DEMO' });
    const next = reducer(stateWith({ bookings: [demo] }), {
      type: 'mergeServerBookings',
      bookings: [booking()],
    });
    expect(next.bookings.map((b) => b.id)).toEqual(['demo-1', 'b-1']);
  });

  it('lets the server win for status on a booking the device already holds', () => {
    const next = reducer(stateWith({ bookings: [booking({ attendeeName: 'Sarah' })] }), {
      type: 'mergeServerBookings',
      bookings: [booking({ status: 'cancelled' })],
    });
    expect(next.bookings).toHaveLength(1);
    expect(next.bookings[0]!.status).toBe('cancelled');
    expect(next.bookings[0]!.attendeeName).toBe('Sarah');
  });

  it('removes a booked listing from the day plan, as addBooking does', () => {
    const next = reducer(
      stateWith({ plannedExperienceIds: [first!.id, second!.id, third!.id] }),
      {
        type: 'mergeServerBookings',
        bookings: [
          booking({ id: 'b-1', experienceId: first!.id }),
          booking({ id: 'b-2', reference: 'VIPJ-0002', experienceId: second!.id, status: 'cancelled' }),
        ],
      },
    );
    // A cancelled booking is not a booked listing, so its plan entry stays.
    expect(next.plannedExperienceIds).toEqual([second!.id, third!.id]);
  });

  it('leaves vouchers alone', () => {
    const before = stateWith();
    const next = reducer(before, {
      type: 'mergeServerBookings',
      bookings: [booking({ voucherId: 'v-1' })],
    });
    expect(next.vouchers).toBe(before.vouchers);
  });

  it('changes nothing but bookings and the plan', () => {
    const before = stateWith({ onboarded: true, guestName: 'Devon', savedExperienceIds: ['x'] });
    const next = reducer(before, { type: 'mergeServerBookings', bookings: [booking()] });
    const { bookings: _b1, plannedExperienceIds: _p1, ...restBefore } = before;
    const { bookings: _b2, plannedExperienceIds: _p2, ...restNext } = next;
    expect(restNext).toEqual(restBefore);
    expect(next.version).toBe(before.version);
  });

  it('is idempotent', () => {
    const action = { type: 'mergeServerBookings', bookings: [booking()] } as const;
    const once = reducer(stateWith({ plannedExperienceIds: [first!.id] }), action);
    expect(reducer(once, action)).toEqual(once);
  });

  it('with an empty server list leaves bookings as they were', () => {
    const before = stateWith({ bookings: [booking()] });
    const next = reducer(before, { type: 'mergeServerBookings', bookings: [] });
    expect(next.bookings).toEqual(before.bookings);
  });

  it('a re-sync does not strip a listing re-planned after its booking was already confirmed', () => {
    const action = { type: 'mergeServerBookings', bookings: [booking({ experienceId: first!.id })] } as const;
    // First sync: the booking arrives, the plan entry for that listing goes, as addBooking does.
    let s = reducer(stateWith({ plannedExperienceIds: [first!.id] }), action);
    expect(s.plannedExperienceIds).toEqual([]);
    // The guest plans the same listing again (another day, say).
    s = reducer(s, { type: 'planExperience', experienceId: first!.id });
    // A later sync of the same, already-confirmed booking leaves that plan alone.
    s = reducer(s, action);
    expect(s.plannedExperienceIds).toEqual([first!.id]);
  });

  it('control: a booking that turns confirmed in this merge still clears its plan entry', () => {
    const s = reducer(
      stateWith({ bookings: [booking({ status: 'cancelled' })], plannedExperienceIds: [first!.id] }),
      { type: 'mergeServerBookings', bookings: [booking({ status: 'confirmed' })] },
    );
    expect(s.plannedExperienceIds).toEqual([]);
  });

  it('returns the very same state object when the merge changes nothing', () => {
    const action = { type: 'mergeServerBookings', bookings: [booking()] } as const;
    const once = reducer(stateWith({ plannedExperienceIds: [second!.id] }), action);
    expect(reducer(once, action)).toBe(once);
    expect(reducer(once, { type: 'mergeServerBookings', bookings: [] })).toBe(once);
  });

  it('control: a merge that changes a booking returns a new state', () => {
    const once = reducer(stateWith(), { type: 'mergeServerBookings', bookings: [booking()] });
    const next = reducer(once, { type: 'mergeServerBookings', bookings: [booking({ status: 'cancelled' })] });
    expect(next).not.toBe(once);
    expect(next.bookings[0]!.status).toBe('cancelled');
  });

  it('fillOnly fills empty fields and never overwrites what the device holds', () => {
    const synced = booking({ islandId: 'island-from-server', dateISO: '2026-11-02', time: '09:00', source: 'server' });
    const before = stateWith({ bookings: [synced] });
    const next = reducer(before, {
      type: 'mergeServerBookings',
      fillOnly: true,
      bookings: [booking({ islandId: 'island-from-device', dateISO: '2099-01-01', time: '23:59' })],
    });
    expect(next).toBe(before);
  });
});

describe('purgeServerBookings (sign-out)', () => {
  it('removes the bookings that came from the server and keeps the rest', () => {
    const localOnly = booking({ id: 'local-1', reference: 'VIPJ-LOCAL' });
    const fromServer = booking({ id: 'srv-1', reference: 'VIPJ-SRV', source: 'server' });
    const next = reducer(stateWith({ bookings: [localOnly, fromServer] }), { type: 'purgeServerBookings' });
    expect(next.bookings).toEqual([localOnly]);
  });

  it('leaves everything else alone', () => {
    const before = stateWith({ bookings: [booking({ source: 'server' })], guestName: 'Devon', onboarded: true });
    const next = reducer(before, { type: 'purgeServerBookings' });
    const { bookings: _b1, ...restBefore } = before;
    const { bookings: _b2, ...restNext } = next;
    expect(restNext).toEqual(restBefore);
  });

  it('returns the same state when there is nothing to purge (demo bookings never have a source)', () => {
    const before = stateWith({ bookings: [booking()] });
    expect(reducer(before, { type: 'purgeServerBookings' })).toBe(before);
  });
});
