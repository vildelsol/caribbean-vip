import { z } from 'zod';

/**
 * What a guest's review may contain.
 *
 * ## Keep these in step
 *
 * `REVIEW_LIMITS.body` is enforced again in
 * `supabase/migrations/20261105000001_review_moderation_audit.sql` as `reviews_body_length`, and
 * again on the textarea in the tourist app. `review.test.ts` reads that migration and fails if the
 * numbers drift, because a form that accepts what the database rejects is a submit button that
 * fails for a reason the guest cannot see.
 *
 * The rating bounds mirror the column's own `check (rating between 1 and 5)` from
 * `20260802000008_platform.sql`.
 */
export const REVIEW_LIMITS = {
  ratingMin: 1,
  ratingMax: 5,
  body: 2000,
} as const;

/**
 * A review the guest has typed but not sent.
 *
 * The body is optional: a rating on its own is a complete review, and the column is nullable. An
 * empty or whitespace-only body is stored as NULL rather than as `''`, so "left blank" is one
 * value in the database instead of two.
 */
export const reviewDraftSchema = z.object({
  rating: z
    .number()
    .int('Choose a whole number of stars.')
    .min(REVIEW_LIMITS.ratingMin, 'Choose between 1 and 5 stars.')
    .max(REVIEW_LIMITS.ratingMax, 'Choose between 1 and 5 stars.'),
  body: z
    .string()
    .trim()
    .max(REVIEW_LIMITS.body, `Keep it under ${REVIEW_LIMITS.body} characters.`)
    .transform((s) => (s.length === 0 ? null : s))
    .nullable()
    .default(null),
});

export type ReviewDraftInput = z.input<typeof reviewDraftSchema>;
export type ReviewDraft = z.output<typeof reviewDraftSchema>;

export type ReviewDraftCheck =
  | { ok: true; draft: ReviewDraft }
  | { ok: false; problem: string };

/**
 * Check a draft, with one message a person can act on.
 *
 * Returns the first problem rather than a list: the form has two fields, and a list of one reads
 * like a form that is harder to fill in than it is.
 */
export function checkReviewDraft(input: ReviewDraftInput): ReviewDraftCheck {
  const parsed = reviewDraftSchema.safeParse(input);
  if (parsed.success) return { ok: true, draft: parsed.data };
  return { ok: false, problem: parsed.error.issues[0]?.message ?? 'That review cannot be sent.' };
}

/**
 * What the guest is told about a review they have already sent.
 *
 * `pending` is deliberately not called "awaiting approval" in the UI copy this maps to — a guest
 * who reads that their review needs approving writes a different review next time. It is in a
 * queue; that is all this says.
 */
export type ReviewModerationState = 'pending' | 'published' | 'rejected';

export function reviewStateLabel(state: ReviewModerationState): string {
  switch (state) {
    case 'published':
      return 'Published';
    case 'rejected':
      return 'Not published';
    case 'pending':
      return 'In the queue';
  }
}
