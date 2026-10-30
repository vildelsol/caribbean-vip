import { describe, expect, it } from 'vitest';
import { approvalReadiness, documentRequirementsFor, requirementStatuses, type DocumentRecord } from '@cvip/types';
import {
  allowedDecisions,
  nextStatus,
  reasonRequired,
  reviewDecision,
  documentsGate,
  needsAttention,
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

describe('documentsGate', () => {
  const NOW = new Date('2026-10-29T12:00:00Z');
  const reqs = documentRequirementsFor('JM', 'water');
  const accepted = (kind: string): DocumentRecord => ({
    kind,
    reviewState: 'accepted',
    expiresOn: '2027-12-31',
    createdAt: '2026-10-01T00:00:00Z',
  });
  const readiness = (docs: DocumentRecord[]) => approvalReadiness(requirementStatuses(reqs, docs, NOW));
  const complete = readiness(reqs.filter((r) => r.level === 'required').map((r) => accepted(r.key)));
  const incomplete = readiness([]);

  it('lets an approval through when every required document is accepted', () => {
    expect(documentsGate('approve', complete, false, '')).toEqual({ ok: true, waived: false });
  });

  it('refuses an approval while required documents are missing, and names them', () => {
    const gate = documentsGate('approve', incomplete, false, '');
    expect(gate.ok).toBe(false);
    expect(gate.ok === false && gate.problem).toContain('Water sports operator licence');
  });

  it('allows an exception only with a reason, and reports it as waived', () => {
    expect(documentsGate('approve', incomplete, true, '   ').ok).toBe(false);
    expect(documentsGate('approve', incomplete, true, 'Counsel confirmed no licence needed')).toEqual({
      ok: true,
      waived: true,
    });
  });

  it('does not gate refusing, requesting changes or suspending', () => {
    for (const d of ['reject', 'request_changes', 'suspend'] as const) {
      expect(documentsGate(d, incomplete, false, '')).toEqual({ ok: true, waived: false });
    }
  });

  it('does not gate when there is no dossier (demo)', () => {
    expect(documentsGate('approve', null, false, '')).toEqual({ ok: true, waived: false });
  });
});

describe('needsAttention', () => {
  const NOW = new Date('2026-10-29T12:00:00Z');
  const reqs = documentRequirementsFor('JM', 'wellness');
  const doc = (kind: string, reviewState: DocumentRecord['reviewState'], expiresOn: string | null = '2027-12-31'): DocumentRecord => ({
    kind,
    reviewState,
    expiresOn,
    createdAt: '2026-10-01T00:00:00Z',
  });
  const allAccepted = reqs.filter((r) => r.level === 'required').map((r) => doc(r.key, 'accepted'));
  const check = (docs: DocumentRecord[]) =>
    needsAttention(approvalReadiness(requirementStatuses(reqs, docs, NOW)), docs);

  it('leaves alone a vendor whose required documents are all accepted and in date (positive control)', () => {
    expect(check(allAccepted)).toBeNull();
  });

  it('flags a vendor approved with nothing on file, as vendors approved before the policy are', () => {
    expect(check([])).toEqual({ awaitingReview: 0, requiredOutstanding: reqs.filter((r) => r.level === 'required').length });
  });

  it('flags a renewal waiting for review even when everything required is accepted', () => {
    const renewal = { ...doc('owner_id', 'pending'), createdAt: '2026-10-28T00:00:00Z' };
    const r = check([...allAccepted, renewal]);
    expect(r?.awaitingReview).toBe(1);
  });

  it('flags a licence that expired after approval', () => {
    const docs = allAccepted.map((d) => (d.kind === 'public_liability' ? doc(d.kind, 'accepted', '2026-01-01') : d));
    expect(check(docs)).toEqual({ awaitingReview: 0, requiredOutstanding: 1 });
  });

  it('flags a rejected required document', () => {
    const docs = allAccepted.map((d) => (d.kind === 'bank_proof' ? doc(d.kind, 'rejected') : d));
    expect(check(docs)?.requiredOutstanding).toBe(1);
  });

  it('flags an upload waiting for review when that upload is the only reason', () => {
    // Water sports: every required item accepted, plus an unreviewed upload for a conditional item.
    // Nothing required is outstanding, so only the pending file can put this vendor on the list.
    const water = documentRequirementsFor('JM', 'water');
    const docs = [
      ...water.filter((r) => r.level === 'required').map((r) => doc(r.key, 'accepted')),
      doc('jm.fisheries_licence', 'pending'),
    ];
    const r = needsAttention(approvalReadiness(requirementStatuses(water, docs, NOW)), docs);
    expect(r).toEqual({ awaitingReview: 1, requiredOutstanding: 0 });
  });

  it('has nothing to say without a dossier (demo)', () => {
    expect(needsAttention(null, [])).toBeNull();
  });
});
