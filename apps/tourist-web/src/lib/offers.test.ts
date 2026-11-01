/**
 * The live offers client. A null client must do nothing at all, and each refusal is paired with a
 * positive control on the same fake, so a test that passes because nothing is ever called cannot
 * hide.
 */

import { describe, expect, it, vi } from 'vitest';
import { checkEligibleOffer, claimOffer, type OffersClient } from './offers';

const POS = { lat: 18.4, lng: -77.1, islandCode: 'JM' };
const PROMO = '3f2b8a52-6c1e-4b1c-9d57-0a1b2c3d4e5f';

function reply(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

function client(f: typeof fetch, token: string | null = 'guest-token'): OffersClient {
  return { functionsBase: 'https://x.test/functions/v1', anonKey: 'anon-key', getAccessToken: async () => token, fetch: f };
}

describe('demo mode', () => {
  it('a null client does nothing: no network, no throw', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await checkEligibleOffer(null, POS)).toEqual({ ok: false, reason: 'demo' });
    expect(await claimOffer(null, PROMO)).toEqual({ ok: false, reason: 'demo' });
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('who is calling', () => {
  it('sends the guest token as the bearer and the anon key only as apikey', async () => {
    const f = reply(200, { ok: true, offer: null, reason: 'no-offer' });
    await checkEligibleOffer(client(f), POS);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.test/functions/v1/eligible-offer');
    expect(init.headers).toMatchObject({ apikey: 'anon-key', Authorization: 'Bearer guest-token' });
    expect(JSON.stringify(init.headers)).not.toContain('Bearer anon-key');
  });

  it('does not call at all with no session', async () => {
    const f = reply(200, { ok: true });
    expect(await checkEligibleOffer(client(f, null), POS)).toEqual({ ok: false, reason: 'signed-out' });
    expect(await claimOffer(client(f, null), PROMO)).toEqual({ ok: false, reason: 'signed-out' });
    expect(f).not.toHaveBeenCalled();
  });

  it('never puts a user id in the body', async () => {
    const f = reply(200, { ok: true, token: 't', validUntil: 'v' });
    await claimOffer(client(f), PROMO);
    const init = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ promotionId: PROMO });
  });
});

describe('eligible-offer', () => {
  const offer = { promotionId: PROMO, geofenceId: 'g', title: 'Free punch', description: null, terms: 'T', valueKind: 'in_kind', valueRate: null, valueAmountMinor: null, currency: null, endsAt: '2026-12-01T00:00:00Z', distanceMetres: 40 };

  it('returns the offer when there is one', async () => {
    expect(await checkEligibleOffer(client(reply(200, { ok: true, offer })), POS)).toEqual({ ok: true, offer, why: undefined });
  });

  it('returns null and the reason when there is none', async () => {
    expect(await checkEligibleOffer(client(reply(200, { ok: true, offer: null, reason: 'cooldown' })), POS))
      .toEqual({ ok: true, offer: null, why: 'cooldown' });
  });

  it('maps a 401 to signed-out, and other failures to a refusal with the server message', async () => {
    expect(await checkEligibleOffer(client(reply(401, { ok: false, message: 'Sign in required' })), POS))
      .toEqual({ ok: false, reason: 'signed-out' });
    expect(await checkEligibleOffer(client(reply(500, { ok: false, message: 'Could not check offers right now' })), POS))
      .toEqual({ ok: false, reason: 'refused', status: 500, message: 'Could not check offers right now' });
  });

  it('survives a non-JSON body and a network failure', async () => {
    const html = vi.fn(async () => new Response('<html>', { status: 502 })) as unknown as typeof fetch;
    expect(await checkEligibleOffer(client(html), POS)).toMatchObject({ ok: false, reason: 'refused', status: 502 });
    const down = vi.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    expect(await checkEligibleOffer(client(down), POS)).toEqual({ ok: false, reason: 'network' });
  });
});

describe('claim-offer', () => {
  it('returns the token and expiry on success', async () => {
    expect(await claimOffer(client(reply(200, { ok: true, token: 'cvip://v1/a.b', validUntil: '2026-12-01T00:00:00Z' })), PROMO))
      .toEqual({ ok: true, token: 'cvip://v1/a.b', validUntil: '2026-12-01T00:00:00Z' });
  });

  it.each([[403], [409], [410]])('passes a %s refusal and its message through', async (status) => {
    expect(await claimOffer(client(reply(status, { ok: false, message: 'This offer has run out.' })), PROMO))
      .toEqual({ ok: false, reason: 'refused', status, message: 'This offer has run out.' });
  });

  it.each([
    ['a token', { ok: true, validUntil: '2026-12-01T00:00:00Z' }],
    ['an expiry', { ok: true, token: 'cvip://v1/a.b' }],
  ])('never reports success without %s', async (_what, body) => {
    expect(await claimOffer(client(reply(200, body)), PROMO)).toMatchObject({ ok: false, reason: 'refused' });
  });
});
