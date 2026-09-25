/**
 * Five hundred customers, walked end to end.
 *
 * Every other test in this repo asserts one rule about one function. This one asserts the rules
 * that are only visible *across* a whole journey — browse, choose a day, choose a departure, size
 * the party, hit the clash gate, pay, then cancel or reschedule or hand the ticket to someone else
 * — because that is where the double-booking defect lived. Each individual step was correct. The
 * sequence was not, and nothing was looking at the sequence.
 *
 * Three properties make this worth having rather than decorative:
 *
 *  - **It drives the real reducer.** Bookings are committed through `reducer` from `state/store`,
 *    the same state machine the app runs, not a stand-in that could drift from it.
 *  - **It is deterministic.** `mulberry32` from a fixed seed, so a failure is reproducible and a
 *    regression reported here can be replayed exactly. A flaky simulation teaches nobody anything.
 *  - **It asserts invariants, not outcomes.** It does not check that customer 219 was quoted
 *    US$142.80; it checks that *no* customer was ever quoted a total that disagreed with the
 *    itemisation, left holding two overlapping bookings under one name, or shown an empty name on
 *    a ticket. Outcomes change when the catalogue does; these should not.
 */

import { describe, expect, it } from 'vitest';
import {
  ISLANDS,
  allInFromMinor,
  destinationsFor,
  experienceById,
  experiencesFor,
  priceFor,
  seatsIn,
  type DemoExperience,
  type PartySelection,
} from './catalogue';
import { daysFor, formatClock, slotsFor, slotOn } from './availability';
import { minutesOfTime } from './itinerary';
import {
  attendeeLabel,
  describeClash,
  findBookingClashes,
  sameAttendee,
} from './bookingClash';
import { initialState, reducer, type AppState, type Booking } from '../state/store';

const JOURNEYS = 500;

