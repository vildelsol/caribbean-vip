import { distanceMetres, type ExperienceCategory } from '@cvip/types';
import {
  byDistanceFrom,
  experiencesFor,
  priceFor,
  seatsIn,
  simulatedPosition,
  travelFrom,
  vendorFor,
  type DemoDestination,
  type DemoExperience,
  type PartySelection,
  type Travel,
} from './catalogue';
import { isoDate, slotsFor } from './availability';

/**
 * Irie's itinerary builder.
 *
 * The design's argument for the day timeline is that a catalogue is passive and a day is not: it
 * has an order, the gaps between its entries are real travel, and it costs a number the guest can
 * see before they commit to any of it. This module composes that day. It is the part of Irie that
 * makes the tab read as a product rather than a chatbot, and it is deliberately **pure** — no
 * React, no store, no clock beyond the date it is handed — so the whole composition is unit
 * testable, which the screen rendering it is not.
 *
 * Three properties are load-bearing, and each has a test:
 *
 *  - **It only composes from the visible catalogue.** Candidates come from `experiencesFor`, which
 *    goes through `visibleExperiences()` and therefore through the same `isPubliclyVisibleDemo`
 *    rule that mirrors the `experiences_public_read` RLS policy. Irie cannot put a draft listing,
 *    or a listing under an unapproved vendor, on a guest's day.
 *  - **It never sums a total itself.** Every suggested stop is quoted through `priceFor`, which is
 *    `calculateBookingTotal` in `@cvip/types`; every confirmed stop contributes the frozen
 *    `totalMinor` that was agreed at booking. The itinerary adds those figures and nothing else, so
 *    the estimate here and the total on the checkout it leads to cannot disagree.
 *  - **It never places a departure the party would not fit on.** A slot with less capacity than the
 *    party is skipped rather than quoted, because a day plan whose stops cannot actually be booked
 *    is worse than a shorter one.
 *
 * Availability and capacity are the deterministic simulation in `availability.ts` — same listing,
 * same day, same slots on every machine. There is no database behind this.
 */

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface ItineraryShape {
  id: 'full-day' | 'afternoon' | 'evening';
  /** The chip a guest taps, and the question the transcript records. */
  chip: string;
  title: string;
  /** How Irie explains the shape it chose, above the timeline. */
  reply: string;
  /** Window, in minutes from local midnight. Nothing is placed outside it. */
  fromMinutes: number;
  toMinutes: number;
  maxStops: number;
  /** Categories preferred when filling free time. Empty means no preference. */
  favours: ExperienceCategory[];
}

export const ITINERARY_SHAPES: ItineraryShape[] = [
  {
    id: 'full-day',
    chip: 'Plan my whole day',
    title: 'Your full day',
    reply: 'Here is a day that flows — each stop is close to the last, and nothing overlaps.',
    fromMinutes: 8 * 60 + 30,
    toMinutes: 21 * 60,
    maxStops: 4,
    favours: [],
  },
  {
    id: 'afternoon',
    chip: 'Build my afternoon',
    title: 'Your afternoon',
    reply: 'A few free hours, spent well, and back before dinner.',
    fromMinutes: 12 * 60,
    toMinutes: 19 * 60,
    maxStops: 3,
    favours: [],
  },
  {
    id: 'evening',
    chip: 'An evening out',
    title: 'Your evening',
    reply: 'Somewhere to eat, and somewhere to go afterwards.',
    fromMinutes: 16 * 60,
    toMinutes: 22 * 60 + 30,
    maxStops: 2,
    favours: ['food', 'nightlife', 'culture'],
  },
];

