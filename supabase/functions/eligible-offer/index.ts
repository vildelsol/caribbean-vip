/**
 * eligible-offer — T-07, V-06, PRD §9.
 *
 * Tells a guest at a position which geofenced offer, if any, they may be shown right now.
 * Evaluation is server-side on purpose: `geofences` are not publicly readable, so nobody can map
 * the trigger zones, and the response never includes a fence's centre or radius.
 *
 * POST { lat, lng, accuracyMetres?, islandCode }   Authorization: Bearer <the guest's access token>
 * → { ok: true, offer: { promotionId, geofenceId, title, ..., distanceMetres } | null, reason? }
 * → { ok: false, message } with 400 / 401
 *
 * The caller is whoever Auth says the bearer token belongs to. Nothing in the body names a user.
 * Consent comes from the caller's own profile row, not from the request. The decision is
 * `findEligibleOffer` from `@cvip/offers`; this file reads, calls it, and records the impression.
 *
 * The impression is written when the offer is returned, not when the app confirms it showed it.
 * If the app then fails to display it, that guest's cooldown for that offer is spent. That is
 * preferred to the opposite failure, an offer that fires again and again.
 *
 * Thin adapter: it has no rules of its own. Known limit: two simultaneous calls from one guest can
 * both see no impression and both return the offer once; the cost is one repeat, not a leak.
 */

import { findEligibleOffer } from '@cvip/offers';
import { createClient } from 'npm:@supabase/supabase-js@^2';
import { bearerToken } from '../_shared/callerIdentity.ts';
import {
  claimedPromotionIds,
  lastShownAtMs,
  parseOfferRequest,
  toOfferPromotions,
  toOfferResponse,
  type GeofenceRow,
  type PromotionRow,
} from '../_shared/offerQuery.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, message: 'POST only' }, 405);

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
  const request = parseOfferRequest(body);
  if (!request.ok) return json({ ok: false, message: request.message }, 400);

  try {
    const [profile, island] = await Promise.all([
      supabase.from('profiles').select('role, location_consent, offer_consent').eq('id', userId).maybeSingle(),
      supabase.from('islands').select('id, timezone').eq('code', request.islandCode).maybeSingle(),
    ]);
    if (profile.error) throw profile.error;
    if (island.error) throw island.error;
    // No profile means no consent was ever recorded: nothing is offered.
    const consent = {
      osLocationGranted: profile.data?.location_consent === true,
      offerOptIn: profile.data?.offer_consent === true,
    };
    if (!island.data) return json({ ok: true, offer: null, reason: 'no-offer' });

    const now = new Date();
    const promotions = await supabase
      .from('promotions')
      .select('id, vendor_org_id, island_id, title, description, terms, value_kind, value_rate, value_amount_minor, currency, starts_at, ends_at, inventory_limit, issued_count, approval_state, is_demo')
      .eq('island_id', island.data.id)
      .eq('approval_state', 'approved')
      .lte('starts_at', now.toISOString())
      .gte('ends_at', now.toISOString());
    if (promotions.error) throw promotions.error;
    const promoRows = (promotions.data ?? []) as PromotionRow[];
    const promoIds = promoRows.map((p) => p.id);
    if (promoIds.length === 0) return json({ ok: true, offer: null, reason: 'no-offer' });

    const vendorIds = [...new Set(promoRows.map((p) => p.vendor_org_id))];
    const [fences, vendors, vouchers, impressions] = await Promise.all([
      supabase
        .from('geofences')
        .select('id, promotion_id, centre_lat, centre_lng, radius_m, active_days, active_from_time, active_to_time, cooldown_minutes, is_active')
        .in('promotion_id', promoIds),
      supabase.from('vendor_organizations').select('id, status').in('id', vendorIds),
      supabase.from('vouchers').select('promotion_id, state').eq('user_id', userId).in('promotion_id', promoIds),
      supabase.from('promotion_impressions').select('promotion_id, shown_at').eq('user_id', userId).in('promotion_id', promoIds),
    ]);
    for (const r of [fences, vendors, vouchers, impressions]) if (r.error) throw r.error;

    const decision = findEligibleOffer({
      position: { coordinates: { lat: request.lat, lng: request.lng }, accuracyMetres: request.accuracyMetres },
      islandId: island.data.id,
      now,
      consent,
      viewerIsAdmin: profile.data?.role === 'admin',
      promotions: toOfferPromotions(
        promoRows,
        (fences.data ?? []) as GeofenceRow[],
        new Map((vendors.data ?? []).map((v: { id: string; status: string }) => [v.id, v.status])),
        { id: island.data.id, timeZone: island.data.timezone },
      ),
      claimedPromotionIds: claimedPromotionIds(vouchers.data ?? []),
      lastShownAtMs: lastShownAtMs(impressions.data ?? []),
    });

    if (!decision.eligible) return json({ ok: true, offer: null, reason: decision.reason });

    const { error: impressionError } = await supabase.from('promotion_impressions').insert({
      promotion_id: decision.offer.promotion.promotionId,
      geofence_id: decision.offer.fence.geofenceId,
      user_id: userId,
    });
    // Without the impression the cooldown never starts and the offer would fire on every call, so
    // a failed write means no offer, not an offer without a cooldown.
    if (impressionError) throw impressionError;

    return json({ ok: true, offer: toOfferResponse(decision.offer) });
  } catch (e) {
    // Logged, never returned: database error text names columns and tables.
    console.error('eligible-offer failed', e instanceof Error ? e.message : e);
    return json({ ok: false, message: 'Could not check offers right now' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
