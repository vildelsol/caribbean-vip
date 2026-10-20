import { describe, expect, it } from 'vitest';
import {
  allowedDecisions,
  nextStatus,
  reasonRequired,
  reviewDecision,
} from './vendorReview';

/**
 * These tests assert the invariants of the review rules rather than a table of outcomes, in the
 * style the rest of the suite uses.
 */
describe('vendor review decisions', () => {
  it('only approval reaches the status every public policy gates on', () => {
    const toApproved = (['approve', 'reject', 'request_changes', 'suspend'] as const).filter(
      (d) => nextStatus(d) === 'approved',
    );
    expect(toApproved).toEqual(['approve']);
  });

  it('refuses a decision the current status does not permit', () => {
    const result = reviewDecision('approved', 'approve', '');
    expect(result.ok).toBe(false);
  });

  it('will not suspend a vendor that was never approved', () => {
    expect(allowedDecisions('pending_review')).not.toContain('suspend');
    expect(allowedDecisions('approved')).toContain('suspend');
  });

  it('requires a reason for every decision that costs the vendor something', () => {
    for (const decision of ['reject', 'request_changes', 'suspend'] as const) {
      expect(reasonRequired(decision)).toBe(true);
    }
    expect(reasonRequired('approve')).toBe(false);
  });

  it('treats a whitespace-only reason as no reason', () => {
    const result = reviewDecision('pending_review', 'reject', '   ');
    expect(result.ok).toBe(false);
  });

  it('persists the trimmed reason, not the raw input', () => {
    const result = reviewDecision('pending_review', 'reject', '  documents expired  ');
    expect(result).toMatchObject({ ok: true, reason: 'documents expired' });
  });

  it('records no reason rather than an empty string when approval carries none', () => {
    const result = reviewDecision('pending_review', 'approve', '  ');
    expect(result).toMatchObject({ ok: true, status: 'approved', reason: null });
  });

  it('never leaves a reviewed vendor in the queue statuses', () => {
    for (const decision of ['approve', 'reject', 'request_changes'] as const) {
      const next = nextStatus(decision);
      if (decision === 'request_changes') continue; // deliberately returns to the queue
      expect(['pending_review', 'changes_requested']).not.toContain(next);
    }
  });
});
