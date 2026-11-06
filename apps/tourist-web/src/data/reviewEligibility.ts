import { slotStartsAt } from './serverBooking';

/**
 * May this booking be reviewed, and if not, why.
 *
 * This is the client mirror of `guard_review_fields`
 * (`supabase/migrations/20261104000011_review_integrity.sql`). The database is the authority — it
 * refuses a review of a future or unpaid booking whatever the client believes — but a screen that
 * offers a button the database will reject is a screen that fails in front of the guest. So the
 * rule lives here too, and `reviewEligibility.test.ts` reads the migration and fails if the two
 * lists of statuses drift apart.
 *
 * Pure. `now` is a parameter and is never read from the clock here: a test that reads the wall
 * clock passes in one timezone and fails in CI.
 */

/** The booking statuses the database accepts a review for. Mirrors the `b_status not in (...)` check. */
export const REVIEWABLE_BOOKING_STATUSES = ['confirmed', 'completed'] as const;

export type ReviewBlockedReason =
  | 'cancelled'
  | 'not_paid'
  | 'not_happened_yet'
  | 'already_reviewed';

export type ReviewEligibility =
  | { ok: true; startedAtISO: string }
  | { ok: false; reason: ReviewBlockedReason };

/** Only the fields the rule needs, so both the local booking and a `my_bookings()` row fit. */
export interface ReviewableBookingLike {
  id: string;
  status: string;
  /** The chosen day, ISO date with no time component. */
  dateISO: string;
  /** The chosen departure, "09:00". */
  time: string;
}

/**
 * The messages a guest reads. Kept beside the reasons so a screen cannot invent its own wording
 * for a state, and so the "not yet" case never implies the trip was cancelled.
 */
export const REVIEW_BLOCKED_COPY: Record<ReviewBlockedReason, string> = {
  cancelled: 'This trip was cancelled, so there is nothing to review.',
  not_paid: 'This booking has not been paid for yet.',
  not_happened_yet: 'You can write a review once the trip has happened.',
  already_reviewed: 'You have already reviewed this trip.',
};

export function canReviewBooking(
  booking: ReviewableBookingLike,
  nowISO: string,
  reviewedBookingIds: ReadonlySet<string> = new Set(),
): ReviewEligibility {
  if (reviewedBookingIds.has(booking.id)) return { ok: false, reason: 'already_reviewed' };
  if (booking.status === 'cancelled') return { ok: false, reason: 'cancelled' };
  if (!(REVIEWABLE_BOOKING_STATUSES as readonly string[]).includes(booking.status)) {
    return { ok: false, reason: 'not_paid' };
  }

  const startedAtISO = slotStartsAt(booking.dateISO, booking.time);
  const started = Date.parse(startedAtISO);
  const now = Date.parse(nowISO);
  // An unreadable date is treated as "not yet": offering the form on a row we cannot place in time
  // would send the guest to a submit that the database refuses.
  if (!Number.isFinite(started) || !Number.isFinite(now) || started > now) {
    return { ok: false, reason: 'not_happened_yet' };
  }
  return { ok: true, startedAtISO };
}