export function shapeById(id: string): ItineraryShape | undefined {
  return ITINERARY_SHAPES.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// Shape of a built day
// ---------------------------------------------------------------------------

/**
 * `confirmed` — a paid booking, immovable, at the price that was agreed.
 * `planned` — already on the guest's day plan, or the listing they were looking at.
 * `suggested` — Irie's own addition.
 */
export type StopState = 'confirmed' | 'planned' | 'suggested';

/**
 * Getting from one stop to the next.
 *
 * Two cases, because they are genuinely different facts and collapsing them produces nonsense.
 * Location in this dataset lives on the **vendor**, not the listing — Dunn's River Falls Climb and
 * Mystic Mountain Bobsled are both run by `vendor-dunns` from the same base — so a naive
 * vendor-to-vendor distance between them is zero, and rendering that as "1 min walk · 0 m" reads as
 * a bug rather than as the truth it actually is. When the operator is the same, the honest line is
 * that there is no transfer to make.
 */
export type Arrival =
  | ({ kind: 'transfer'; metres: number } & Travel)
  | { kind: 'same-site'; vendorName: string };

export interface ItineraryStop {
  experience: DemoExperience;
  state: StopState;
  /** Minutes from local midnight. */
  startMinutes: number;
  endMinutes: number;
  /** "09:00", the slot key — what a booking would carry. */
  time: string;
  /**
   * What this stop is expected to cost the party, in USD minor units.
   *
   * `null` when it could not be quoted, which is not the same as free. The UI must say so rather
   * than treating it as zero, and `unquotedCount` exists so the total can be labelled a floor.
   */
  estimateMinor: number | null;
  /** Why it could not be quoted, straight from the pricing calculator. */
  quoteNote: string | null;
  /** What the chosen departure has left. `null` for a confirmed booking — its seats are already held. */
  capacityRemaining: number | null;
  /** How far the stop is from the guest's simulated position. */
  metresFromGuest: number | null;
  /** Getting here from the previous stop. `null` on the first stop, and when a vendor has no location. */
  arriveFrom: Arrival | null;
  /**
   * Set when the day cannot actually accommodate this stop after the one before it.
   *
   * Only a confirmed booking can carry one. Suggestions are fitted against everything already
   * placed, so they cannot clash by construction — but bookings the guest already holds can, and
   * routinely do: two things booked for the same morning, or one on each side of the island. The
   * builder leaves both on the day and says so rather than dropping one, because a plan that
   * quietly hides something that was paid for is worse than one that admits a problem.
   */
  clash: Clash | null;
}

export interface Clash {
  /** `overlap` — they run at the same time. `travel` — they do not, but there is no way to get there. */
  kind: 'overlap' | 'travel';
  /** The stop it clashes with, which is always the one before it. */
  withTitle: string;
  /** How much more time the day would need for this to work. */
  shortfallMinutes: number;
  /**
   * The change that would make this booking fit, or `null` when nothing available does.
   *
   * Naming the problem is the smaller half of the job. A concierge that says two bookings collide
   * and stops there has handed the guest a puzzle; the useful answer is the departure that clears
   * it. This is computed against the same availability the rest of the app books from, so it can
   * only ever name a departure that genuinely exists and genuinely has room.
   *
   * `null` is a real answer and the screen must say so plainly rather than hiding the clash — two
   * things booked on opposite sides of the island at the same hour cannot be reconciled by moving
   * either one, and pretending otherwise would be worse than the collision.
   */
  resolution: ClashResolution | null;
}

/**
 * A departure that would resolve a clash.
 *
 * Only ever a *proposal*. The booking is the guest's and is already paid for, so nothing here is
 * applied until they choose it.
 */
export interface ClashResolution {
  /** `later-slot` — another departure the same day. `another-day` — the soonest day that works. */
  kind: 'later-slot' | 'another-day';
  dateISO: string;
  /** "14:00", the slot key — what the moved booking would carry. */
  time: string;
  startMinutes: number;
  capacityRemaining: number;
}

export interface Itinerary {
  shapeId: ItineraryShape['id'];
  title: string;
  reply: string;
  dateISO: string;
  stops: ItineraryStop[];
  /** Sum of the per-stop figures above. Never computed from a price on a card. */
  totalMinor: number;
  /** Stops that could not be quoted. Above zero, `totalMinor` is a floor and must be labelled one. */
  unquotedCount: number;
  /** Stops the day cannot accommodate. Above zero, the screen must say the day does not work as it stands. */
  clashCount: number;
  /** Total ground covered between stops — the design's "Route · 34 km". */
  routeMetres: number;
  /** Stops that are not yet booked, so the screen can add the whole day to the plan in one action. */
  addableExperienceIds: string[];
  /**
   * How many stops the shape had room for.
   *
   * A day routinely comes back shorter than this, and that is the builder working rather than
   * failing: Ocho Rios to Negril is 130 km, so a listing there cannot join a morning here whatever
   * the window says. The screen states the shortfall instead of quietly under-delivering, because a
   * guest who asked for a full day and got two stops deserves the reason.
   */
  stopsWanted: number;
}

/**
 * The minimum a booked stop can contribute to the plan.
 *
 * Structural, so this module does not depend on the store — `Booking` satisfies it, and a test can
 * supply a fixture without constructing one.
 */
export interface FixedBooking {
  experienceId: string;
  dateISO: string;
  time: string;
  totalMinor: number;
  /**
   * Seats this booking holds, when the caller knows them.
   *
   * Only used to size a replacement departure when this booking clashes: the guest can book for
   * four in the morning and then ask Irie about a day for two, and proposing a move to a departure
   * with two seats left would be a promise the checkout could not keep. Optional because the rest
   * of the builder does not need it, and falls back to the party the day is being priced for.
   */
  seats?: number;
}

export interface BuildInput {
  shape: ItineraryShape;
  islandId: string;
  destination: DemoDestination;
  /** The day being composed, "2026-08-05". */
  dateISO: string;
  party: PartySelection;
  /** Every booking the guest holds. Only confirmed ones on this island and day become fixed points. */
  bookings: FixedBooking[];
  plannedExperienceIds: string[];
  /**
   * A listing the guest is currently looking at.
   *
   * Placed before anything else is fitted around it, which is what makes "would this fit my
   * afternoon?" from the experience detail page a question with an answer rather than a link.
   */
  anchorExperienceId?: string;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** A gap this short is not a transfer, it is a scramble — so it is the floor between any two stops. */
const MIN_GAP_MINUTES = 15;

export function minutesOfTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** "3:30 PM" — the design sets every itinerary time in 12-hour with a space before the meridiem. */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * "9:00 AM – 7:30 PM", the span a built day actually occupies.
 *
 * The latest *end*, not the end of the last stop to start — a long stop begun earlier can finish
 * after a short one begun later, and a day that clashes will contain exactly that.
 */
export function formatSpan(stops: ItineraryStop[]): string {
  if (stops.length === 0) return '';
  const start = Math.min(...stops.map((s) => s.startMinutes));
  const end = Math.max(...stops.map((s) => s.endMinutes));
  return `${formatClock(start)} – ${formatClock(end)}`;
}

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

function metresBetween(a: DemoExperience, b: DemoExperience): number | null {
  const va = vendorFor(a);
  const vb = vendorFor(b);
  if (!va || !vb) return null;
  return distanceMetres(
    { lat: va.location.lat, lng: va.location.lng },
    { lat: vb.location.lat, lng: vb.location.lng },
  );
}

/**
 * How long to leave between two stops.
 *
 * The travel time itself, floored — a transfer that the map says takes four minutes still needs
 * the guest to finish, pay and walk out.
 */
function gapBetween(a: DemoExperience, b: DemoExperience): number {
  const metres = metresBetween(a, b);
  if (metres === null) return MIN_GAP_MINUTES;
  return Math.max(MIN_GAP_MINUTES, travelFrom(metres).minutes);
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

export function buildItinerary(input: BuildInput): Itinerary {
  const { shape, party, dateISO } = input;
  const seats = seatsIn(party);

  const ranked = byDistanceFrom(simulatedPosition(input.destination), experiencesFor(input.islandId));
  const byId = new Map(ranked.map((r) => [r.experience.id, r]));

  const stops: ItineraryStop[] = [];
  const usedCategories = new Set<ExperienceCategory>();
  /**
   * Seats each confirmed booking actually holds.
   *
   * A proposed replacement departure has to have room for *that* booking's party, which is not
   * necessarily the party the day is being priced for — the guest can book for four in the morning
   * and ask Irie about a day for two.
   */
  const heldSeats = new Map<string, number>();

  // --- 1. Confirmed bookings are fixed points -------------------------------
  // They are placed first and never moved, because the guest has paid for them and a plan that
  // quietly reschedules a paid booking around a suggestion has the priority backwards.
  for (const booking of input.bookings) {
    if (booking.dateISO !== dateISO) continue;
    const found = byId.get(booking.experienceId);
    if (!found) continue;
    const { experience, metres } = found;
    const start = minutesOfTime(booking.time);
    stops.push({
      experience,
      state: 'confirmed',
      startMinutes: start,
      endMinutes: start + experience.durationMinutes,
      time: booking.time,
      estimateMinor: booking.totalMinor,
      quoteNote: null,
      capacityRemaining: null,
      metresFromGuest: metres,
      arriveFrom: null,
      clash: null,
    });
    usedCategories.add(experience.category);
    if (booking.seats !== undefined) heldSeats.set(experience.id, booking.seats);
  }
  stops.sort((a, b) => a.startMinutes - b.startMinutes);

  // --- 2. Candidates, in the order Irie should prefer them -------------------
  const candidates: { experience: DemoExperience; state: StopState }[] = [];
  const consider = (experience: DemoExperience | undefined, state: StopState) => {
    if (!experience) return;
    if (stops.some((s) => s.experience.id === experience.id)) return;
    if (candidates.some((c) => c.experience.id === experience.id)) return;
    candidates.push({ experience, state });
  };

  consider(input.anchorExperienceId ? byId.get(input.anchorExperienceId)?.experience : undefined, 'planned');
  for (const id of input.plannedExperienceIds) consider(byId.get(id)?.experience, 'planned');

  const favoured = shape.favours.length
    ? ranked.filter((r) => shape.favours.includes(r.experience.category))
    : ranked;
  // Falling back to the unfiltered list rather than composing an evening with one stop in it: the
  // same rule the answer chips use, for the same reason — a dead end the guest cannot get out of is
  // worse than a looser match they can see the reason for.
  for (const r of favoured) consider(r.experience, 'suggested');
  for (const r of ranked) consider(r.experience, 'suggested');

  // --- 3. Fit them into the window ------------------------------------------
  //
  // Two passes, and the reason is the difference between a plan and a booking.
  //
  // Candidates arrive nearest-first, so a single all-day listing that happens to be closest — the
  // Seven Mile Beach Club Day runs eight hours — takes the whole window on a first-fit and answers
  // "plan my whole day" with one stop. That is not wrong, but it is not a day either. So anything
  // longer than a fair share of the window waits: shorter stops are fitted first, and the long ones
  // are offered afterwards for whatever space is left, which is usually none.
  //
  // The anchor and anything already on the guest's plan skip this — they were asked for, and a
  // builder that quietly deprioritises the listing the guest is looking at has missed the point.
  const budget = Math.round(((shape.toMinutes - shape.fromMinutes) / shape.maxStops) * 1.75);
  const fitsBudget = (c: { experience: DemoExperience; state: StopState }) =>
    c.state !== 'suggested' || c.experience.durationMinutes <= budget;

  for (const pass of [fitsBudget, () => true]) {
    for (const candidate of candidates) {
      if (stops.length >= shape.maxStops) break;
      if (!pass(candidate)) continue;
      if (stops.some((s) => s.experience.id === candidate.experience.id)) continue;
      // One stop per category. Two jerk-chicken lunches in a day is not a plan, it is a filter that
      // was never applied.
      if (usedCategories.has(candidate.experience.category)) continue;
      const stop = fit(candidate, stops, input, seats);
      if (!stop) continue;
      stop.metresFromGuest = byId.get(candidate.experience.id)?.metres ?? null;
      stops.push(stop);
      stops.sort((a, b) => a.startMinutes - b.startMinutes);
      usedCategories.add(candidate.experience.category);
    }
  }

  // --- 4. The legs between them, and whether they are possible ---------------
  let routeMetres = 0;
  for (let i = 1; i < stops.length; i++) {
    const previous = stops[i - 1]!;
    const current = stops[i]!;
    const from = previous.experience;
    const to = current.experience;

    if (from.vendorId === to.vendorId) {
      current.arriveFrom = { kind: 'same-site', vendorName: vendorFor(to)?.tradingName ?? 'the same operator' };
    } else {
      const metres = metresBetween(from, to);
      if (metres !== null) {
        current.arriveFrom = { kind: 'transfer', metres, ...travelFrom(metres) };
        routeMetres += metres;
      }
    }

    // Two bookings the guest already holds can be impossible together, and saying so is the most
    // useful thing a concierge does with a day that is already half committed.
    const needed = gapBetween(from, to);
    const available = current.startMinutes - previous.endMinutes;
    if (available < needed) {
      current.clash = {
        kind: available < 0 ? 'overlap' : 'travel',
        withTitle: from.title,
        shortfallMinutes: needed - available,
        // Resolved against every other stop, not just the one it collided with: a departure that
        // steps clear of the morning only to land on the afternoon is not a fix, and offering it
        // would cost the guest a rebooking to arrive at the same problem.
        resolution: resolveClash(
          current,
          stops.filter((s) => s !== current),
          dateISO,
          heldSeats.get(to.id) ?? seats,
        ),
      };
    }
  }

  const unquotedCount = stops.filter((s) => s.estimateMinor === null).length;

  return {
    shapeId: shape.id,
    title: shape.title,
    reply: shape.reply,
    dateISO,
    stops,
    totalMinor: stops.reduce((sum, s) => sum + (s.estimateMinor ?? 0), 0),
    unquotedCount,
    clashCount: stops.filter((s) => s.clash !== null).length,
    routeMetres,
    addableExperienceIds: stops.filter((s) => s.state !== 'confirmed').map((s) => s.experience.id),
    stopsWanted: shape.maxStops,
  };
}

/**
 * The soonest day from `fromISO` that Irie can actually fill.
 *
 * Availability drops departures inside the next 90 minutes, so a demonstration opened at six in the
 * evening asks for "my full day" and gets nothing — which reads as a broken feature rather than as
 * the correct answer to a question about a day that is nearly over. This walks forward instead, and
 * the screen states which day it landed on so the shift is visible rather than silent.
 *
 * When no day in the lookahead can be filled, the last attempt is returned: an empty itinerary for
 * a real date, which the screen has an empty state for.
 */
export function buildSoonestDay(
  input: Omit<BuildInput, 'dateISO'>,
  fromISO: string,
  lookaheadDays = 3,
): Itinerary {
  let last = buildItinerary({ ...input, dateISO: fromISO });
  if (last.stops.length > 0) return last;

  for (let offset = 1; offset <= lookaheadDays; offset++) {
    const [y, m, d] = fromISO.split('-').map(Number);
    const day = new Date(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + offset);
    last = buildItinerary({ ...input, dateISO: isoDate(day) });
    if (last.stops.length > 0) return last;
  }
  return last;
}

/**
 * The earliest departure of this listing that fits the day as it currently stands.
 *
 * First fit rather than best fit, deliberately: a guest reads a day top to bottom, and an earlier
 * stop leaves more of the window free for whatever is fitted after it.
 */
function fit(
  candidate: { experience: DemoExperience; state: StopState },
  placed: ItineraryStop[],
  input: BuildInput,
  seats: number,
): ItineraryStop | null {
  const { experience } = candidate;
  for (const slot of slotsFor(experience, input.dateISO)) {
    const start = minutesOfTime(slot.time);
    const end = start + experience.durationMinutes;

    if (start < input.shape.fromMinutes || end > input.shape.toMinutes) continue;
    // A departure the party would not fit on is not an option, so it is not offered as one.
    if (slot.capacityRemaining < seats) continue;
    if (placed.some((p) => overlaps(p, experience, start, end))) continue;

    const quote = priceFor(experience, input.party, slot.capacityRemaining);
    return {
      experience,
      state: candidate.state,
      startMinutes: start,
      endMinutes: end,
      time: slot.time,
      estimateMinor: quote.ok ? quote.breakdown.total.amountMinor : null,
      quoteNote: quote.ok ? null : quote.message,
      capacityRemaining: slot.capacityRemaining,
      metresFromGuest: null,
      arriveFrom: null,
      clash: null,
    };
  }
  return null;
}

/**
 * The cheapest change that would make a clashing booking fit, or `null` if nothing does.
 *
 * Same day first, and within that the earliest departure that works, because a change that keeps
 * the day intact costs the guest least — moving to a different day is a bigger ask than moving by
 * two hours, and is only worth offering once the smaller fix has been ruled out.
 *
 * The shape's window is deliberately *not* enforced. Confirmed bookings are placed on the day
 * regardless of it — a morning booking still shows on an afternoon plan — so filtering proposals by
 * it would refuse the obvious fix for exactly the bookings most likely to need one.
 */
function resolveClash(
  stop: ItineraryStop,
  others: ItineraryStop[],
  dateISO: string,
  seats: number,
  lookaheadDays = 3,
): ClashResolution | null {
  const { experience } = stop;
  for (const slot of slotsFor(experience, dateISO)) {
    if (slot.capacityRemaining < seats) continue;
    const start = minutesOfTime(slot.time);
    if (start === stop.startMinutes) continue;
    if (others.some((o) => overlaps(o, experience, start, start + experience.durationMinutes))) continue;
    return {
      kind: 'later-slot',
      dateISO,
      time: slot.time,
      startMinutes: start,
      capacityRemaining: slot.capacityRemaining,
    };
  }

  // Another day needs no clash check: every stop on this day is, by definition, not on that one.
  for (let offset = 1; offset <= lookaheadDays; offset++) {
    const [y, m, d] = dateISO.split('-').map(Number);
    const next = isoDate(new Date(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + offset));
    for (const slot of slotsFor(experience, next)) {
      if (slot.capacityRemaining < seats) continue;
      return {
        kind: 'another-day',
        dateISO: next,
        time: slot.time,
        startMinutes: minutesOfTime(slot.time),
        capacityRemaining: slot.capacityRemaining,
      };
    }
  }
  return null;
}

/** Two stops clash if either runs into the travel time the other needs. */
function overlaps(placed: ItineraryStop, experience: DemoExperience, start: number, end: number): boolean {
  const gap = gapBetween(placed.experience, experience);
  return start < placed.endMinutes + gap && placed.startMinutes < end + gap;
}
