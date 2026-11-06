import type { ReviewModerationState } from '@cvip/types';

/**
 * Review moderation decisions — the rules, with no I/O.
 *
 * `experience_ratings` (20260802000012) aggregates `moderation_state = 'published'` only, so these
 * transitions are the moment a guest's rating starts counting towards the number every tourist
 * sees on a listing. `guard_review_fields` lets an admin write any state and stamps `moderated_by`
 * from the session; this module is the console's narrower rule about which moves it offers, so the
 * page, the write path and the tests cannot disagree.
 */

/**
 * `audit_logs.entity_type` for review decisions. The table name, because
 * `audit_review_moderation()` (20261105000001) writes its own row for the same change under the
 * table name, and one entity must not be filed under two spellings.
 */
export const REVIEW_AUDIT_ENTITY = 'reviews';

export type ReviewDecision = 'publish' | 'reject' | 'unpublish' | 'restore';

const TRANSITIONS: Record<
  ReviewDecision,
  { from: readonly ReviewModerationState[]; to: ReviewModerationState }
> = {
  publish: { from: ['pending'], to: 'published' },
  reject: { from: ['pending'], to: 'rejected' },
  // Takes a live review off the listing, and with it its contribution to the public average.
  unpublish: { from: ['published'], to: 'rejected' },
  // The way back from a wrong call. Without it a mis-rejection is permanent, and the moderator's
  // only route is the SQL editor.
  restore: { from: ['rejected'], to: 'published' },
};

/**
 * Taking a review down, or keeping it down, costs the guest the review they wrote, so it carries a
 * recorded reason. Publishing does not, and neither does restoring: both are the review appearing
 * as its author intended.
 */
export function reviewReasonRequired(decision: ReviewDecision): boolean {
  return decision === 'reject' || decision === 'unpublish';
}

export function allowedReviewDecisions(state: ReviewModerationState): ReviewDecision[] {
  return (Object.keys(TRANSITIONS) as ReviewDecision[]).filter((d) =>
    TRANSITIONS[d].from.includes(state),
  );
}

export function nextReviewState(decision: ReviewDecision): ReviewModerationState {
  return TRANSITIONS[decision].to;
}

export function reviewDecision(
  state: ReviewModerationState,
  decision: ReviewDecision,
  reason: string,
):
  | { ok: true; state: ReviewModerationState; reason: string | null }
  | { ok: false; problem: string } {
  if (!allowedReviewDecisions(state).includes(decision)) {
    return { ok: false, problem: `A review that is "${state}" cannot be ${decision}ed.` };
  }
  const trimmed = reason.trim();
  if (reviewReasonRequired(decision) && trimmed.length === 0) {
    return { ok: false, problem: 'This decision needs a recorded reason.' };
  }
  return { ok: true, state: nextReviewState(decision), reason: trimmed.length > 0 ? trimmed : null };
}

export type ReviewLane = 'waiting' | 'live' | 'hidden';

/** Every state is a lane: unlike listings, there is no review a moderator cannot see. */
export function reviewLane(state: ReviewModerationState): ReviewLane {
  switch (state) {
    case 'pending':
      return 'waiting';
    case 'published':
      return 'live';
    case 'rejected':
      return 'hidden';
  }
}

export const REVIEW_LANE_TITLE: Record<ReviewLane, string> = {
  waiting: 'Waiting for a decision',
  live: 'Published',
  hidden: 'Not published',
};
