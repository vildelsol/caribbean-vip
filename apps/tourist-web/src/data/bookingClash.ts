/**
 * Can this guest actually be in two places at once?
 *
 * The app let one account book two excursions that run at the same time, on the same day, with no
 * word said about it. Two ways that is wrong and they need different answers, which is the whole
 * reason this module exists rather than a flat "already booked" guard:
 *
 *  - **One person, two departures.** They cannot attend both. Something has been paid for twice and
 *    one of them will be a no-show the operator holds a seat for.
 *  - **Two people, one account.** A couple booking separately from the same card is the *normal*
 *    case, not an error — one does the catamaran, the other does the cooking class, same hour. The
 *    bookings genuinely overlap and genuinely both stand.
 *
 * The app could not tell those apart because nothing on a booking said *who it was for*. So
 * `attendeeName` is the field that resolves both: a clash is only a clash **between bookings for
 * the same attendee**, and naming a different attendee is a real answer to the warning rather than
 * a way of dismissing it. That is why the assignment lives here beside the detection.
 *
 * Pure — no React, no store, no clock. The screens render what it returns.
 */

import { distanceMetres } from '@cvip/types';
import {
  experienceById,
  experienceCoords,
  travelFrom,
  type DemoExperience,
} from './catalogue';
import { formatClock } from './availability';
import { minutesOfTime } from './itinerary';

/**
 * The account holder, when a booking names nobody.
 *
 * Stored as `null` rather than as the guest's name, so a booking made before the guest told the app
 * their name does not freeze "Guest" onto the ticket forever. The name is resolved at render time.
 */
export const LEAD_GUEST: null = null;

/** A gap this short is not a transfer, it is a scramble. Mirrors `MIN_GAP_MINUTES` in `itinerary`. */
const MIN_GAP_MINUTES = 15;

export interface BookingLike {
  id: string;
  experienceId: string;
  dateISO: string;
  /** "09:00" */
  time: string;
  status: 'confirmed' | 'cancelled';
  attendeeName: string | null;
}

export type ClashKind =
  /** The two run at the same time. Nobody attends both. */
  | 'overlap'
  /** They do not overlap, but there is no way to get from one to the other in the gap. */
  | 'travel';

export interface BookingClash {
  kind: ClashKind;
  /** The booking already held. */
  existing: BookingLike;
  existingExperience: DemoExperience;
  /** Minutes free between the two, after the earlier one ends. Negative when they overlap. */
  gapMinutes: number;
  /** Minutes the transfer between them actually needs. */
  requiredMinutes: number;
  /** Who both bookings are for — a name, or `null` for the account holder. */
  attendeeName: string | null;
}

/**
 * Two people are the same person when their names match, ignoring case and surrounding space.
 *
 * Deliberately not fuzzy. "Sarah" and "sarah" are one person and typing one of them twice is the
 * common case; "Sarah" and "Sarah M" are two strings this cannot safely merge, and merging them
 * would silently suppress a warning — which is the failure this module exists to prevent. Erring
 * towards *showing* the warning is the safe direction: the guest can always say it is for someone
 * else, and no seat is lost by asking.
 */
export function sameAttendee(a: string | null, b: string | null): boolean {
  return normaliseAttendee(a) === normaliseAttendee(b);
}

export function normaliseAttendee(name: string | null): string {
  return (name ?? '').trim().toLowerCase();
}

/** How long a transfer between two listings needs, floored at the minimum gap. */
function transferMinutes(a: DemoExperience, b: DemoExperience): number {
  const pa = experienceCoords(a);
  const pb = experienceCoords(b);
  if (!pa || !pb) return MIN_GAP_MINUTES;
  return Math.max(MIN_GAP_MINUTES, travelFrom(distanceMetres(pa, pb)).minutes);
}

export interface ClashCandidate {
  experienceId: string;
  dateISO: string;
  time: string;
  attendeeName: string | null;
  /** Set when re-checking an existing booking (a reschedule), so it does not clash with itself. */
  ignoreBookingId?: string;
}

/**
 * Every booking the guest already holds that this one cannot sit beside.
 *
 * Same day, same attendee, confirmed. Cancelled bookings hold no seat and free the time, so they
 * are not a conflict — the guest cancelled precisely to make room.
 *
 * Sorted by severity then by time, so a screen showing only the first shows the worst.
 */
