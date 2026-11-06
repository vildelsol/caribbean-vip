import type { ReviewModerationState } from '@cvip/types';
import type { MyReview, ReviewsClient } from '../data/reviewSubmission';
import { supabase } from './supabase';

/**
 * The live `ReviewsClient`, backed by Supabase.
 *
 * `reviews_self_read` lets the signed-in guest read their own rows whatever the moderation state,
 * so "in the queue" is something they can see rather than a promise. `reviews_self_write` plus
 * `guard_review_fields` decide whether the insert is allowed; this module does not duplicate those
 * rules, it only moves rows.
 *
 * Demo mode has no client: `listMyReviews` resolves empty and `insertReview` reports that there is
 * nothing to write to, so the screen renders its own copy instead of throwing.
 */

interface Row {
  booking_id: string;
  experience_id: string;
  rating: number;
  body: string | null;
  moderation_state: ReviewModerationState;
}

export function createReviewsClient(): ReviewsClient {
  return {
    async listMyReviews(): Promise<MyReview[]> {
      if (!supabase) return [];
      // No user filter: `reviews_self_read` already narrows this to the caller's own rows, and a
      // client-side filter would be a second, weaker copy of that rule.
      const { data, error } = await supabase
        .from('reviews')
        .select('booking_id, experience_id, rating, body, moderation_state')
        .limit(1000);
      if (error) throw new Error(error.message);
      return ((data ?? []) as Row[]).map((r) => ({
        bookingId: r.booking_id,
        experienceId: r.experience_id,
        rating: Number(r.rating),
        body: r.body,
        state: r.moderation_state,
      }));
    },

    async insertReview(row) {
      if (!supabase) return 'demo mode: there is no backend to save a review to';
      const { error } = await supabase.from('reviews').insert(row);
      return error ? error.message : null;
    },
  };
}
