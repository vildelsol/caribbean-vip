import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATUSES,
  VOUCHER_STATES,
  canTransitionBooking,
  canTransitionVoucher,
  isBookingRedeemable,
  isVoucherTerminal,
} from './states';
import { isPubliclyVisible, mayTriggerGeofencedOffer } from './domain';

describe('voucher state machine (PRD §9)', () => {
  it('defines exactly the eight PRD states', () => {
    expect([...VOUCHER_STATES]).toEqual([
      'issued',
      'saved',
      'attached_to_booking',
      'active',
      'redeemed',
      'expired',
      'cancelled',
      'invalidated',
    ]);
  });

  it('cannot leave `redeemed` for any state — redemption is final (V-05)', () => {
    for (const to of VOUCHER_STATES) {
      expect(canTransitionVoucher('redeemed', to)).toBe(false);
    }
    expect(isVoucherTerminal('redeemed')).toBe(true);
  });

  it('cannot redeem from any state except `active`', () => {
    for (const from of VOUCHER_STATES) {
      expect(canTransitionVoucher(from, 'redeemed')).toBe(from === 'active');
    }
  });

  it('allows saving an offer without a booking (T-08)', () => {
    expect(canTransitionVoucher('issued', 'saved')).toBe(true);
    expect(canTransitionVoucher('saved', 'active')).toBe(true);
  });

  it('treats expired, cancelled and invalidated as terminal', () => {
    for (const s of ['expired', 'cancelled', 'invalidated'] as const) {
      expect(isVoucherTerminal(s)).toBe(true);
    }
  });
});

describe('booking state machine (PRD §10)', () => {
  it('only reaches `confirmed` from `pending_payment` — the webhook is the sole path', () => {
    for (const from of BOOKING_STATUSES) {
      expect(canTransitionBooking(from, 'confirmed')).toBe(from === 'pending_payment');
    }
  });

  it('only a confirmed booking is redeemable', () => {
    for (const s of BOOKING_STATUSES) {
      expect(isBookingRedeemable(s)).toBe(s === 'confirmed');
    }
  });

  it('cannot revive a refunded or expired booking', () => {
    for (const to of BOOKING_STATUSES) {
      expect(canTransitionBooking('refunded', to)).toBe(false);
      expect(canTransitionBooking('expired', to)).toBe(false);
    }
  });
});

describe('public visibility (T-03, V-02)', () => {
  it('requires BOTH an approved listing and an approved vendor', () => {
    expect(isPubliclyVisible('approved', 'approved')).toBe(true);
    expect(isPubliclyVisible('approved', 'pending_review')).toBe(false);
    expect(isPubliclyVisible('approved', 'suspended')).toBe(false);
    expect(isPubliclyVisible('draft', 'approved')).toBe(false);
    expect(isPubliclyVisible('pending_review', 'approved')).toBe(false);
    expect(isPubliclyVisible('unpublished', 'approved')).toBe(false);
    expect(isPubliclyVisible('rejected', 'approved')).toBe(false);
  });
});

describe('geofenced offer consent (T-07)', () => {
  it('requires both the OS permission and the in-app offer opt-in', () => {
    expect(mayTriggerGeofencedOffer({ osLocationGranted: true, offerOptIn: true })).toBe(true);
    expect(mayTriggerGeofencedOffer({ osLocationGranted: true, offerOptIn: false })).toBe(false);
    expect(mayTriggerGeofencedOffer({ osLocationGranted: false, offerOptIn: true })).toBe(false);
    expect(mayTriggerGeofencedOffer({ osLocationGranted: false, offerOptIn: false })).toBe(false);
  });
});
