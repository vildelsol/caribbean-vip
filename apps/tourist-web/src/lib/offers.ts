/**
 * Live offers: asking `eligible-offer` whether the guest may be shown one here, and asking
 * `claim-offer` to turn a shown offer into a voucher.
 *
 * Nothing renders this yet. Where the consent prompt goes, and so when these are first called, is
 * undecided, so no screen imports this file and demo output cannot change.
 *
 * Both functions identify the caller from the guest's own access token, not the anon key that the
 * checkout path sends: with only the anon key they answer 401. The token is passed in rather than
 * read here, as is `fetch`, so a test never reaches a network and a null client (demo mode) does
 * nothing at all: no network, no throw, `{ ok: false, reason: 'demo' }`.
 */

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
