/**
 * claim-offer — T-08, PRD §9.
 *
 * Turns an offer the guest was shown into a voucher they can show at the door.
 *
 * POST { promotionId }   Authorization: Bearer <the guest's access token>
 * → { ok: true, token, validUntil }      token is the QR string; it is returned this once
 * → { ok: false, message } with 400 / 401 / 403 / 409 / 410 / 500
 *
 * The caller is whoever Auth says the bearer token belongs to. Nothing in the body names a user.
 * A claim is honoured only for an offer `eligible-offer` showed this guest recently
 * (`wasShownRecently`): that is what stops a client naming any promotion id it likes.
 *
 * The token is signed here and only sha256(token) is stored, so the database cannot mint a working
 * QR. The counting is `claim_promotion_voucher`, which locks the promotion row and inserts the
 * voucher and moves `issued_count` together.
 *
 * Known limit: the plain token exists only in this response. If the guest loses it after a
 * successful claim, a repeat claim says `already_claimed` and cannot reissue it.
 */

import { generateVoucherId, hashVoucherToken, signVoucherToken, VOUCHER_TOKEN_VERSION } from '@cvip/types';
import { createClient } from 'npm:@supabase/supabase-js@^2';
import { bearerToken } from '../_shared/callerIdentity.ts';
import {
  isClaimOutcome,
  parseClaimRequest,
  refusal,
  VOUCHER_LIFETIME_MS,
  wasShownRecently,
} from '../_shared/claimOffer.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, message: 'POST only' }, 405);

  const secret = Deno.env.get('VOUCHER_HMAC_SECRET') ?? '';
  if (!secret) {
    console.error('claim-offer: VOUCHER_HMAC_SECRET is not set');
    return json({ ok: false, message: 'Could not save this offer right now' }, 500);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const token = bearerToken(req.headers.get('Authorization'));
  const { data: caller } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  const userId = caller.user?.id ?? null;
  if (!userId) return json({ ok: false, message: 'Sign in required' }, 401);

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // fall through: a missing body is the same 400 as a malformed one
  }
  const request = parseClaimRequest(body);
  if (!request.ok) return json({ ok: false, message: request.message }, 400);

  try {
    const impressions = await supabase
      .from('promotion_impressions')
      .select('promotion_id, shown_at')
      .eq('user_id', userId)
      .eq('promotion_id', request.promotionId);
    if (impressions.error) throw impressions.error;
    if (!wasShownRecently(impressions.data ?? [], request.promotionId, Date.now())) {
      return json({ ok: false, message: 'This offer is no longer available.' }, 403);
    }

    const qrToken = await signVoucherToken({ v: VOUCHER_TOKEN_VERSION, id: generateVoucherId() }, secret);
    const validUntil = new Date(Date.now() + VOUCHER_LIFETIME_MS);
    const claim = await supabase.rpc('claim_promotion_voucher', {
      p_promotion_id: request.promotionId,
      p_user_id: userId,
      p_token_hash: await hashVoucherToken(qrToken),
      p_valid_until: validUntil.toISOString(),
    });
    if (claim.error) throw claim.error;

    const row = Array.isArray(claim.data) ? claim.data[0] : claim.data;
    const outcome = row?.outcome;
    if (!isClaimOutcome(outcome)) throw new Error('claim_promotion_voucher returned no outcome');
    if (outcome !== 'claimed') {
      const r = refusal(outcome);
      return json({ ok: false, message: r.message }, r.status);
    }

    return json({ ok: true, token: qrToken, validUntil: validUntil.toISOString() });
  } catch (e) {
    // Logged, never returned: database error text names columns and tables.
    console.error('claim-offer failed', e instanceof Error ? e.message : e);
    return json({ ok: false, message: 'Could not save this offer right now' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
