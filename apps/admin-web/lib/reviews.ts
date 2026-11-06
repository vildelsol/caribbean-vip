'use client';

import { DEMO_EXPERIENCES } from '@cvip/demo';
import type { ReviewModerationState } from '@cvip/types';
import { supabase, isSupabaseConfigured } from './supabase';
import { REVIEW_AUDIT_ENTITY, reviewDecision, type ReviewDecision } from './reviewModeration';

/**
 * Review moderation data access.
 *
 * Live path: `reviews` directly. `reviews_admin_all` admits `is_admin()` for both read and write,
 * and `guard_review_fields` stamps `moderated_by` from `auth.uid()`, so the browser does not send
 * it. `audit_review_moderation()` writes the database's own audit row; each decision also writes a
 * console row through `write_audit_log()` to carry the reason.
 *
 * Demo path: the featured demo quotes, mutated in memory and reset on reload, like listing review.
 *
 * ## Why no guest name
 *
 * Deciding whether a review may be published is a judgement about its text, not about who wrote
 * it, so this screen never reads `profiles`. A moderator who genuinely needs the author — a
 * suspected pattern across bookings — has `reviews_admin_all` and the audit trail, and taking that
 * route leaves a record. Pulling the name into every row would mean every routine moderation is
 * also a disclosure of who said what about whom. [[feedback-privacy-by-design]]
 */

export interface ModeratableReview {
  id: string;
  experienceId: string;
  experienceTitle: string;
  rating: number;
  body: string | null;
  state: ReviewModerationState;
  createdAtISO: string;
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

const demoState = new Map<string, ReviewModerationState>();

/**
 * The seeded featured quotes, as moderatable rows.
 *
 * They start `pending` so the queue is not empty in a walkthrough. Ratings come from the demo
 * experience's own average rounded to a whole star — nothing is invented that the dataset does not
 * already carry.
 */
function demoReviews(): ModeratableReview[] {
  return DEMO_EXPERIENCES.filter((e) => e.review).map((e) => ({
    id: `demo-review-${e.id}`,
    experienceId: e.id,
    experienceTitle: e.title,
    rating: Math.max(1, Math.min(5, Math.round(e.ratingAverage ?? 5))),
    body: e.review!.quote,
    state: demoState.get(`demo-review-${e.id}`) ?? 'pending',
    createdAtISO: e.review!.date,
  }));
}

// ---------------------------------------------------------------------------
// Live
// ---------------------------------------------------------------------------

interface ReviewRow {
  id: string;
  experience_id: string;
  rating: number;
  body: string | null;
  moderation_state: ReviewModerationState;
  created_at: string;
}

export async function listModeratableReviews(): Promise<ModeratableReview[]> {
  if (!isSupabaseConfigured) return demoReviews();

  // PostgREST caps a page at 1000 rows. Oldest first, so the queue is answered in the order guests
  // wrote in; a moderator who never reaches the end still never leaves the oldest waiting.
  const { data, error } = await supabase
    .from('reviews')
    .select('id, experience_id, rating, body, moderation_state, created_at')
    .order('created_at', { ascending: true })
    .limit(1000);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ReviewRow[];
  if (rows.length === 0) return [];

  // Two reads rather than an embedded select: `database.types.ts` is hand-written and declares no
  // relationships, so the embed does not type-check and guessing at it would hide a real error.
  const ids = [...new Set(rows.map((r) => r.experience_id))];
  const { data: experiences, error: expError } = await supabase
    .from('experiences')
    .select('id, title')
    .in('id', ids);
  if (expError) throw new Error(expError.message);
  const titleById = new Map((experiences ?? []).map((e) => [e.id, e.title]));

  return rows.map((row) => ({
    id: row.id,
    experienceId: row.experience_id,
    // Never invent a title the row does not have; say the listing is gone instead.
    experienceTitle: titleById.get(row.experience_id) ?? 'Listing no longer available',
    rating: Number(row.rating),
    body: row.body,
    state: row.moderation_state,
    createdAtISO: row.created_at,
  }));
}

export async function decideReview(
  review: ModeratableReview,
  decision: ReviewDecision,
  reason: string,
): Promise<{ state: ReviewModerationState }> {
  const checked = reviewDecision(review.state, decision, reason);
  if (!checked.ok) throw new Error(checked.problem);

  if (!isSupabaseConfigured) {
    demoState.set(review.id, checked.state);
    return { state: checked.state };
  }

  // `moderated_by` is left to the database guard, which takes it from the session. A browser that
  // sends it is a browser that can claim someone else made the call.
  const { error } = await supabase
    .from('reviews')
    .update({ moderation_state: checked.state })
    .eq('id', review.id);
  if (error) throw new Error(error.message);

  // Surfaced, not swallowed: an unrecorded moderation is worse than a visibly failed one. The
  // database trigger has already written its own row for the transition; this one carries the why.
  const { error: auditError } = await supabase.rpc('write_audit_log', {
    p_action: `review.${decision}`,
    p_entity_type: REVIEW_AUDIT_ENTITY,
    p_entity_id: review.id,
    p_before: { moderation_state: review.state },
    p_after: { moderation_state: checked.state },
    p_reason: checked.reason,
  });
  if (auditError) {
    throw new Error(
      `The review is now ${checked.state}, but the audit entry failed to write: ${auditError.message}`,
    );
  }

  return { state: checked.state };
}
