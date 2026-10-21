/**
 * Server → local booking recovery.
 *
 * A tourist who signs in on a new device gets their bookings back from `my_bookings()`
 * (supabase/migrations/20261021000001_my_bookings.sql). These tests pin the conversion of one of
 * those rows into the local `Booking` shape, and the merge of the recovered list into whatever the
 * device already holds. The merge has one property that outranks the rest: it never loses a
 * booking. A paid booking that disappears from Trips is the failure this whole path exists to fix.
 */

import { describe, expect, it } from 'vitest';
import { demoOptionsFor } from '@cvip/demo';
import { visibleExperiences, ISLANDS } from './catalogue';
import {
  PHOTO_PACKAGE_LABEL,
  bookingFromServer,
  experienceIdForTitle,
  islandIdForCode,
  mergeBookings,
  slotStartsAt,
  slotWallClock,
  type ServerBookingRow,
} from './serverBooking';
import type { Booking } from '../state/store';

const catamaran = visibleExperiences().find((e) => e.title === 'Catamaran Snorkel & Sunset')!;

function row(over: Partial<ServerBookingRow> = {}): ServerBookingRow {
  return {
    id: '7d1f0c1e-0000-4000-8000-000000000001',
    reference: 'VIPJ-7M24-83A1',
    status: 'confirmed',
    seats: 3,
    currency: 'USD',
    subtotal_minor: 23140,
    tax_minor: 3471,
    service_fee_minor: 1157,
    total_minor: 27768,
    created_at: '2026-10-20T14:03:11.123+00:00',
    ticket_token: 'server-token',
    experience_title: 'Catamaran Snorkel & Sunset',
    island_code: 'JM',
    starts_at: '2026-11-02T09:00:00+00:00',
    guests: [
      { kind: 'adult', label: 'Adult', quantity: 2, unit_amount_minor: 8900 },
      { kind: 'child', label: 'Child (4–11)', quantity: 1, unit_amount_minor: 5340 },
    ],
    ...over,
  };
}

