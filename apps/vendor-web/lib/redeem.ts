'use client';

import type { RedemptionResult } from '@cvip/types';
import { demoBackend } from '@cvip/demo';
import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Voucher redemption for the vendor portal — V-04, V-05.
 *
 * Live path: the `redeem_voucher()` Postgres function. It is a database function on purpose
 * (AD-03) — it takes a row lock, so two scanners hitting the same voucher at the same moment
 * cannot both succeed. Moving that decision into this file would reintroduce exactly the race the
 * function exists to prevent.
 *
 * Demo path: `demoBackend.redeemScannedToken`, which really does verify the HMAC and really does
 * run the terminal-state machine. See its doc comment for the one concession it makes and why.
 */

export interface RedemptionView {
  result: RedemptionResult;
  /** Set only for `already_redeemed` — V-05 requires showing the first scan, not just refusing. */
  originalRedeemedAt: string | null;
  originalScanner: string | null;
  redeemedAt: string | null;
}

export const isDemoScanner = !isSupabaseConfigured;

export async function redeemToken(
  token: string,
  scannerName: string,
): Promise<RedemptionView> {
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    return {
      result: 'unknown_token',
      originalRedeemedAt: null,
      originalScanner: null,
      redeemedAt: null,
    };
  }

  if (isDemoScanner) {
    const outcome = await demoBackend.redeemScannedToken(trimmed, scannerName);
    return {
      result: outcome.result,
      originalRedeemedAt: outcome.originalRedeemedAt,
      originalScanner: outcome.originalScanner,
      redeemedAt: outcome.redeemedAt,
    };
  }

  const { data, error } = await supabase.rpc('redeem_voucher', {
    p_token: trimmed,
    p_scanner_name: scannerName,
  });

  if (error) {
    // A transport failure is not a redemption decision. Reporting it as `unknown_token` would tell
    // a vendor to turn a guest away because the network dropped.
    throw new Error(error.message);
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  return {
    result: (row?.result as RedemptionResult) ?? 'unknown_token',
    originalRedeemedAt: (row?.original_redeemed_at as string | null) ?? null,
    originalScanner: (row?.original_scanner as string | null) ?? null,
    redeemedAt: (row?.redeemed_at as string | null) ?? null,
  };
}

/**
 * How each outcome is presented.
 *
 * Every branch of `RedemptionResult` is here. A scanner that renders a generic "invalid" for an
 * outcome it does not recognise leaves a vendor with no idea whether to admit the guest, so the
 * exhaustive `Record` type is what forces a new result to be handled rather than absorbed.
 */
export const REDEMPTION_COPY: Record<
  RedemptionResult,
  { tone: 'ok' | 'warn' | 'fail'; headline: string; detail: string; admit: boolean }
> = {
  ok: {
    tone: 'ok',
    headline: 'Valid — admit the guest',
    detail: 'The voucher was accepted and is now redeemed. It will not work a second time.',
    admit: true,
  },
  already_redeemed: {
    tone: 'warn',
    headline: 'Already redeemed',
    detail: 'This voucher has been scanned before. Check the original scan below before admitting.',
    admit: false,
  },
  expired: {
    tone: 'fail',
    headline: 'Expired',
    detail: 'This voucher is past its validity window. The guest needs to rebook.',
    admit: false,
  },
  not_yet_valid: {
    tone: 'warn',
    headline: 'Not valid yet',
    detail: 'This booking is for a later departure. Check the date with the guest.',
    admit: false,
  },
  wrong_vendor: {
    tone: 'fail',
    headline: 'Wrong vendor',
    detail: 'This voucher belongs to a different operator. It cannot be redeemed here.',
    admit: false,
  },
  booking_not_paid: {
    tone: 'fail',
    headline: 'Not paid',
    detail: 'The booking behind this voucher is not confirmed. Do not admit the guest.',
    admit: false,
  },
  cancelled: {
    tone: 'fail',
    headline: 'Booking cancelled',
    detail: 'This booking was cancelled, so the voucher is void.',
    admit: false,
  },
  invalidated: {
    tone: 'fail',
    headline: 'Voucher invalidated',
    detail: 'This voucher was invalidated by support. Contact Caribbean VIP before admitting.',
    admit: false,
  },
  unknown_token: {
    tone: 'fail',
    headline: 'Not recognised',
    detail: 'No voucher matches this code. Check for a typo, or ask for the booking reference.',
    admit: false,
  },
  bad_signature: {
    tone: 'fail',
    headline: 'Invalid signature',
    detail: 'This code was not issued by Caribbean VIP. Do not admit the guest.',
    admit: false,
  },
};
