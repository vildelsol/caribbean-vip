import { formatMoney, type ApprovalState, type Currency, type VendorStatus } from '@cvip/types';

/**
 * Promotion oversight decisions — the rules, with no I/O.
 *
 * `promotions.approval_state` is what `promotions_public_read` checks, together with the offer's
 * window and its vendor's status. These transitions are the moment an offer can reach tourists.
 * `guard_promotion_review_fields` stamps the reviewer and refuses a vendor the same decisions.
 */

/**
 * `audit_logs.entity_type` for promotion decisions: the table name, matching the trigger rows
 * written by `audit_promotion_approval()`.
 */
export const PROMOTION_AUDIT_ENTITY = 'promotions';

export type PromotionDecision = 'approve' | 'reject' | 'disable';

const TRANSITIONS: Record<PromotionDecision, { from: readonly ApprovalState[]; to: ApprovalState }> = {
  // From disabled too: an admin may put a taken-down offer back live.
  approve: { from: ['pending', 'disabled'], to: 'approved' },
  reject: { from: ['pending'], to: 'rejected' },
  // The one decision that takes a live offer off the public site.
  disable: { from: ['approved'], to: 'disabled' },
};

/** Reject and disable cost the vendor something, so they carry a recorded reason. Approve does not. */
export function promotionReasonRequired(decision: PromotionDecision): boolean {
  return decision !== 'approve';
}

export function allowedPromotionDecisions(state: ApprovalState): PromotionDecision[] {
  return (Object.keys(TRANSITIONS) as PromotionDecision[]).filter((d) => TRANSITIONS[d].from.includes(state));
}

export function nextPromotionState(decision: PromotionDecision): ApprovalState {
  return TRANSITIONS[decision].to;
}

export function promotionDecision(
  state: ApprovalState,
  decision: PromotionDecision,
  reason: string,
): { ok: true; state: ApprovalState; reason: string | null } | { ok: false; problem: string } {
  if (!allowedPromotionDecisions(state).includes(decision)) {
    return { ok: false, problem: `A promotion that is ${state} cannot be ${decision}d.` };
  }
  const trimmed = reason.trim();
  if (promotionReasonRequired(decision) && trimmed.length === 0) {
    return { ok: false, problem: 'This decision needs a recorded reason.' };
  }
  return { ok: true, state: nextPromotionState(decision), reason: trimmed.length > 0 ? trimmed : null };
}

export type PromotionLane = 'waiting' | 'live' | 'disabled';

/** Rejected promotions leave the queue: nothing more an admin can do with them here. */
export function promotionLane(state: ApprovalState): PromotionLane | null {
  if (state === 'pending') return 'waiting';
  if (state === 'approved') return 'live';
  if (state === 'disabled') return 'disabled';
  return null;
}

export interface PromotionVisibilityInput {
  approvalState: ApprovalState;
  startsAt: string;
  endsAt: string;
  vendorStatus: VendorStatus;
}

/**
 * Whether tourists can see an approved offer right now, mirroring `promotions_public_read`: approved,
 * inside its window, and the vendor approved. `why` is what the detail pane tells the admin.
 */
export function promotionVisibility(
  p: PromotionVisibilityInput,
  now: Date,
): { visible: true } | { visible: false; why: string } {
  if (p.approvalState !== 'approved') return { visible: false, why: `it is ${p.approvalState}` };
  if (now.getTime() < new Date(p.startsAt).getTime()) return { visible: false, why: 'it has not started yet' };
  if (now.getTime() > new Date(p.endsAt).getTime()) return { visible: false, why: 'it has ended' };
  if (p.vendorStatus !== 'approved') return { visible: false, why: `the vendor is ${p.vendorStatus.replace('_', ' ')}` };
  return { visible: true };
}

/** Short description of what the offer is worth, for the queue and the detail pane. */
export function promotionValueLabel(p: {
  valueKind: 'percentage' | 'fixed' | 'in_kind';
  valueRate: number | null;
  valueAmountMinor: number | null;
  currency: string | null;
}): string {
  if (p.valueKind === 'in_kind') return 'In kind';
  if (p.valueKind === 'percentage') {
    return p.valueRate === null ? 'Percentage off' : `${Math.round(p.valueRate * 10000) / 100}% off`;
  }
  return p.valueAmountMinor === null || p.currency === null
    ? 'Fixed amount off'
    : `${formatMoney({ amountMinor: p.valueAmountMinor, currency: p.currency as Currency })} off`;
}
