import type { DemoExperience } from './catalogue';

/**
 * Simulated availability.
 *
 * Real availability is `availability_slots` in Postgres, held under a transaction by
 * `reserve_availability()`. There is no database here, so slots are **derived deterministically
 * from the listing id and the date** rather than randomised or stored.
 *
 * Determinism is the whole point. A demonstration that re-rolls its capacity on every render shows
 * a different number each time the guest changes the party size, and a presenter cannot say "six
 * places left" twice. Deriving from a hash means the same listing on the same day always offers the
 * same slots with the same capacity — on any machine, after any reload, without persisting a byte.
 *
 * `capacityRemaining` feeds `calculateBookingTotal`, which rejects a party larger than the slot.
 * That is what stops the UI quoting a total for a booking that could never be taken.
 */

/** FNV-1a. Small, fast, and stable across engines — which a hash used for display has to be. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Slot {
  /** "09:00" — 24-hour, so it sorts lexically. */
  time: string;
  label: string;
  capacityRemaining: number;
}

export interface Day {
  /** "2026-08-05" */
  iso: string;
  weekday: string;
  dayOfMonth: number;
  month: string;
  /** False when every slot on the day is full — the strip greys it rather than hiding it. */
  hasAvailability: boolean;
}

const MAX_PARTY = 12;

/** Today, at local midnight, so date maths never drifts by a timezone. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The next 14 bookable days.
 *
 * Today is included only after a cut-off, because a same-day booking on an experience that starts
 * at 09:00 is not a real offer at four in the afternoon. The design leans on "available today", so
 * the rule is stated rather than fudged: today drops off the strip once its last departure has
 * passed.
 */
export function daysFor(experience: DemoExperience, count = 14): Day[] {
  const out: Day[] = [];
  const start = startOfToday();
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = isoDate(d);
    const slots = slotsFor(experience, iso);
    out.push({
      iso,
      weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      dayOfMonth: d.getDate(),
      month: d.toLocaleDateString('en-GB', { month: 'short' }),
      hasAvailability: slots.some((s) => s.capacityRemaining > 0),
    });
  }
  return out;
}

/** The departures offered on one day, with the capacity each has left. */
export function slotsFor(experience: DemoExperience, dateISO: string): Slot[] {
  // A half-day experience runs more often than a full-day one. Derived from the real duration so
  // the times a listing offers are consistent with what the listing says it is.
  const times =
    experience.durationMinutes >= 360
      ? ['08:30']
      : experience.durationMinutes >= 210
        ? ['09:00', '13:30']
        : ['09:00', '11:30', '14:00', '16:30'];

  const today = isoDate(startOfToday());
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  return times
    .map((time) => {
      const seed = hash(`${experience.id}|${dateISO}|${time}`);
      // 0–11 remaining, weighted so "nearly full" is common enough to be worth showing and empty
      // is rare enough that the demonstration is not constantly blocked.
      const remaining = seed % 13 === 0 ? 0 : (seed % MAX_PARTY) + 1;

      if (dateISO === today) {
        const [h, m] = time.split(':').map(Number);
        // A departure inside the next 90 minutes cannot be booked — the vendor needs notice, and
        // the pickup times the listings advertise assume it.
        if ((h ?? 0) * 60 + (m ?? 0) - nowMinutes < 90) return null;
      }

      const [h, m] = time.split(':').map(Number);
      const hour12 = ((h ?? 0) % 12) || 12;
      const suffix = (h ?? 0) < 12 ? 'AM' : 'PM';
      return {
        time,
        label: `${hour12}:${String(m ?? 0).padStart(2, '0')} ${suffix}`,
        capacityRemaining: remaining,
      };
    })
    .filter((s): s is Slot => s !== null);
}

export function slotOn(experience: DemoExperience, dateISO: string, time: string): Slot | undefined {
  return slotsFor(experience, dateISO).find((s) => s.time === time);
}

/** The first day that has anything left, so a screen never opens on a dead date. */
export function firstBookableDay(experience: DemoExperience): Day | undefined {
  return daysFor(experience).find((d) => d.hasAvailability);
}

/**
 * Pickup is 35 minutes before departure, matching the design's "9:00 AM · Hotel pickup 8:25 AM".
 * Display only — it never takes part in a calculation that leads to a charge.
 */
export function pickupTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) - 35;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  const hour12 = (hh % 12) || 12;
  return `${hour12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}

/** "Saturday, 24 May 2026" */
export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Free cancellation deadline, from the listing's own policy. */
export function cancellationDeadline(experience: DemoExperience, dateISO: string, time: string): string {
  const [y, mo, d] = dateISO.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const start = new Date(y ?? 2026, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
  start.setHours(start.getHours() - experience.cancellationHours);
  return start.toLocaleDateString('en-GB', {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * What a card can honestly say about when this experience next runs.
 *
 * The cards used to carry a hardcoded "Open Now" badge. Nothing backed it: there is no
 * `openingHours`, `opensAt` or `isOpen` anywhere in the dataset, so the badge was a claim about the
 * vendor that the app had no way to know. It sat beside the from-price, the rating and the next
 * departure — all of which are real — so it read as another fact.
 *
 * Availability is the one timing fact this app does hold, so that is what the badge states.
 * Returns null when nothing is bookable in the next two weeks, so the caller omits the badge rather
 * than asserting something about a listing that is not running.
 */
export function availabilityLabel(experience: DemoExperience): string | null {
  const day = firstBookableDay(experience);
  if (!day) return null;
  return day.iso === isoDate(startOfToday()) ? 'Available today' : `Available ${day.weekday}`;
}
