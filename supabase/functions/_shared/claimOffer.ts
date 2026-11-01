/**
 * The pure edges of `claim-offer`: what it accepts, whether the guest was really shown the offer,
 * and what it hands back. Same split as `offerQuery.ts`: the function around it needs Deno and a
 * live Supabase.
 */

export type ClaimRequest = { ok: true; promotionId: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates the body. The caller comes from Auth, never from this. */
export function parseClaimRequest(body: unknown): ClaimRequest {
  if (typeof body !== 'object' || body === null) return { ok: false, message: 'Send a JSON body.' };
  const id = (body as Record<string, unknown>).promotionId;
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, message: 'promotionId must be a UUID.' };
  return { ok: true, promotionId: id.toLowerCase() };
}

/**
 * How long after `eligible-offer` showed an offer the guest may still claim it. Long enough to read
 * the terms and walk to the door, short enough that a stale screen cannot claim an offer that has
 * since been disabled or sold out without the claim function noticing: it re-checks both anyway.
 */
export const CLAIM_WINDOW_MS = 30 * 60 * 1000;

/**
 * A claim is only honoured for an offer this guest was actually shown, recently. The position is
 * not re-checked: they may have moved since, and the fence only decides what to *show*. What stops
 * a client naming any promotion id it likes is this: no impression, no claim.
 */
export function wasShownRecently(
  impressions: ReadonlyArray<{ promotion_id: string; shown_at: string }>,
  promotionId: string,
  nowMs: number,
  windowMs: number = CLAIM_WINDOW_MS,
): boolean {
  return impressions.some((i) => {
    if (i.promotion_id !== promotionId) return false;
    const at = Date.parse(i.shown_at);
    return !Number.isNaN(at) && at <= nowMs && nowMs - at <= windowMs;
  });
}

/** Voucher lifetime asked for; the database caps it at the promotion's own end. */
export const VOUCHER_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export type ClaimOutcome = 'claimed' | 'already_claimed' | 'sold_out' | 'not_available';

export function isClaimOutcome(v: unknown): v is ClaimOutcome {
  return v === 'claimed' || v === 'already_claimed' || v === 'sold_out' || v === 'not_available';
}

/** HTTP status and guest-facing message for a refusal. `claimed` is handled by the caller. */
export function refusal(outcome: Exclude<ClaimOutcome, 'claimed'>): { status: number; message: string } {
  switch (outcome) {
    case 'already_claimed':
      return { status: 409, message: 'You have already saved this offer.' };
    case 'sold_out':
      return { status: 409, message: 'This offer has run out.' };
    case 'not_available':
      return { status: 410, message: 'This offer is no longer available.' };
  }
}
