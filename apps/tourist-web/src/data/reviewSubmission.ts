import { checkReviewDraft, type ReviewDraftInput, type ReviewModerationState } from '@cvip/types';
import {
  canReviewBooking,
  REVIEW_BLOCKED_COPY,
  type ReviewableBookingLike,
} from './reviewEligibility';

/**
 * Sending a guest's review, and reading back the ones they have already written.
 *
 * The client is passed in rather than imported, as in `lib/offers.ts`, so a test never reaches a
 * network and demo mode does nothing at all. Both checks — is this booking reviewable, is this
 * draft valid — run here before anything is sent, because the database refuses the same cases and
 * a refusal that reaches the guest as a raw Postgres message is a bug in its own right.
 *
 * `moderation_state` is never sent. `guard_review_fields` overwrites it with `pending` anyway, and
 * sending it would imply the client has a say.
 */

export interface MyReview {
  bookingId: string;
  experienceId: string;
  rating: number;
  body: string | null;
  state: ReviewModerationState;
}

export interface ReviewsClient {
  /** Resolves the guest's own reviews, or throws. Demo mode resolves an empty list. */
  listMyReviews(): Promise<MyReview[]>;
  /** Resolves a database error message, or null on success. */
  insertReview(row: {
    booking_id: string;
    experience_id: string;
    rating: number;
    body: string | null;
  }): Promise<string | null>;
}

export type SubmitResult = { ok: true } | { ok: false; problem: string };

/**
 * What the guest is told when the database refuses.
 *
 * `guard_review_fields` raises `review_denied: <why>` under errcode 42501. Those strings are
 * written for an operator reading logs, so they are mapped rather than shown. Anything
 * unrecognised becomes one plain sentence: a raw Postgres message tells a guest nothing they can
 * act on and leaks our schema.
 */
export function guestFacingError(message: string): string {
  const m = message.toLowerCase();
  // Demo mode has no backend at all. "Try again in a moment" would invite a retry that can
  // never work, so it is named for what it is.
  if (m.includes('demo mode')) return 'This is the demo, so there is nothing to save to.';
  if (m.includes('not your booking')) return 'That booking is not on this account.';
  if (m.includes('experience that was booked')) return 'That review does not match the trip you booked.';
  if (m.includes('has not happened yet')) return REVIEW_BLOCKED_COPY.not_happened_yet;
  if (m.includes('duplicate key') || m.includes('unique')) return REVIEW_BLOCKED_COPY.already_reviewed;
  if (m.includes('reviews_body_length')) return 'That review is too long to save.';
  if (m.includes('rating')) return 'Choose between 1 and 5 stars.';
  return 'That review could not be saved. Try again in a moment.';
}

export async function submitReview(
  client: ReviewsClient,
  booking: ReviewableBookingLike & { experienceId: string },
  draft: ReviewDraftInput,
  nowISO: string,
  reviewedBookingIds: ReadonlySet<string> = new Set(),
): Promise<SubmitResult> {
  const eligible = canReviewBooking(booking, nowISO, reviewedBookingIds);
  if (!eligible.ok) return { ok: false, problem: REVIEW_BLOCKED_COPY[eligible.reason] };

  const checked = checkReviewDraft(draft);
  if (!checked.ok) return { ok: false, problem: checked.problem };

  const error = await client.insertReview({
    booking_id: booking.id,
    experience_id: booking.experienceId,
    rating: checked.draft.rating,
    body: checked.draft.body,
  });
  if (error) return { ok: false, problem: guestFacingError(error) };
  return { ok: true };
}

/** Booking ids the guest has already reviewed, for `canReviewBooking`. */
export function reviewedBookingIds(reviews: readonly MyReview[]): Set<string> {
  return new Set(reviews.map((r) => r.bookingId));
}
