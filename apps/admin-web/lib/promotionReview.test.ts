import { describe, expect, it } from 'vitest';
import {
  allowedPromotionDecisions,
  promotionDecision,
  promotionLane,
  promotionReasonRequired,
  promotionValueLabel,
  promotionVisibility,
} from './promotionReview';

describe('promotion oversight rules', () => {
  it('only approval reaches approved', () => {
    const states = ['pending', 'approved', 'rejected', 'disabled'] as const;
    const reaching = new Set<string>();
    for (const state of states) {
      for (const d of ['approve', 'reject', 'disable'] as const) {
        const r = promotionDecision(state, d, 'reason');
        if (r.ok && r.state === 'approved') reaching.add(d);
      }
    }
    expect([...reaching]).toEqual(['approve']);
  });

  it('offers a pending promotion approve and reject, a live one disable, a disabled one approve', () => {
    expect(allowedPromotionDecisions('pending')).toEqual(['approve', 'reject']);
    expect(allowedPromotionDecisions('approved')).toEqual(['disable']);
    expect(allowedPromotionDecisions('disabled')).toEqual(['approve']);
    expect(allowedPromotionDecisions('rejected')).toEqual([]);
  });

  it('refuses a decision the state does not allow', () => {
    expect(promotionDecision('approved', 'approve', '').ok).toBe(false);
    expect(promotionDecision('rejected', 'approve', '').ok).toBe(false);
    expect(promotionDecision('pending', 'disable', 'x').ok).toBe(false);
  });

  it('needs a reason to reject or disable, not to approve', () => {
    expect(promotionReasonRequired('approve')).toBe(false);
    expect(promotionDecision('pending', 'approve', '')).toMatchObject({ ok: true, state: 'approved', reason: null });
    expect(promotionDecision('pending', 'reject', '   ').ok).toBe(false);
    expect(promotionDecision('approved', 'disable', '').ok).toBe(false);
    expect(promotionDecision('approved', 'disable', ' off-season ')).toMatchObject({ ok: true, state: 'disabled', reason: 'off-season' });
  });

  it('sorts states into lanes, and rejected into none', () => {
    expect(promotionLane('pending')).toBe('waiting');
    expect(promotionLane('approved')).toBe('live');
    expect(promotionLane('disabled')).toBe('disabled');
    expect(promotionLane('rejected')).toBeNull();
  });
});

describe('promotion visibility', () => {
  const base = { approvalState: 'approved' as const, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-30T00:00:00Z', vendorStatus: 'approved' as const };
  const now = new Date('2026-10-31T12:00:00Z');

  it('is visible when approved, in window and the vendor is approved', () => {
    expect(promotionVisibility(base, now)).toEqual({ visible: true });
  });

  it('is held back for each reason separately', () => {
    expect(promotionVisibility({ ...base, approvalState: 'disabled' }, now)).toEqual({ visible: false, why: 'it is disabled' });
    expect(promotionVisibility({ ...base, startsAt: '2026-11-05T00:00:00Z' }, now)).toEqual({ visible: false, why: 'it has not started yet' });
    expect(promotionVisibility({ ...base, endsAt: '2026-10-30T00:00:00Z' }, now)).toEqual({ visible: false, why: 'it has ended' });
    expect(promotionVisibility({ ...base, vendorStatus: 'pending_review' }, now)).toEqual({ visible: false, why: 'the vendor is pending review' });
  });
});

describe('promotion value label', () => {
  it('describes each kind', () => {
    expect(promotionValueLabel({ valueKind: 'in_kind', valueRate: null, valueAmountMinor: null, currency: null })).toBe('In kind');
    expect(promotionValueLabel({ valueKind: 'percentage', valueRate: 0.1, valueAmountMinor: null, currency: null })).toBe('10% off');
    expect(promotionValueLabel({ valueKind: 'percentage', valueRate: 0.125, valueAmountMinor: null, currency: null })).toBe('12.5% off');
    expect(promotionValueLabel({ valueKind: 'fixed', valueRate: null, valueAmountMinor: 1500, currency: 'USD' })).toBe('$15.00 off');
  });
});
