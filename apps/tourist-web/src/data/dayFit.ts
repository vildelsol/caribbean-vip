/**
 * "Would this fit my day?" — answered before it is asked.
 *
 * The experience detail page used to carry a button reading *Would this fit my day?* that
 * navigated to Irie and made the guest wait for an answer the app could already have worked out.
 * Ro's note is the right one: the concierge holds every booking the guest has, every departure
 * time and every distance, so the question is rhetorical — say the answer, and make the answer the
 * reason to book.
 *
 * Nothing here is new judgement. `buildItinerary` already places an `anchorExperienceId` before
 * anything else is fitted around it, and already knows about clashes, capacity and travel. This
 * module only reads the day it produces and turns it into one sentence. That separation is
 * deliberate: the fitting rules are tested in `itinerary.test.ts` and must not be restated here,
 * or the two will drift and the page will promise something the plan does not hold.
 */

import type { BuildInput, Itinerary, ItineraryStop } from './itinerary';
import { buildItinerary, formatClock } from './itinerary';
import { isoDate } from './availability';

/**
 * The soonest day that can actually hold this listing.
 *
 * `buildSoonestDay` is the wrong tool here and it fails in a way that looks like an answer:
 * it returns the first day with *any* stop on it, and a day the guest already has a booking on
 * always has one. So a guest holding a 9am booking was told "no departure fits the next few days"
 * about a listing that was free the following morning — the builder had simply never looked past
 * today. This walks the same window asking a different question: is the anchor on it?
 */
export function soonestDayFitting(
  input: Omit<BuildInput, 'dateISO'>,
  fromISO: string,
  lookaheadDays = 3,
): Itinerary {
  const anchorId = input.anchorExperienceId;
  const first = buildItinerary({ ...input, dateISO: fromISO });
  if (!anchorId || first.stops.some((s) => s.experience.id === anchorId)) return first;

  for (let offset = 1; offset <= lookaheadDays; offset++) {
    const [y, m, d] = fromISO.split('-').map(Number);
    const next = buildItinerary({
      ...input,
      dateISO: isoDate(new Date(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + offset)),
    });
    if (next.stops.some((s) => s.experience.id === anchorId)) return next;
  }
  // Nothing in the window holds it. The first day is the one whose reasons are worth reporting,
  // because it is the day the guest is actually standing in.
  return first;
}

export type FitTone =
  /** It fits the day being asked about. */
  | 'fits'
  /** It fits, but only on a later day — every earlier departure is taken or clashes. */
  | 'later-day'
  /** It does not fit at all. */
  | 'no-room';

export interface DayFit {
  tone: FitTone;
  /** The sentence that leads. Short enough to hold a strong weight at caption size. */
  headline: string;
  /** The supporting line: what it sits after, what it leaves room for, or why it will not go. */
  detail: string;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The weekday an ISO date falls on, parsed as local rather than UTC so it cannot shift a day. */
export function weekdayOf(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  if (!y || !m || !d) return 'that day';
  return WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? 'that day';
}

/**
 * How the anchor sits in the day that was built around it.
 *
 * `todayISO` is passed rather than read from the clock, so this is a pure function of its inputs
 * and a test can place a day in any week without freezing time.
 */
export function describeDayFit(day: Itinerary, anchorId: string, todayISO: string): DayFit {
  const index = day.stops.findIndex((s) => s.experience.id === anchorId);

  if (index < 0) return noRoom(day);

  const stop = day.stops[index];
  if (!stop) return noRoom(day);

  const when = day.dateISO === todayISO ? 'today' : weekdayOf(day.dateISO);
  const clock = formatClock(stop.startMinutes);
  /*
   * Only a stop the guest actually holds can be spoken of as theirs.
   *
   * The builder fills the rest of the window with suggestions, and the first version of this said
   * "Straight after Kingston Craft Market Run" about a listing nobody had booked — a sentence that
   * describes the guest's day using Irie's own guesses. Walking back from the anchor to the last
   * *confirmed* stop is the only claim this data supports.
   */
  const previous = day.stops
    .slice(0, index)
    .reverse()
    .find((s) => s.state === 'confirmed');

  /*
   * A day found by looking forward is not a refusal, but it is not a plain yes either: the guest
   * asked about *their* day, and this is a different one. Saying which, and why, is the difference
   * between a concierge and a form.
   */
  if (day.dateISO !== todayISO && day.stops.length === 1) {
    return {
      tone: 'later-day',
      headline: `Free on ${when} at ${clock}`,
      detail: 'Nothing today lines up with it — this is the soonest departure with room for you.',
    };
  }

  const immediatelyBefore = day.stops[index - 1];
  if (previous) {
    // The transfer is only the one being described when the booking is also the stop directly
    // before this one; otherwise a suggestion sits between them and the minutes belong to that.
    const note = previous === immediatelyBefore ? arrivalNote(stop) : '';
    return {
      tone: 'fits',
      headline: `Fits ${when} at ${clock}`,
      detail: `Straight after your ${previous.experience.title} booking${note}.`,
    };
  }

  const room = day.stopsWanted - day.stops.length;
  return {
    tone: 'fits',
    headline: `Fits ${when} at ${clock}`,
    detail:
      room > 0
        ? `It opens the day, and leaves room for ${room} more ${room === 1 ? 'stop' : 'stops'}.`
        : 'It opens the day, and the rest of it still works around it.',
  };
}

/**
 * How the guest gets here from the stop before, when the dataset can say.
 *
 * Read off the anchor's own `arriveFrom`, which is the transfer from whatever immediately precedes
 * it — which may be a suggestion rather than the booking named in the sentence. It is only stated
 * when the two are the same stop, for exactly that reason.
 */
function arrivalNote(stop: ItineraryStop): string {
  const arrival = stop.arriveFrom;
  if (!arrival) return '';
  if (arrival.kind === 'same-site') return ', same site — no transfer';
  return `, ${arrival.minutes} min ${arrival.mode}`;
}

/**
 * Why it will not go in.
 *
 * The clash count is the honest reason when the guest already holds something: the day is not
 * short of time in the abstract, it is short of time *after what they paid for*. Anything else is
 * capacity or the window, and neither is worth guessing between.
 */
function noRoom(day: Itinerary): DayFit {
  const clash = day.stops.find((s) => s.clash);
  if (clash?.clash) {
    return {
      tone: 'no-room',
      headline: 'Your day is already full',
      detail: `${clash.experience.title} and what follows it leave no window this fits into.`,
    };
  }
  return {
    tone: 'no-room',
    headline: 'No departure fits the next few days',
    detail: 'Every slot with room for your party clashes with something, or has already gone.',
  };
}
