/**
 * Booking and voucher state machines.
 *
 * PRD §9 fixes the eight voucher states. Making the transitions explicit (rather than letting any
 * code set any state) is what makes "redemption cannot be completed twice" checkable in a unit
 * test as well as in the database.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export const BOOKING_STATUSES = [
  'pending_payment',
  'confirmed',
  'cancelled',
  'completed',
  'refunded',
  'expired',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const bookingStatusSchema = z.enum(BOOKING_STATUSES);

const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  // Only the Stripe webhook moves a booking to `confirmed` (PRD §10: webhook is the source of
  // truth). `expired` is the reconciliation path when a webhook never arrives.
  pending_payment: ['confirmed', 'cancelled', 'expired'],
  confirmed: ['completed', 'cancelled', 'refunded'],
  cancelled: ['refunded'],
  completed: ['refunded'],
  refunded: [],
  expired: [],
};

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}

/** A booking that is safe to issue a voucher for. */
export function isBookingRedeemable(status: BookingStatus): boolean {
  return status === 'confirmed';
}

// ---------------------------------------------------------------------------
// Voucher — PRD §9, verbatim
// ---------------------------------------------------------------------------

export const VOUCHER_STATES = [
  'issued',
  'saved',
  'attached_to_booking',
  'active',
  'redeemed',
  'expired',
  'cancelled',
  'invalidated',
] as const;
export type VoucherState = (typeof VOUCHER_STATES)[number];
export const voucherStateSchema = z.enum(VOUCHER_STATES);

const VOUCHER_TRANSITIONS: Record<VoucherState, readonly VoucherState[]> = {
  issued: ['saved', 'attached_to_booking', 'active', 'expired', 'cancelled', 'invalidated'],
  // T-08: a tourist saves an offer voucher without booking.
  saved: ['attached_to_booking', 'active', 'expired', 'cancelled', 'invalidated'],
  attached_to_booking: ['active', 'expired', 'cancelled', 'invalidated'],
  active: ['redeemed', 'expired', 'cancelled', 'invalidated'],
  // Terminal. This single empty array is what makes double redemption impossible in the domain
  // layer; `redeem_voucher()` enforces the same rule under a row lock (V-05).
  redeemed: [],
  expired: [],
  cancelled: [],
  invalidated: [],
};

export function canTransitionVoucher(from: VoucherState, to: VoucherState): boolean {
  return VOUCHER_TRANSITIONS[from].includes(to);
}

export function isVoucherTerminal(state: VoucherState): boolean {
  return VOUCHER_TRANSITIONS[state].length === 0;
}

// ---------------------------------------------------------------------------
// Redemption outcome — every branch the scanner UI must render (V-04, V-05)
// ---------------------------------------------------------------------------

export const REDEMPTION_RESULTS = [
  'ok',
  'already_redeemed',
  'expired',
  'not_yet_valid',
  'wrong_vendor',
  'booking_not_paid',
  'cancelled',
  'invalidated',
  'unknown_token',
  'bad_signature',
] as const;
export type RedemptionResult = (typeof REDEMPTION_RESULTS)[number];
export const redemptionResultSchema = z.enum(REDEMPTION_RESULTS);

export type RedemptionOutcome =
  | { result: 'ok'; voucherId: string; redeemedAt: string }
  /** V-05 requires the original redemption timestamp be shown, so it is part of the type. */
  | { result: 'already_redeemed'; voucherId: string; originalRedeemedAt: string; originalScannerName: string | null }
  | { result: Exclude<RedemptionResult, 'ok' | 'already_redeemed'>; voucherId: string | null };

/** Every scan attempt is recorded, including failures — the audit trail catches attempted fraud. */
export function isRecordableScan(_result: RedemptionResult): boolean {
  return true;
}
