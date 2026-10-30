import type { ApprovalReadiness, DocumentRecord, VendorStatus } from '@cvip/types';

/**
 * Vendor review decisions — the rules, with no I/O.
 *
 * PRD §7 lists the console's vendor actions as "approve, reject, request changes, suspend — each
 * with a recorded reason". This module owns which of those a given status permits and which need
 * a reason, so the page, the write path and the tests cannot disagree about it.
 *
 * `vendor_organizations.status` is the gate every public RLS policy reads. Nothing becomes
 * publicly visible until it reads `approved`, so these transitions are the moment a vendor
 * enters the marketplace.
 */

export type ReviewDecision = 'approve' | 'reject' | 'request_changes' | 'suspend';

/** The statuses an admin is expected to act on, in the order the queue should show them. */
export const REVIEW_QUEUE_STATUSES: readonly VendorStatus[] = [
  'pending_review',
  'changes_requested',
] as const;

const TRANSITIONS: Record<ReviewDecision, { from: readonly VendorStatus[]; to: VendorStatus }> = {
  approve: { from: ['pending_review', 'changes_requested'], to: 'approved' },
  reject: { from: ['pending_review', 'changes_requested'], to: 'rejected' },
  request_changes: { from: ['pending_review'], to: 'changes_requested' },
  // Suspension is not part of the intake queue: it acts on a vendor already in the marketplace,
  // and it is the one decision that removes listings from public view.
  suspend: { from: ['approved'], to: 'suspended' },
};

/**
 * Whether a reason is mandatory.
 *
 * PRD §7 says "each with a recorded reason". Approve is the deliberate exception: requiring a
 * sentence to wave through a vendor whose documents are in order buys nothing and trains
 * reviewers to type "ok". The three decisions that cost a vendor something — reject, request
 * changes, suspend — all require one, because those are the ones a vendor will dispute.
 */
export function reasonRequired(decision: ReviewDecision): boolean {
  return decision !== 'approve';
}

export function allowedDecisions(status: VendorStatus): ReviewDecision[] {
  return (Object.keys(TRANSITIONS) as ReviewDecision[]).filter((d) =>
    TRANSITIONS[d].from.includes(status),
  );
}

export function nextStatus(decision: ReviewDecision): VendorStatus {
  return TRANSITIONS[decision].to;
}

export interface ReviewRejection {
  ok: false;
  problem: string;
}

export interface ReviewAccepted {
  ok: true;
  status: VendorStatus;
  reason: string | null;
}

/**
 * Validates a decision against the vendor's current status and the typed reason.
 *
 * Returns the resulting status and the trimmed reason rather than performing the write, so the
 * page can disable a control and the write path can refuse the same input for the same stated
 * problem. The trimmed value is what callers must persist — a reason of three spaces satisfies
 * `char_length` in Postgres but records nothing.
 */
export function reviewDecision(
  status: VendorStatus,
  decision: ReviewDecision,
  reason: string,
): ReviewAccepted | ReviewRejection {
  if (!allowedDecisions(status).includes(decision)) {
    return {
      ok: false,
      problem: `A vendor with status "${status}" cannot be ${decision.replace('_', ' ')}d.`,
    };
  }

  const trimmed = reason.trim();
  if (reasonRequired(decision) && trimmed.length === 0) {
    return { ok: false, problem: 'This decision needs a recorded reason.' };
  }

  return { ok: true, status: nextStatus(decision), reason: trimmed.length > 0 ? trimmed : null };
}

export interface DocumentsGateRejection {
  ok: false;
  problem: string;
}

/**
 * Whether the documents allow an approval.
 *
 * The policy is strict: nothing is approved until every required document for the vendor's island
 * and business type is accepted and unexpired. An admin can still approve with a recorded
 * exception, because some requirements are flagged as awaiting counsel and a rule that cannot be
 * overridden turns a legal question into a stuck vendor. The exception needs a reason, and the
 * write path puts it and the missing items in the audit log, so waiving is a decision with a name
 * on it rather than a quiet gap.
 *
 * Only `approve` is gated. Rejecting, requesting changes and suspending never need documents.
 */
export function documentsGate(
  decision: ReviewDecision,
  readiness: ApprovalReadiness | null,
  waive: boolean,
  reason: string,
): { ok: true; waived: boolean } | DocumentsGateRejection {
  if (decision !== 'approve' || readiness === null || readiness.ready) return { ok: true, waived: false };

  const missing = readiness.blocking.map((b) => b.requirement.label).join(', ');
  if (!waive) {
    return { ok: false, problem: `Required documents are not accepted yet: ${missing}.` };
  }
  if (reason.trim().length === 0) {
    return { ok: false, problem: 'Approving without the required documents needs a recorded reason.' };
  }
  return { ok: true, waived: true };
}

export interface AttentionReasons {
  /** Uploads nobody has reviewed yet. */
  awaitingReview: number;
  /** Required items not accepted and in date: missing, rejected, pending or expired. */
  requiredOutstanding: number;
}

/**
 * Why an APPROVED vendor needs an admin, or null if it does not.
 *
 * Approval only checks documents at the moment of approving. After that a licence can expire, a
 * renewal can arrive unreviewed, and vendors approved before the document policy existed have
 * nothing on file at all. Each of those leaves a public vendor short of the standard, so the
 * console surfaces them instead of leaving them in a collapsed list. Vendors still in the intake
 * queue are not covered here: their card already shows the checklist.
 */
export function needsAttention(
  readiness: ApprovalReadiness | null,
  documents: readonly DocumentRecord[],
): AttentionReasons | null {
  if (readiness === null) return null;
  const awaitingReview = documents.filter((d) => d.reviewState === 'pending').length;
  const requiredOutstanding = readiness.blocking.length;
  return awaitingReview > 0 || requiredOutstanding > 0 ? { awaitingReview, requiredOutstanding } : null;
}

export type ReviewLane = 'waiting' | 'attention' | 'approved';

/**
 * Sorts vendors into the three lanes the console works from.
 *
 * Anything not approved is waiting on a decision. An approved vendor is in `attention` only when
 * `needsAttention` flagged it; every other approved vendor is simply `approved`. Each vendor lands
 * in exactly one lane, so the counts on screen always add up to the vendors loaded.
 */
export function reviewLane(
  vendor: { id: string; status: VendorStatus },
  flagged: ReadonlySet<string>,
): ReviewLane {
  if (vendor.status !== 'approved') return 'waiting';
  return flagged.has(vendor.id) ? 'attention' : 'approved';
}
