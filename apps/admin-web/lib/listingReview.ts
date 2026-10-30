import type { ListingStatus } from '@cvip/types';

/**
 * Listing moderation decisions — the rules, with no I/O.
 *
 * `experiences.status` is what the public read policy checks (together with the vendor's own
 * status), so these transitions are the moment a listing reaches tourists. The database guard
 * `guard_listing_review_fields` lets an admin write any status and stamps the reviewer; this module
 * is the console's narrower rule about which moves it offers, so the page, the write path and the
 * tests cannot disagree.
 */

export type ListingDecision = 'approve' | 'reject' | 'unpublish';

const TRANSITIONS: Record<ListingDecision, { from: readonly ListingStatus[]; to: ListingStatus }> = {
  approve: { from: ['pending_review'], to: 'approved' },
  reject: { from: ['pending_review'], to: 'rejected' },
  // The one decision that takes a live listing off the public site.
  unpublish: { from: ['approved'], to: 'unpublished' },
};

/** Reject and unpublish cost the vendor something, so they carry a recorded reason. Approve does not. */
export function listingReasonRequired(decision: ListingDecision): boolean {
  return decision !== 'approve';
}

export function allowedListingDecisions(status: ListingStatus): ListingDecision[] {
  return (Object.keys(TRANSITIONS) as ListingDecision[]).filter((d) => TRANSITIONS[d].from.includes(status));
}

export function nextListingStatus(decision: ListingDecision): ListingStatus {
  return TRANSITIONS[decision].to;
}

export function listingDecision(
  status: ListingStatus,
  decision: ListingDecision,
  reason: string,
): { ok: true; status: ListingStatus; reason: string | null } | { ok: false; problem: string } {
  if (!allowedListingDecisions(status).includes(decision)) {
    return { ok: false, problem: `A listing with status "${status}" cannot be ${decision}d.` };
  }
  const trimmed = reason.trim();
  if (listingReasonRequired(decision) && trimmed.length === 0) {
    return { ok: false, problem: 'This decision needs a recorded reason.' };
  }
  return { ok: true, status: nextListingStatus(decision), reason: trimmed.length > 0 ? trimmed : null };
}

export type ListingLane = 'waiting' | 'live';

/** Reviewable listings: submitted ones wait for a decision, approved ones can be taken down. */
export function listingLane(status: ListingStatus): ListingLane | null {
  if (status === 'pending_review') return 'waiting';
  if (status === 'approved') return 'live';
  return null;
}
