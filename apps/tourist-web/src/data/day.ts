/**
 * Which day the Trips screen is showing.
 *
 * Trips is written as a *day* — "Your Ocho Rios Day", one timeline, one total, a countdown to the
 * next departure and a "leave by" time. It was not filtered by day. It listed every confirmed
 * booking on the island and printed `new Date()` above them, so a booking made for Thursday
 * appeared under a header reading Wednesday, with a "leave by 12:55 PM" that implied today. On the
 * screen a guest opens on the morning of, that is the app telling them to leave for something that
 * is not happening.
 *
 * The rule here is the one the screen's own language already implies: **the day being shown is the
 * day of the next booking that has not happened yet**, and today when there is nothing ahead. Days
 * are compared as ISO strings in the guest's own local calendar — `'2026-09-24' >= '2026-09-23'`
 * is a correct date comparison for that format, and it avoids constructing a `Date` per booking
 * only to throw the time away.
 *
 * Kept pure, and separate from the screen, because it is the part that has to be *right* — and
 * because a component that reads the clock cannot be tested without mocking one.
 */

export interface DatedBooking {
  dateISO: string;
  time: string;
}

export interface TripDay<T extends DatedBooking> {
  /** The day the screen is showing, ISO `YYYY-MM-DD`. */
  iso: string;
  /** Whether that day is today — the only case where a countdown or a "leave by" means anything. */
  isToday: boolean;
  /** The bookings on that day, in departure order. */
  bookings: T[];
  /** Bookings on *other* days. Counted, never silently dropped. */
  otherDays: T[];
}

/**
 * Pick the day to show and split the bookings around it.
 *
 * `bookings` may arrive in any order. `todayISO` is passed rather than read from the clock so the
 * whole thing is a function of its inputs.
 */
export function tripDay<T extends DatedBooking>(bookings: T[], todayISO: string): TripDay<T> {
  const sorted = bookings
    .slice()
    .sort((a, b) => `${a.dateISO}${a.time}`.localeCompare(`${b.dateISO}${b.time}`));

  // The next day that still has something on it. A booking earlier this week is history, and
  // leading the screen with it would put a countdown on a departure that has already gone.
  const upcoming = sorted.find((b) => b.dateISO >= todayISO);
  const iso = upcoming ? upcoming.dateISO : todayISO;

  return {
    iso,
    isToday: iso === todayISO,
    bookings: sorted.filter((b) => b.dateISO === iso),
    otherDays: sorted.filter((b) => b.dateISO !== iso),
  };
}

/** `'2026-09-24'` → a local `Date` at midnight. Parsing the string avoids the UTC shift `new Date('…')` applies. */
export function dateFromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * "Today", "Tomorrow", or "Thursday 24 September".
 *
 * The named days are worth the special case: a guest reading their own plan thinks in "today" and
 * "tomorrow" long before they think in dates, and a header that says Today is also the header that
 * makes the countdown beside it make sense.
 */
export function describeDay(iso: string, todayISO: string): string {
  if (iso === todayISO) return 'Today';
  const tomorrow = dateFromISO(todayISO);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (iso === isoOf(tomorrow)) return 'Tomorrow';
  return dateFromISO(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