/** A small deterministic PRNG. Same seed, same five hundred customers, on every machine. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['Sarah', 'Marcus', 'Amara', 'Devon', 'Yanique', 'Elliot'];

interface Finding {
  journey: number;
  rule: string;
  detail: string;
}

/** What the run actually exercised, so a simulation that quietly stopped working cannot pass. */
interface Coverage {
  islands: Set<string>;
  booked: number;
  clashesRaised: number;
  clashesResolvedByReassigning: number;
  clashesAcceptedAnyway: number;
  abandonedOnClash: number;
  bookedForPartner: number;
  cancelled: number;
  reassigned: number;
  rescheduled: number;
  anonymousGuests: number;
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

/** Commits a booking the way `createBooking` does, minus the async token signing. */
function commit(
  state: AppState,
  seq: number,
  experience: DemoExperience,
  dateISO: string,
  time: string,
  party: PartySelection,
  attendeeName: string | null,
  totalMinor: number,
  subtotalMinor: number,
  taxMinor: number,
  serviceFeeMinor: number,
  lines: Booking['lines'],
  voucherId: string | null,
): AppState {
  const booking: Booking = {
    id: `sim-${seq}`,
    reference: `VIPX-SIM-${seq}`,
    experienceId: experience.id,
    islandId: experience.islandId,
    dateISO,
    time,
    party,
    totalMinor,
    lines,
    taxMinor,
    serviceFeeMinor,
    subtotalMinor,
    status: 'confirmed',
    createdAtISO: new Date(2026, 9, 1).toISOString(),
    ticketToken: `tok-${seq}`,
    voucherId,
    attendeeName,
  };
  return reducer(state, { type: 'addBooking', booking });
}

/**
 * One customer.
 *
 * The behavioural choices — how many things they book, whether they are booking for a partner,
 * whether they accept a clash warning or back out of it — are drawn from the RNG, so across five
 * hundred runs every branch of the gate is exercised without any of them being hand-written.
 */
function runJourney(n: number, rng: () => number, findings: Finding[], cov: Coverage): void {
  const fail = (rule: string, detail: string) => findings.push({ journey: n, rule, detail });

  const island = pick(rng, ISLANDS);
  cov.islands.add(island.id);
  const destinations = destinationsFor(island.id);
  if (destinations.length === 0) {
    fail('island has destinations', `${island.in_app_brand} has none`);
    return;
  }

  const guestName = rng() < 0.75 ? pick(rng, NAMES) : '';
  if (!guestName) cov.anonymousGuests++;
  let state: AppState = {
    ...initialState(),
    islandId: island.id,
    destinationSlug: pick(rng, destinations).slug,
    guestName,
    onboarded: true,
  };

  const catalogue = experiencesFor(island.id);
  if (catalogue.length === 0) {
    fail('island has listings', `${island.in_app_brand} has none`);
    return;
  }

  // A couple shares one account and books separately for each other. This is the case that must
  // not be warned about, and it is common enough to be a third of the runs.
  const partner = rng() < 0.35 ? pick(rng, NAMES.filter((x) => x !== guestName)) : null;

  const attempts = 1 + Math.floor(rng() * 4);
  let seq = 0;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const experience = pick(rng, catalogue);
    const days = daysFor(experience).filter((d) => d.hasAvailability);
    if (days.length === 0) continue;

    const day = pick(rng, days);
    const slots = slotsFor(experience, day.iso).filter((s) => s.capacityRemaining > 0);
    if (slots.length === 0) {
      fail(
        'a day marked bookable has a bookable departure',
        `${experience.title} on ${day.iso} says it has availability but every departure is full`,
      );
      continue;
    }

    const slot = pick(rng, slots);
    const resolved = slotOn(experience, day.iso, slot.time);
    if (!resolved) {
      fail('a listed departure can be resolved', `${experience.title} ${day.iso} ${slot.time}`);
      continue;
    }
    if (resolved.capacityRemaining !== slot.capacityRemaining) {
      fail(
        'availability is stable within a render',
        `${experience.title} ${day.iso} ${slot.time}: list says ${slot.capacityRemaining}, lookup says ${resolved.capacityRemaining}`,
      );
    }

    const adults = 1 + Math.floor(rng() * 3);
    const children = rng() < 0.3 ? 1 + Math.floor(rng() * 2) : 0;
    const party: PartySelection = { adults, children, photoPackage: rng() < 0.25 };

    const quote = priceFor(experience, party, slot.capacityRemaining);

    if (!quote.ok) {
      // The only legitimate refusals are a party that does not fit and a party of nobody.
      if (seatsIn(party) > slot.capacityRemaining) {
        if (quote.code !== 'capacity') {
          fail('an over-capacity party is refused as capacity', `${experience.title}: ${quote.code}`);
        }
        if (/Only 1 places/.test(quote.message)) {
          fail('the capacity message agrees in number', quote.message);
        }
      } else {
        fail(
          'a party that fits is always quotable',
          `${experience.title} ${day.iso} ${slot.time}: ${seatsIn(party)} of ${slot.capacityRemaining} refused as ${quote.code}`,
        );
      }
      continue;
    }

    const b = quote.breakdown;

    // --- Money -------------------------------------------------------------
    const summed = b.lines.reduce((acc, l) => acc + l.lineTotal.amountMinor, 0);
    if (summed !== b.subtotal.amountMinor) {
      fail('the itemisation adds up to the subtotal', `${summed} vs ${b.subtotal.amountMinor}`);
    }
    if (b.total.amountMinor <= 0) {
      fail('a total is a positive amount', `${experience.title}: ${b.total.amountMinor}`);
    }
    if (!Number.isInteger(b.total.amountMinor)) {
      fail('money stays in integer minor units', `${experience.title}: ${b.total.amountMinor}`);
    }
    const oneAdult = priceFor(experience, { adults: 1, children: 0, photoPackage: false }, 99);
    if (oneAdult.ok && oneAdult.breakdown.total.amountMinor !== allInFromMinor(experience)) {
      fail(
        'the price advertised is the price charged',
        `${experience.title}: browse ${allInFromMinor(experience)}, checkout ${oneAdult.breakdown.total.amountMinor}`,
      );
    }

    // --- The clash gate ----------------------------------------------------
    let attendee: string | null =
      partner && rng() < 0.5 ? partner : null;

    let clashes = findBookingClashes(
      { experienceId: experience.id, dateISO: day.iso, time: slot.time, attendeeName: attendee },
      state.bookings,
    );

    if (clashes.length > 0) {
      cov.clashesRaised++;
      const clash = clashes[0]!;
      const message = describeClash(clash, attendeeLabel(attendee, guestName));

      if (!message.headline.trim() || !message.detail.trim()) {
        fail('the warning says something', JSON.stringify(message));
      }
      if (/undefined|null|NaN/.test(message.detail)) {
        fail('the warning holds no placeholder', message.detail);
      }
      if (/-\d/.test(message.detail)) {
        fail('the warning states no negative duration', message.detail);
      }
      if (/\b([01]?\d|2[0-3]):[0-5]\d(?!\s?(AM|PM))/.test(message.detail)) {
        fail('the warning uses the app clock format', message.detail);
      }

      const choice = rng();
      if (choice < 0.4) {
        // Backs out and picks another day. Nothing is committed.
        cov.abandonedOnClash++;
        continue;
      }
      if (choice < 0.75 && partner) {
        // Says it is for the other person — the couple's answer.
        attendee = attendee === partner ? null : partner;
        clashes = findBookingClashes(
          { experienceId: experience.id, dateISO: day.iso, time: slot.time, attendeeName: attendee },
          state.bookings,
        );
        if (clashes.length > 0 && clashes[0]!.kind === 'overlap') {
          // Reassigning must actually resolve an overlap against a differently-named person.
          const stillSame = clashes.some((c) => sameAttendee(c.existing.attendeeName, attendee));
          if (!stillSame) {
            fail('reassigning resolves the overlap it was offered for', `${experience.title}`);
          }
        }
        if (clashes.length === 0) cov.clashesResolvedByReassigning++;
        if (clashes.length > 0) continue;
      }
      // Otherwise: books it anyway, deliberately. That is allowed and is recorded below.
      if (clashes.length > 0) cov.clashesAcceptedAnyway++;
    }

    const acceptedClash = clashes.length > 0;

    state = commit(
      state,
      seq++,
      experience,
      day.iso,
      slot.time,
      party,
      attendee,
      b.total.amountMinor,
      b.subtotal.amountMinor,
      b.tax.amountMinor,
      b.serviceFee.amountMinor,
      b.lines.map((l) => ({
        label: l.label,
        quantity: l.quantity,
        amountMinor: l.lineTotal.amountMinor,
      })),
      null,
    );

    cov.booked++;
    if (attendee) cov.bookedForPartner++;
    const committed = state.bookings[state.bookings.length - 1]!;

    // --- What the guest is shown afterwards --------------------------------
    const label = attendeeLabel(committed.attendeeName, guestName);
    if (!label.trim()) {
      fail('a ticket always names someone', `booking ${committed.id}`);
    }
    if (label === 'Guest' && guestName.trim()) {
      fail('a named account holder is never printed as "Guest"', `guestName=${guestName}`);
    }
    if (!/^\d{1,2}:\d{2} (AM|PM)$/.test(formatClock(committed.time))) {
      fail('the ticket clock is 12-hour', formatClock(committed.time));
    }

    // A booking the guest was never warned about must not overlap anything of theirs.
    if (!acceptedClash) {
      const others = state.bookings.filter(
        (o) => o.id !== committed.id && o.status === 'confirmed',
      );
      for (const other of others) {
        if (other.dateISO !== committed.dateISO) continue;
        if (!sameAttendee(other.attendeeName, committed.attendeeName)) continue;
        const otherExp = experienceById(other.experienceId);
        if (!otherExp) continue;
        const aStart = minutesOfTime(committed.time);
        const aEnd = aStart + experience.durationMinutes;
        const bStart = minutesOfTime(other.time);
        const bEnd = bStart + otherExp.durationMinutes;
        if (aStart < bEnd && bStart < aEnd) {
          fail(
            'no silent double booking',
            `${label} holds ${experience.title} at ${committed.time} and ${otherExp.title} at ${other.time} on ${other.dateISO}, unwarned`,
          );
        }
      }
    }

    // --- Later life of the booking -----------------------------------------
    const after = rng();
    if (after < 0.15) {
      state = reducer(state, { type: 'cancelBooking', bookingId: committed.id });
      cov.cancelled++;
      const cancelled = state.bookings.find((x) => x.id === committed.id)!;
      if (cancelled.status !== 'cancelled') {
        fail('a cancellation cancels', committed.id);
      }
      // A cancelled booking frees the time it was holding.
      const stillClashes = findBookingClashes(
        {
          experienceId: committed.experienceId,
          dateISO: committed.dateISO,
          time: committed.time,
          attendeeName: committed.attendeeName,
        },
        state.bookings,
      );
      if (stillClashes.some((c) => c.existing.id === committed.id)) {
        fail('a cancelled booking stops blocking its slot', committed.id);
      }
    } else if (after < 0.3) {
      // Hands the ticket to someone else after the fact.
      const to = pick(rng, NAMES);
      state = reducer(state, {
        type: 'assignAttendee',
        bookingId: committed.id,
        attendeeName: to,
      });
      cov.reassigned++;
      const reassigned = state.bookings.find((x) => x.id === committed.id)!;
      if (reassigned.attendeeName !== to) {
        fail('handing a ticket over changes the name', `${committed.id} -> ${to}`);
      }
      if (reassigned.ticketToken !== committed.ticketToken) {
        fail('handing a ticket over does not re-issue the code', committed.id);
      }
      if (reassigned.totalMinor !== committed.totalMinor) {
        fail('handing a ticket over is not a repricing', committed.id);
      }
    } else if (after < 0.4) {
      const otherDay = days.find((d) => d.iso !== day.iso);
      if (otherDay) {
        state = reducer(state, {
          type: 'rescheduleBooking',
          bookingId: committed.id,
          dateISO: otherDay.iso,
          time: slot.time,
        });
        cov.rescheduled++;
        const moved = state.bookings.find((x) => x.id === committed.id)!;
        if (moved.dateISO !== otherDay.iso) fail('a reschedule moves the day', committed.id);
        if (moved.totalMinor !== committed.totalMinor) {
          fail('a reschedule is not a repricing', committed.id);
        }
      }
    }
  }