function local(over: Partial<Booking> = {}): Booking {
  return {
    id: '7d1f0c1e-0000-4000-8000-000000000001',
    reference: 'VIPJ-7M24-83A1',
    experienceId: catamaran.id,
    islandId: 'island-jm',
    dateISO: '2026-11-02',
    time: '09:00',
    party: { adults: 2, children: 1, photoPackage: true },
    totalMinor: 1,
    lines: [
      { label: 'Adult', quantity: 2, amountMinor: 17800 },
      { label: 'Child (4–11)', quantity: 1, amountMinor: 5340 },
      { label: 'Photo package', quantity: 1, amountMinor: 1500 },
    ],
    taxMinor: 1,
    serviceFeeMinor: 1,
    subtotalMinor: 1,
    status: 'confirmed',
    createdAtISO: '2026-10-20T14:03:00.000Z',
    ticketToken: 'local-token',
    voucherId: 'voucher-1',
    attendeeName: 'Marcus',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Slot time
// ---------------------------------------------------------------------------

describe('slot wall-clock', () => {
  it('reads a UTC starts_at as the wall-clock date and time', () => {
    expect(slotWallClock('2026-11-02T09:00:00+00:00')).toEqual({ dateISO: '2026-11-02', time: '09:00' });
  });

  it('normalises an offset timestamp to UTC wall-clock, as resolve-slot writes it', () => {
    expect(slotWallClock('2026-11-02T04:30:00-05:00')).toEqual({ dateISO: '2026-11-02', time: '09:30' });
    expect(slotWallClock('2026-11-02T09:00:00Z')).toEqual({ dateISO: '2026-11-02', time: '09:00' });
  });

  it('builds the same starts_at string resolve-slot builds', () => {
    // supabase/functions/resolve-slot/index.ts: `${date}T${time}:00+00:00`
    expect(slotStartsAt('2026-11-02', '09:00')).toBe('2026-11-02T09:00:00+00:00');
  });

  it('round-trips: local → resolve-slot formula → server → local', () => {
    for (const [dateISO, time] of [
      ['2026-11-02', '09:00'],
      ['2026-12-31', '23:30'],
      ['2027-01-01', '00:00'],
      ['2026-03-08', '02:15'],
    ] as const) {
      expect(slotWallClock(slotStartsAt(dateISO, time))).toEqual({ dateISO, time });
    }
  });

  it('degrades an unparseable starts_at to empty strings rather than throwing', () => {
    expect(slotWallClock('not a date')).toEqual({ dateISO: '', time: '' });
    expect(slotWallClock(null)).toEqual({ dateISO: '', time: '' });
  });
});

// ---------------------------------------------------------------------------
// Catalogue mapping
// ---------------------------------------------------------------------------

describe('catalogue mapping', () => {
  it('maps a DB title back to the local catalogue id', () => {
    expect(experienceIdForTitle('Catamaran Snorkel & Sunset')).toBe(catamaran.id);
  });

  it('maps every visible listing title back to its own id', () => {
    for (const e of visibleExperiences()) expect(experienceIdForTitle(e.title)).toBe(e.id);
  });

  it('gives an unknown title a stable placeholder id instead of dropping it', () => {
    const id = experienceIdForTitle('A Listing Added After This Build');
    expect(id).toBeTruthy();
    expect(visibleExperiences().some((e) => e.id === id)).toBe(false);
    expect(experienceIdForTitle('A Listing Added After This Build')).toBe(id);
  });

  it('maps an island code to the local island id', () => {
    expect(islandIdForCode('JM')).toBe('island-jm');
    for (const i of ISLANDS) expect(islandIdForCode(i.code)).toBe(i.id);
  });

  it('maps an island code the catalogue does not carry to the same id format', () => {
    expect(islandIdForCode('AG')).toBe('island-ag');
    expect(islandIdForCode('zz')).toBe('island-zz');
  });
});

// ---------------------------------------------------------------------------
// bookingFromServer
// ---------------------------------------------------------------------------

describe('bookingFromServer', () => {
  it('converts a confirmed row into a local booking', () => {
    const b = bookingFromServer(row())!;
    expect(b).toEqual<Booking>({
      id: '7d1f0c1e-0000-4000-8000-000000000001',
      reference: 'VIPJ-7M24-83A1',
      experienceId: catamaran.id,
      islandId: 'island-jm',
      dateISO: '2026-11-02',
      time: '09:00',
      party: { adults: 2, children: 1, photoPackage: false },
      totalMinor: 27768,
      lines: [
        { label: 'Adult', quantity: 2, amountMinor: 17800 },
        { label: 'Child (4–11)', quantity: 1, amountMinor: 5340 },
      ],
      taxMinor: 3471,
      serviceFeeMinor: 1157,
      subtotalMinor: 23140,
      status: 'confirmed',
      createdAtISO: '2026-10-20T14:03:11.123+00:00',
      ticketToken: 'server-token',
      voucherId: null,
      attendeeName: null,
      source: 'server',
    });
  });

  it('maps completed to confirmed', () => {
    expect(bookingFromServer(row({ status: 'completed' }))!.status).toBe('confirmed');
  });

  it('maps cancelled and refunded to cancelled, and keeps them even without a token', () => {
    for (const status of ['cancelled', 'refunded'] as const) {
      const b = bookingFromServer(row({ status, ticket_token: null }));
      expect(b).not.toBeNull();
      expect(b!.status).toBe('cancelled');
      expect(b!.ticketToken).toBe('');
    }
  });

  it('a cancelled or refunded row never carries a scannable token, even if the server sent one', () => {
    for (const status of ['cancelled', 'refunded'] as const) {
      expect(bookingFromServer(row({ status, ticket_token: 'leaked-token' }))!.ticketToken).toBe('');
    }
  });

  it('skips a confirmed row with no ticket token — there is nothing to show at the gate yet', () => {
    expect(bookingFromServer(row({ ticket_token: null }))).toBeNull();
    expect(bookingFromServer(row({ status: 'completed', ticket_token: '' }))).toBeNull();
  });

  it('skips pending_payment and expired rows if they ever arrive', () => {
    expect(bookingFromServer(row({ status: 'pending_payment' }))).toBeNull();
    expect(bookingFromServer(row({ status: 'expired' }))).toBeNull();
  });

  it('still produces a booking for an unknown experience title — a paid booking is never dropped', () => {
    const b = bookingFromServer(row({ experience_title: 'Brand New Listing' }));
    expect(b).not.toBeNull();
    expect(b!.experienceId).toBe(experienceIdForTitle('Brand New Listing'));
    expect(b!.totalMinor).toBe(27768);
  });

  it('only the photo package add-on sets photoPackage, matched by its catalogue label', () => {
    const withAddon = (label: string) =>
      bookingFromServer(
        row({ guests: [{ kind: 'adult', label: 'Adult', quantity: 1, unit_amount_minor: 8900 }, { kind: 'addon', label, quantity: 1, unit_amount_minor: 2000 }] }),
      )!;
    expect(withAddon('Photo package').party.photoPackage).toBe(true);
    expect(withAddon(' photo PACKAGE ').party.photoPackage).toBe(true);
    // Another add-on is still itemised, but it is not the photo package.
    expect(withAddon('Lunch upgrade').party.photoPackage).toBe(false);
    expect(withAddon('Lunch upgrade').lines.at(-1)).toEqual({ label: 'Lunch upgrade', quantity: 1, amountMinor: 2000 });
  });

  it('the label matched is the one the catalogue (and the seed) gives the photo add-on', () => {
    for (const e of visibleExperiences()) {
      const addon = demoOptionsFor(e).find((o) => o.kind === 'addon');
      expect(addon?.label).toBe(PHOTO_PACKAGE_LABEL);
    }
  });

  it('builds the party from guest kinds: addon is the photo package, infants count as children', () => {
    const b = bookingFromServer(
      row({
        guests: [
          { kind: 'adult', label: 'Adult', quantity: 1, unit_amount_minor: 8900 },
          { kind: 'infant', label: 'Infant', quantity: 1, unit_amount_minor: 0 },
          { kind: 'child', label: 'Child', quantity: 2, unit_amount_minor: 5340 },
          { kind: 'addon', label: 'Photo package', quantity: 1, unit_amount_minor: 1500 },
        ],
      }),
    )!;
    expect(b.party).toEqual({ adults: 1, children: 3, photoPackage: true });
    expect(b.lines.at(-1)).toEqual({ label: 'Photo package', quantity: 1, amountMinor: 1500 });
  });

  it('falls back to seats as adults when the server has no guest rows', () => {
    const b = bookingFromServer(row({ guests: [], seats: 4 }))!;
    expect(b.party).toEqual({ adults: 4, children: 0, photoPackage: false });
    expect(b.lines).toEqual([]);
  });

  it('accepts bigint columns serialised as strings', () => {
    const b = bookingFromServer(
      row({ total_minor: '27768' as unknown as number, tax_minor: '3471' as unknown as number }),
    )!;
    expect(b.totalMinor).toBe(27768);
    expect(b.taxMinor).toBe(3471);
  });
});

// ---------------------------------------------------------------------------
// mergeBookings
// ---------------------------------------------------------------------------

describe('mergeBookings', () => {
  const server = () => bookingFromServer(row())!;

  it('lets the server win for status, ticket token, reference and totals', () => {
    const [merged] = mergeBookings(
      [local({ status: 'confirmed', reference: 'VIPJ-OLD-REF' })],
      [bookingFromServer(row({ status: 'completed', ticket_token: 'server-token' }))!],
    );
    expect(merged!.status).toBe('confirmed');
    expect(merged!.ticketToken).toBe('server-token');
    expect(merged!.reference).toBe('VIPJ-7M24-83A1');
    expect(merged!.totalMinor).toBe(27768);
    expect(merged!.subtotalMinor).toBe(23140);
    expect(merged!.taxMinor).toBe(3471);
    expect(merged!.serviceFeeMinor).toBe(1157);
  });

  it('keeps the local attendee, voucher, party and lines', () => {
    const l = local();
    const [merged] = mergeBookings([l], [server()]);
    expect(merged!.attendeeName).toBe('Marcus');
    expect(merged!.voucherId).toBe('voucher-1');
    expect(merged!.party).toEqual(l.party);
    expect(merged!.lines).toEqual(l.lines);
  });

  it('takes the server party and lines when the local copy has no itemisation', () => {
    // BookingReturn reconstructs a live booking with `lines: []` and a seats-only party guess.
    const [merged] = mergeBookings(
      [local({ lines: [], party: { adults: 3, children: 0, photoPackage: false } })],
      [server()],
    );
    expect(merged!.lines).toEqual(server().lines);
    expect(merged!.party).toEqual(server().party);
  });

  it('clears the local token when the server says cancelled or refunded — no scannable ticket survives', () => {
    for (const status of ['cancelled', 'refunded'] as const) {
      const [merged] = mergeBookings(
        [local({ ticketToken: 'local-token' })],
        [bookingFromServer(row({ status, ticket_token: null }))!],
      );
      expect(merged!.status).toBe('cancelled');
      expect(merged!.ticketToken).toBe('');
    }
  });

  it('control: keeps the local token when a confirmed server row has an empty one', () => {
    const s = { ...bookingFromServer(row())!, ticketToken: '' };
    const [merged] = mergeBookings([local({ ticketToken: 'local-token' })], [s]);
    expect(merged!.ticketToken).toBe('local-token');
  });

  it('marks a merged booking as server-sourced', () => {
    const [merged] = mergeBookings([local()], [server()]);
    expect(merged!.source).toBe('server');
  });

  it('returns the very same local object when the server changes nothing', () => {
    const once = mergeBookings([local()], [server()]);
    const twice = mergeBookings(once, [server()]);
    expect(twice[0]).toBe(once[0]);
  });

  it('replaces a local experience id the catalogue does not know with the mapped one', () => {
    // BookingReturn stores the DB experience uuid as `experienceId`.
    const [merged] = mergeBookings([local({ experienceId: 'uuid-from-booking-status' })], [server()]);
    expect(merged!.experienceId).toBe(catamaran.id);
  });

  it('keeps the local experience id when the server title is unknown', () => {
    const [merged] = mergeBookings(
      [local()],
      [bookingFromServer(row({ experience_title: 'Renamed By The Vendor' }))!],
    );
    expect(merged!.experienceId).toBe(catamaran.id);
  });

  it('matches by reference when the ids differ and the local booking has no server source', () => {
    const merged = mergeBookings([local({ id: 'local-id' })], [server()]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.ticketToken).toBe('server-token');
    // It takes the server id and source, so the next sync matches it by id, not into a duplicate.
    expect(merged[0]!.id).toBe(server().id);
    expect(merged[0]!.source).toBe('server');
    expect(mergeBookings(merged, [server()])).toEqual(merged);
  });

  it('does NOT match by reference a local booking that is itself from the server', () => {
    // Two server bookings are told apart by id. A reference collision between them must not fold
    // one into the other.
    const other = local({ id: 'other-server-id', source: 'server' });
    const merged = mergeBookings([other], [server()]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(other);
  });

  it('never removes a local-only booking', () => {
    const demo = local({ id: 'demo-1', reference: 'VIPJ-DEMO-0001' });
    const merged = mergeBookings([demo], [server()]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual(demo);
  });

  it('appends server-only bookings', () => {
    const merged = mergeBookings([], [server()]);
    expect(merged).toEqual([server()]);
  });

  it('collapses duplicate server rows for the same booking', () => {
    expect(mergeBookings([], [server(), server()])).toHaveLength(1);
  });

  it('is idempotent', () => {
    const l = [local(), local({ id: 'demo-1', reference: 'VIPJ-DEMO-0001' })];
    const s = [server(), bookingFromServer(row({ id: 'srv-2', reference: 'VIPJ-SRV-0002' }))!];
    const once = mergeBookings(l, s);
    expect(mergeBookings(once, s)).toEqual(once);
  });

  describe('fill-only (BookingReturn reconstruction, not a server row)', () => {
    const reconstruction = (): Booking => ({
      ...local({ attendeeName: null, voucherId: null }),
      islandId: 'island-from-device',
      dateISO: '2099-01-01',
      time: '23:59',
      lines: [],
      ticketToken: 'return-token',
      source: 'server',
    });

    it('does not overwrite real server values the device already holds', () => {
      const fromSync = server();
      const [merged] = mergeBookings([fromSync], [reconstruction()], { fillOnly: true });
      expect(merged).toBe(fromSync);
    });

    it('fills only fields that are still empty locally', () => {
      const partial = { ...server(), time: '', lines: [] };
      const [merged] = mergeBookings([partial], [reconstruction()], { fillOnly: true });
      expect(merged!.time).toBe('23:59');
      expect(merged!.dateISO).toBe(partial.dateISO);
      expect(merged!.islandId).toBe(partial.islandId);
      expect(merged!.lines).toEqual([]);
      expect(merged!.ticketToken).toBe('server-token');
    });

    it('control: with nothing local, the reconstruction is added', () => {
      expect(mergeBookings([], [reconstruction()], { fillOnly: true })).toEqual([reconstruction()]);
    });
  });

  it('does not mutate its inputs', () => {
    const l = [local({ lines: [] })];
    const s = [server()];
    const lCopy = structuredClone(l);
    const sCopy = structuredClone(s);
    mergeBookings(l, s);
    expect(l).toEqual(lCopy);
    expect(s).toEqual(sCopy);
  });
});

// ---------------------------------------------------------------------------
// Property: the count never drops, and the merge is idempotent, for any input
// ---------------------------------------------------------------------------

/** Same PRNG as journey.test.ts. Fixed seed, so a failure is replayable. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

describe('mergeBookings — seeded property run', () => {
  const RUNS = 400;
  const rng = mulberry32(20261021);
  const titles = [...visibleExperiences().map((e) => e.title), 'Unknown Listing'];
  const statuses = ['confirmed', 'completed', 'cancelled', 'refunded', 'pending_payment', 'expired'] as const;

  it(`holds for ${RUNS} random device/server pairs`, () => {
    let overlaps = 0;
    let serverOnly = 0;
    let localOnly = 0;

    for (let run = 0; run < RUNS; run += 1) {
      // A pool of ids shared between the two sides, so overlap genuinely happens.
      const pool = Array.from({ length: 8 }, (_, i) => `b-${run}-${i}`);

      const rows: ServerBookingRow[] = [];
      for (let i = 0, n = Math.floor(rng() * 6); i < n; i += 1) {
        const id = pick(rng, pool);
        // `bookings.id` is a primary key, so the server never returns one id twice.
        if (rows.some((r) => r.id === id)) continue;
        rows.push(
          row({
            id,
            reference: `REF-${id}`,
            status: pick(rng, statuses),
            ticket_token: rng() < 0.15 ? null : `tok-${id}-${Math.floor(rng() * 3)}`,
            experience_title: pick(rng, titles),
            total_minor: Math.floor(rng() * 50000),
            starts_at: slotStartsAt(`2026-11-${String(1 + Math.floor(rng() * 28)).padStart(2, '0')}`, pick(rng, ['09:00', '13:30', '17:00'])),
            guests: rng() < 0.3 ? [] : row().guests,
          }),
        );
      }
      const server = rows.map(bookingFromServer).filter((b): b is Booking => b !== null);

      const device: Booking[] = [];
      for (let i = 0, n = Math.floor(rng() * 6); i < n; i += 1) {
        const id = pick(rng, pool);
        if (device.some((b) => b.id === id)) continue;
        device.push(
          local({
            id,
            // Some local copies carry a stale reference and are matched only by id.
            reference: rng() < 0.2 ? `OLD-${id}` : `REF-${id}`,
            lines: rng() < 0.4 ? [] : local().lines,
            attendeeName: rng() < 0.5 ? null : pick(rng, ['Sarah', 'Devon']),
            status: rng() < 0.2 ? 'cancelled' : 'confirmed',
          }),
        );
      }

      const merged = mergeBookings(device, server);
      const serverIds = new Set(server.map((b) => b.id));
      const deviceIds = new Set(device.map((b) => b.id));

      // Count never drops below either side.
      expect(merged.length).toBeGreaterThanOrEqual(device.length);
      expect(merged.length).toBeGreaterThanOrEqual(serverIds.size);
      // Exactly the union, no duplicates.
      expect(new Set(merged.map((b) => b.id))).toEqual(new Set([...deviceIds, ...serverIds]));
      expect(merged.length).toBe(new Set([...deviceIds, ...serverIds]).size);
      // Every local booking is still there, attendee intact.
      for (const d of device) {
        const m = merged.find((b) => b.id === d.id)!;
        expect(m.attendeeName).toBe(d.attendeeName);
        expect(m.voucherId).toBe(d.voucherId);
      }
      // Server wins on status and totals for every overlap.
      for (const s of server) {
        const m = merged.find((b) => b.id === s.id)!;
        expect(m.status).toBe(s.status);
        expect(m.totalMinor).toBe(s.totalMinor);
      }
      // Idempotent.
      expect(mergeBookings(merged, server)).toEqual(merged);

      overlaps += [...deviceIds].filter((id) => serverIds.has(id)).length;
      serverOnly += [...serverIds].filter((id) => !deviceIds.has(id)).length;
      localOnly += [...deviceIds].filter((id) => !serverIds.has(id)).length;
    }

    // The run must actually exercise every branch, or it proves nothing.
    expect(overlaps).toBeGreaterThan(50);
    expect(serverOnly).toBeGreaterThan(50);
    expect(localOnly).toBeGreaterThan(50);
  });
});
