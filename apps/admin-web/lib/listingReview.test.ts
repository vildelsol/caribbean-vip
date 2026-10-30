import { describe, expect, it } from 'vitest';
import {
  allowedListingDecisions,
  listingDecision,
  listingLane,
  listingReasonRequired,
  nextListingStatus,
} from './listingReview';

describe('listing moderation rules', () => {
  it('only approval reaches approved', () => {
    const toApproved = (['approve', 'reject', 'unpublish'] as const).filter((d) => nextListingStatus(d) === 'approved');
    expect(toApproved).toEqual(['approve']);
  });

  it('cannot approve a draft the vendor has not submitted', () => {
    expect(allowedListingDecisions('draft')).toEqual([]);
    expect(listingDecision('draft', 'approve', '').ok).toBe(false);
  });

  it('only unpublishes a live listing', () => {
    expect(allowedListingDecisions('approved')).toEqual(['unpublish']);
    expect(allowedListingDecisions('pending_review')).not.toContain('unpublish');
  });

  it('requires a reason for reject and unpublish, trimmed', () => {
    expect(listingReasonRequired('approve')).toBe(false);
    expect(listingDecision('pending_review', 'reject', '   ').ok).toBe(false);
    expect(listingDecision('approved', 'unpublish', '').ok).toBe(false);
    const r = listingDecision('pending_review', 'reject', '  blurry photos ');
    expect(r).toEqual({ ok: true, status: 'rejected', reason: 'blurry photos' });
  });

  it('puts each reviewable status in one lane and the rest in none', () => {
    expect(listingLane('pending_review')).toBe('waiting');
    expect(listingLane('approved')).toBe('live');
    for (const s of ['draft', 'rejected', 'unpublished'] as const) expect(listingLane(s)).toBeNull();
  });
});
