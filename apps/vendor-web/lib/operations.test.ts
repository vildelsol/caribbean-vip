import { describe, expect, it } from 'vitest';
import {
  dayKey,
  demoOperations,
  liveOperations,
  timeLabel,
  toLiveBooking,
  type BookingRow,
} from './operations';
import { COMMISSION_RATE, earningsFor, todaysBookings } from './vendorData';

const JAMAICA = 'America/Jamaica'; // UTC-5, no daylight saving
const NOW = new Date('2026-10-29T15:00:00Z'); // 10:00 on 29 Oct in Jamaica

function row(over: Partial<BookingRow> & { startsAt?: string } = {}): BookingRow {
  const { startsAt = '2026-10-29T14:00:00Z', ...rest } = over;
  return {
    id: 'b1',
    reference: 'VIPJ-1111-A11',
    status: 'confirmed',
    seats: 2,
    subtotal_minor: 20_000,
    discount_minor: 0,
    commission_minor: 2_000,
    experience_id: 'e1',
    experiences: { title: 'Blue Hole Day' },
    availability_slots: { starts_at: startsAt },
    booking_guests: [{ guest_name: 'A. Guest' }],
    vouchers: [{ state: 'issued' }],
    ...rest,
  };
}

const input = (rows: BookingRow[]) => ({
  rows,
  vendorName: 'Blue Lagoon Adventures',
  listingCount: 1,
  timeZone: JAMAICA,
  now: NOW,
});

describe('island wall clock', () => {
  it('puts 02:00 UTC on the previous island day', () => {
    // The reason the day is not cut in UTC: a 21:00 departure would land on tomorrow's manifest.
    expect(dayKey('2026-10-30T02:00:00Z', JAMAICA)).toBe('2026-10-29');
    expect(timeLabel('2026-10-30T02:00:00Z', JAMAICA)).toBe('21:00');
  });

  it('renders midnight as 00:00, not 24:00', () => {
    expect(timeLabel('2026-10-29T05:00:00Z', JAMAICA)).toBe('00:00');
  });
});

describe('toLiveBooking', () => {
  it('takes gross as subtotal less discount and leaves tax and guest fee out', () => {
    const b = toLiveBooking(row({ subtotal_minor: 20_000, discount_minor: 2_000, commission_minor: 1_800 }), JAMAICA);
    expect(b?.grossMinor).toBe(18_000);
    expect(b?.commissionMinor).toBe(1_800);
  });

  it.each(['pending_payment', 'cancelled', 'refunded', 'expired'])(
    'keeps a %s booking off the manifest',
    (status) => {
      expect(toLiveBooking(row({ status }), JAMAICA)).toBeNull();
    },
  );

  it('keeps a confirmed booking on it (positive control for the filter above)', () => {
    expect(toLiveBooking(row({ status: 'confirmed' }), JAMAICA)).not.toBeNull();
  });

  it('marks a redeemed voucher or a completed booking as checked in', () => {
    expect(toLiveBooking(row({ vouchers: [{ state: 'redeemed' }] }), JAMAICA)?.status).toBe('checked-in');
    expect(toLiveBooking(row({ status: 'completed' }), JAMAICA)?.status).toBe('checked-in');
    expect(toLiveBooking(row(), JAMAICA)?.status).toBe('confirmed');
  });

  it('falls back to "Guest" when no guest name was given', () => {
    expect(toLiveBooking(row({ booking_guests: [{ guest_name: '  ' }, { guest_name: null }] }), JAMAICA)?.guestName).toBe('Guest');
    expect(toLiveBooking(row({ booking_guests: [] }), JAMAICA)?.guestName).toBe('Guest');
  });
});

describe('liveOperations', () => {
  it('lists only today, in departure order, and sums real commission', () => {
    const ops = liveOperations(
      input([
        row({ id: 'late', startsAt: '2026-10-29T20:00:00Z' }),
        row({ id: 'early', startsAt: '2026-10-29T13:00:00Z', commission_minor: 1_000 }),
        row({ id: 'yesterday', startsAt: '2026-10-28T14:00:00Z' }),
        row({ id: 'tomorrow', startsAt: '2026-10-30T14:00:00Z' }),
      ]),
    );
    expect(ops.today.map((b) => b.id)).toEqual(['early', 'late']);
    expect(ops.todayEarnings).toMatchObject({
      bookings: 2,
      guests: 4,
      grossMinor: 40_000,
      commissionMinor: 3_000,
      netMinor: 37_000,
    });
  });

  it('puts a late-evening departure on today, not tomorrow', () => {
    const ops = liveOperations(input([row({ id: 'eve', startsAt: '2026-10-30T02:00:00Z' })]));
    expect(ops.today.map((b) => b.id)).toEqual(['eve']);
  });

  it('sums the week over seven island days and drops older and future bookings', () => {
    const ops = liveOperations(
      input([
        row({ id: 'today' }),
        row({ id: 'six-days-ago', startsAt: '2026-10-23T14:00:00Z' }),
        row({ id: 'seven-days-ago', startsAt: '2026-10-22T14:00:00Z' }),
        row({ id: 'tomorrow', startsAt: '2026-10-30T14:00:00Z' }),
      ]),
    );
    expect(ops.week.grossMinor).toBe(40_000);
  });

  it('states the effective platform fee, or null with nothing booked', () => {
    expect(liveOperations(input([row()])).commissionPct).toBe(10);
    expect(liveOperations(input([])).commissionPct).toBeNull();
  });

  it('breaks today down by listing, biggest first', () => {
    const ops = liveOperations(
      input([
        row({ id: 'a', experience_id: 'e1', subtotal_minor: 10_000, commission_minor: 1_000 }),
        row({
          id: 'b',
          experience_id: 'e2',
          experiences: { title: 'Other' },
          subtotal_minor: 30_000,
          commission_minor: 3_000,
        }),
      ]),
    );
    expect(ops.byListing.map((l) => l.title)).toEqual(['Other', 'Blue Hole Day']);
  });
});

describe('demoOperations', () => {
  // Demo output must not move. These read the figures from the original functions, not from the
  // module under test, so a wiring slip shows here.
  it('matches what the screens computed inline before', () => {
    const ops = demoOperations();
    const bookings = todaysBookings();
    const today = earningsFor(bookings);
    expect(ops.today).toEqual(bookings);
    expect(ops.todayEarnings).toEqual(today);
    expect(ops.week.netMinor).toBe(Math.round(today.netMinor * 5.4));
    expect(ops.commissionPct).toBe(Math.round(COMMISSION_RATE * 100));
  });
});