  // --- End of journey ------------------------------------------------------
  for (const b of state.bookings) {
    if (b.attendeeName !== null && b.attendeeName.trim() === '') {
      fail('an attendee is a name or nothing, never blank', b.id);
    }
    if (!b.reference.trim() || !b.ticketToken.trim()) {
      fail('every booking carries a reference and a token', b.id);
    }
    if (b.subtotalMinor + b.taxMinor + b.serviceFeeMinor !== b.totalMinor) {
      fail(
        'the frozen total still equals its frozen parts',
        `${b.id}: ${b.subtotalMinor}+${b.taxMinor}+${b.serviceFeeMinor} != ${b.totalMinor}`,
      );
    }
  }
}

describe(`${JOURNEYS} customer journeys`, () => {
  const findings: Finding[] = [];
  const cov: Coverage = {
    islands: new Set(),
    booked: 0,
    clashesRaised: 0,
    clashesResolvedByReassigning: 0,
    clashesAcceptedAnyway: 0,
    abandonedOnClash: 0,
    bookedForPartner: 0,
    cancelled: 0,
    reassigned: 0,
    rescheduled: 0,
    anonymousGuests: 0,
  };
  const rng = mulberry32(20260924);
  for (let n = 0; n < JOURNEYS; n++) runJourney(n, rng, findings, cov);

  it('completes without breaking a single rule', () => {
    // Grouped by rule so a failure reports *what* broke and how often, not the first customer it
    // happened to hit. One journey failing a rule and four hundred failing it are different bugs.
    const byRule = new Map<string, Finding[]>();
    for (const f of findings) {
      const list = byRule.get(f.rule) ?? [];
      list.push(f);
      byRule.set(f.rule, list);
    }
    const report = [...byRule.entries()]
      .map(
        ([rule, items]) =>
          `${rule} — ${items.length} of ${JOURNEYS}\n    e.g. #${items[0]!.journey}: ${items[0]!.detail}`,
      )
      .join('\n  ');
    expect(report, `\n  ${report}\n`).toBe('');
  });

  /**
   * The guard against a green run that proved nothing.
   *
   * A simulation that stopped producing bookings — a catalogue rename, an exception swallowed in
   * a branch, a threshold that made every path `continue` — would satisfy every rule above by
   * never exercising one. These floors are deliberately far below what the run actually produces,
   * so they fail on a collapse rather than on drift in the dataset.
   */
  it('actually exercised the journey rather than bailing out early', () => {
    expect(cov.islands.size, 'every island was visited').toBe(ISLANDS.length);
    expect(cov.booked, 'bookings were made').toBeGreaterThan(300);
    expect(cov.cancelled, 'some were cancelled').toBeGreaterThan(20);
    expect(cov.rescheduled, 'some were rescheduled').toBeGreaterThan(20);
    expect(cov.reassigned, 'some tickets were handed over').toBeGreaterThan(20);
    expect(cov.bookedForPartner, 'some were booked for a partner').toBeGreaterThan(20);
    expect(cov.anonymousGuests, 'some guests skipped onboarding').toBeGreaterThan(20);
  });

  /**
   * The gate itself was reached, and all three of its exits were taken.
   *
   * This is the test that would have failed before this work: the clash was never raised, so the
   * "booked anyway" and "it is for someone else" paths did not exist to be counted.
   */
  it('reaches the double-booking gate and exercises every way out of it', () => {
    expect(cov.clashesRaised, 'the gate was reached').toBeGreaterThan(10);
    expect(cov.abandonedOnClash, 'some guests chose another time').toBeGreaterThan(0);
    expect(
      cov.clashesResolvedByReassigning,
      'some resolved it by naming the other person',
    ).toBeGreaterThan(0);
    expect(cov.clashesAcceptedAnyway, 'some booked it anyway').toBeGreaterThan(0);
  });
});
