/**
 * Consent persistence. A null client does nothing at all; each denial is paired with a positive
 * control on a fake client, so a test that passes because nothing is ever called cannot hide.
 */

import { describe, expect, it, vi } from 'vitest';

// Pin demo mode: a shell with VITE_SUPABASE_* set must not hand these tests a real client.
vi.mock('./supabase', () => ({ supabase: null, isLiveMode: false }));

import {
  CONSENT_TEXT,
  readOfferConsent,
  wordingVersion,
  writeConsent,
  type ConsentClient,
  type ConsentPurpose,
} from './consent';

function fakeClient(over: {
  userId?: string | null;
  rpcError?: unknown;
  row?: { offer_consent: boolean } | null;
  selectError?: unknown;
  throws?: boolean;
} = {}) {
  const calls: { purpose: ConsentPurpose; granted: boolean; version: string }[] = [];
  const client: ConsentClient = {
    auth: {
      async getSession() {
        if (over.throws) throw new Error('network');
        const id = over.userId === undefined ? 'user-1' : over.userId;
        return { data: { session: id ? { user: { id } } : null } };
      },
    },
    async rpc(_fn, args) {
      calls.push({ purpose: args.p_purpose, granted: args.p_granted, version: args.p_wording_version });
      return { error: over.rpcError ?? null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: over.row === undefined ? { offer_consent: true } : over.row,
            error: over.selectError ?? null,
          }),
        }),
      }),
    }),
  };
  return { client, calls };
}

describe('writeConsent', () => {
  it('does nothing in demo mode: no client, no throw', async () => {
    expect(await writeConsent({ purpose: 'location', granted: true }, null)).toEqual({ ok: false, reason: 'demo' });
  });

  it('positive control: records the answer with the wording it was given to', async () => {
    const { client, calls } = fakeClient();
    expect(await writeConsent({ purpose: 'offers', granted: true }, client)).toEqual({ ok: true });
    expect(calls).toEqual([{ purpose: 'offers', granted: true, version: wordingVersion('offers') }]);
  });

  it('records a withdrawal as an answer, not as silence', async () => {
    const { client, calls } = fakeClient();
    await writeConsent({ purpose: 'location', granted: false }, client);
    expect(calls).toEqual([{ purpose: 'location', granted: false, version: wordingVersion('location') }]);
  });

  it('writes nothing without a session', async () => {
    const { client, calls } = fakeClient({ userId: null });
    expect(await writeConsent({ purpose: 'location', granted: true }, client)).toEqual({ ok: false, reason: 'signed-out' });
    expect(calls).toEqual([]);
  });

  it('reports a rejected write as failed, never as success', async () => {
    const { client } = fakeClient({ rpcError: { code: '42501' } });
    expect(await writeConsent({ purpose: 'location', granted: false }, client)).toEqual({ ok: false, reason: 'failed' });
  });

  it('reports a thrown network error as failed', async () => {
    const { client } = fakeClient({ throws: true });
    expect(await writeConsent({ purpose: 'location', granted: true }, client)).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('wordingVersion', () => {
  it('is stable for the same text and fits the database limit', () => {
    expect(wordingVersion('offers')).toBe(wordingVersion('offers'));
    expect(wordingVersion('offers').length).toBeLessThanOrEqual(64);
  });

  it('differs by purpose', () => {
    expect(wordingVersion('offers')).not.toBe(wordingVersion('location'));
  });

  it('changes when the text changes, so an edit cannot keep an old version', () => {
    const before = wordingVersion('offers');
    const original = CONSENT_TEXT.offers;
    CONSENT_TEXT.offers = `${original} `;
    try {
      expect(wordingVersion('offers')).not.toBe(before);
    } finally {
      CONSENT_TEXT.offers = original;
    }
  });
});

describe('readOfferConsent', () => {
  it('does nothing in demo mode', async () => {
    expect(await readOfferConsent(null)).toEqual({ ok: false, reason: 'demo' });
  });

  it('positive control: returns the recorded opt-in', async () => {
    const { client } = fakeClient({ row: { offer_consent: true } });
    expect(await readOfferConsent(client)).toEqual({ ok: true, offerConsent: true });
  });

  it('reads a recorded false as false', async () => {
    const { client } = fakeClient({ row: { offer_consent: false } });
    expect(await readOfferConsent(client)).toEqual({ ok: true, offerConsent: false });
  });

  it('treats a missing profile row as never opted in', async () => {
    const { client } = fakeClient({ row: null });
    expect(await readOfferConsent(client)).toEqual({ ok: true, offerConsent: false });
  });

  it('reports no session and read errors without guessing a value', async () => {
    expect(await readOfferConsent(fakeClient({ userId: null }).client)).toEqual({ ok: false, reason: 'signed-out' });
    expect(await readOfferConsent(fakeClient({ selectError: { code: 'x' } }).client)).toEqual({ ok: false, reason: 'failed' });
  });
});
