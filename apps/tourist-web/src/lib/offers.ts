/**
 * Live offers: asking `eligible-offer` whether the guest may be shown one here, and asking
 * `claim-offer` to turn a shown offer into a voucher.
 *
 * Rendered only by `LiveOfferCard`, which Explore mounts in live mode alone, so demo output cannot
 * change. The two consents the server requires are recorded by `./consent` (location from
 * `LocationBar`, the offer opt-in from the Profile switch).
 *
 * Both functions identify the caller from the guest's own access token, not the anon key that the
 * checkout path sends: with only the anon key they answer 401. The token is passed in rather than
 * read here, as is `fetch`, so a test never reaches a network and a null client (demo mode) does
 * nothing at all: no network, no throw, `{ ok: false, reason: 'demo' }`.
 */

import { supabase } from './supabase';

export interface OffersClient {
  /** Base of the Edge Functions, e.g. `https://<ref>.supabase.co/functions/v1`. */
  functionsBase: string;
  /** The publishable key; goes in `apikey` only, never in `Authorization`. */
  anonKey: string;
  /** The signed-in guest's access token, or null when there is no session. */
  getAccessToken(): Promise<string | null>;
  fetch: typeof fetch;
}

export interface ShownOffer {
  promotionId: string;
  geofenceId: string;
  title: string;
  description: string | null;
  terms: string;
  valueKind: string;
  valueRate: number | null;
  valueAmountMinor: number | null;
  currency: string | null;
  endsAt: string;
  distanceMetres: number;
}

export type OfferFailure =
  | { ok: false; reason: 'demo' }
  | { ok: false; reason: 'signed-out' }
  | { ok: false; reason: 'refused'; status: number; message: string }
  | { ok: false; reason: 'network' };

export type OfferCheck = { ok: true; offer: ShownOffer | null; why?: string } | OfferFailure;

export type ClaimResult = { ok: true; token: string; validUntil: string } | OfferFailure;

async function call(client: OffersClient | null, fn: string, body: unknown): Promise<{ status: number; json: unknown } | OfferFailure> {
  if (!client) return { ok: false, reason: 'demo' };
  const token = await client.getAccessToken();
  if (!token) return { ok: false, reason: 'signed-out' };
  try {
    const res = await client.fetch(`${client.functionsBase}/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: client.anonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json: unknown = await res.json().catch(() => null);
    return { status: res.status, json };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

function isFailure(r: { status: number; json: unknown } | OfferFailure): r is OfferFailure {
  return 'ok' in r;
}

function refusal(status: number, json: unknown): OfferFailure {
  const message = typeof (json as { message?: unknown } | null)?.message === 'string'
    ? (json as { message: string }).message
    : 'Something went wrong. Please try again.';
  return status === 401 ? { ok: false, reason: 'signed-out' } : { ok: false, reason: 'refused', status, message };
}

/** Which offer, if any, may be shown at this position. The server also records the impression. */
export async function checkEligibleOffer(
  client: OffersClient | null,
  position: { lat: number; lng: number; accuracyMetres?: number; islandCode: string },
): Promise<OfferCheck> {
  const r = await call(client, 'eligible-offer', position);
  if (isFailure(r)) return r;
  const j = r.json as { ok?: unknown; offer?: ShownOffer | null; reason?: unknown } | null;
  if (r.status !== 200 || j?.ok !== true) return refusal(r.status, r.json);
  return { ok: true, offer: j.offer ?? null, why: typeof j.reason === 'string' ? j.reason : undefined };
}

/** Turn an offer the guest was just shown into a voucher. The token comes back once. */
export async function claimOffer(client: OffersClient | null, promotionId: string): Promise<ClaimResult> {
  const r = await call(client, 'claim-offer', { promotionId });
  if (isFailure(r)) return r;
  const j = r.json as { ok?: unknown; token?: unknown; validUntil?: unknown } | null;
  if (r.status !== 200 || j?.ok !== true || typeof j.token !== 'string' || typeof j.validUntil !== 'string') {
    return refusal(r.status, r.json);
  }
  return { ok: true, token: j.token, validUntil: j.validUntil };
}

// ---------------------------------------------------------------------------
// App wiring. Everything above takes its client as a parameter; this part builds the real one.
// ---------------------------------------------------------------------------


/** The real client, or null in demo mode (no Supabase keys). */
export function appOffersClient(): OffersClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabase || !url || !anonKey) return null;
  const auth = supabase.auth;
  return {
    functionsBase: `${url.replace(/\/$/, '')}/functions/v1`,
    anonKey,
    getAccessToken: async () => (await auth.getSession()).data.session?.access_token ?? null,
    fetch: (...args) => fetch(...args),
  };
}

/** Do not ask the server again for a position this close to the last one asked about... */
export const RECHECK_DISTANCE_METRES = 100;
/** ...unless this long has passed. Each eligible answer writes an impression row, so asking less is also less data. */
export const RECHECK_AFTER_MS = 60_000;
/** Never faster than this, whatever the position does. */
export const MIN_GAP_MS = 15_000;

export interface LastCheck {
  at: number;
  lat: number;
  lng: number;
}

/** Whether to call `eligible-offer` for this position. Pure, so the rate is tested rather than hoped for. */
export function shouldCheckOffer(
  last: LastCheck | null,
  next: { lat: number; lng: number },
  now: number,
  metresBetween: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number,
): boolean {
  if (!last) return true;
  const gap = now - last.at;
  if (gap < MIN_GAP_MS) return false;
  if (gap >= RECHECK_AFTER_MS) return true;
  return metresBetween(last, next) >= RECHECK_DISTANCE_METRES;
}

// A claimed voucher's token is returned once. It is kept on this device so a reload does not lose
// it. Live mode only: demo never reaches this. Every access is guarded; storage may be blocked.
const TOKEN_KEY = 'cvip.liveVoucher';

export interface HeldToken {
  promotionId: string;
  token: string;
  validUntil: string;
}

export function loadHeldToken(now: number = Date.now()): HeldToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<HeldToken>;
    if (typeof v.promotionId !== 'string' || typeof v.token !== 'string' || typeof v.validUntil !== 'string') return null;
    if (Date.parse(v.validUntil) <= now) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return { promotionId: v.promotionId, token: v.token, validUntil: v.validUntil };
  } catch {
    return null;
  }
}

export function saveHeldToken(held: HeldToken): void {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(held));
  } catch {
    /* blocked storage: the token shows this session only */
  }
}

export function clearHeldToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
}