export function findBookingClashes(
  candidate: ClashCandidate,
  bookings: BookingLike[],
): BookingClash[] {
  const experience = experienceById(candidate.experienceId);
  if (!experience) return [];

  const start = minutesOfTime(candidate.time);
  const end = start + experience.durationMinutes;

  const clashes: BookingClash[] = [];

  for (const existing of bookings) {
    if (existing.status !== 'confirmed') continue;
    if (existing.id === candidate.ignoreBookingId) continue;
    if (existing.dateISO !== candidate.dateISO) continue;
    if (!sameAttendee(existing.attendeeName, candidate.attendeeName)) continue;

    const other = experienceById(existing.experienceId);
    if (!other) continue;

    const otherStart = minutesOfTime(existing.time);
    const otherEnd = otherStart + other.durationMinutes;

    // Straight overlap is measured before travel is considered, because the two produce different
    // sentences and the guest needs to know which one they are in: "at the same time" is a hard
    // conflict, "not enough time to get there" is a judgement they might reasonably override.
    const overlapping = start < otherEnd && otherStart < end;

    const required = transferMinutes(other, experience);
    // The free minutes between them, whichever runs first.
    const gap = start >= otherEnd ? start - otherEnd : otherStart - end;

    if (overlapping) {
      clashes.push({
        kind: 'overlap',
        existing,
        existingExperience: other,
        gapMinutes: gap,
        requiredMinutes: required,
        attendeeName: candidate.attendeeName,
      });
      continue;
    }

    if (gap < required) {
      clashes.push({
        kind: 'travel',
        existing,
        existingExperience: other,
        gapMinutes: gap,
        requiredMinutes: required,
        attendeeName: candidate.attendeeName,
      });
    }
  }

  return clashes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'overlap' ? -1 : 1;
    return minutesOfTime(a.existing.time) - minutesOfTime(b.existing.time);
  });
}

/**
 * The bookings that belong to one person's day.
 *
 * Every screen that plans or describes *your* day has to go through this now that one account can
 * hold bookings for more than one person. Irie built its itinerary from every confirmed booking on
 * the island, so the moment a couple booked separately the concierge started planning the account
 * holder's day around their partner's catamaran — and `describeDayFit` would answer "your day is
 * already full" about a morning that was entirely free.
 *
 * The clash detector and the planners are deliberately the same rule: if two bookings are not for
 * the same person, neither one is a constraint on the other, anywhere.
 */
export function bookingsFor<T extends { attendeeName: string | null }>(
  bookings: T[],
  attendeeName: string | null,
): T[] {
  return bookings.filter((b) => sameAttendee(b.attendeeName, attendeeName));
}

export interface ClashMessage {
  headline: string;
  detail: string;
  /** What the guest is being asked to confirm, on the button that proceeds anyway. */
  proceedLabel: string;
}

/**
 * The warning, in words.
 *
 * It names the booking, the time and the shortfall, because "you have a clash" tells a guest
 * nothing they can act on. Every sentence here is derived from the dataset — no figure is invented.
 */
export function describeClash(clash: BookingClash, attendeeLabel: string): ClashMessage {
  const existingTitle = clash.existingExperience.title;
  const at = formatClock(clash.existing.time);

  if (clash.kind === 'overlap') {
    return {
      headline: `${attendeeLabel} already booked for this time`,
      detail: `${existingTitle} runs from ${at} and overlaps this departure. One person cannot attend both.`,
      proceedLabel: 'Book it anyway',
    };
  }

  const short = clash.requiredMinutes - clash.gapMinutes;
  return {
    headline: 'That is a tight connection',
    detail: `${existingTitle} at ${at} leaves ${minutesLabel(clash.gapMinutes)} to get here, and the transfer takes about ${minutesLabel(clash.requiredMinutes)} — ${minutesLabel(short)} short.`,
    proceedLabel: 'Book it anyway',
  };
}

function minutesLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} hr` : `${h} hr ${rem} min`;
}

/**
 * Who a booking is for, as the ticket and the trip list print it.
 *
 * `guestName` is the account holder's own name from onboarding, which may be empty — a guest can
 * skip it. "Guest" is the honest answer then, and it is better than printing someone else's name
 * on the artefact a vendor scans.
 */
export function attendeeLabel(attendeeName: string | null, guestName: string): string {
  const named = (attendeeName ?? '').trim();
  if (named) return named;
  const own = guestName.trim();
  return own || 'Guest';
}

/**
 * Everyone this account has booked for, for the "who is this for?" picker.
 *
 * The account holder is always first and always present, so the picker never opens empty. The rest
 * are the distinct attendee names already used, most recent first, because a couple booking a
 * second day will want the same name they typed yesterday rather than to type it again.
 */
export function knownAttendees(bookings: BookingLike[], guestName: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (let i = bookings.length - 1; i >= 0; i--) {
    const raw = bookings[i]?.attendeeName;
    const name = (raw ?? '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return [attendeeLabel(null, guestName), ...names];
}
