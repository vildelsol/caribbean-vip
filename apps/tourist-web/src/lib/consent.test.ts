/**
 * Consent persistence. A null client does nothing at all; each denial is paired with a positive
 * control on a fake client, so a test that passes because nothing is ever called cannot hide.
 */

import { describe, expect, it, vi } from 'vitest';

// Pin demo mode: a shell with VITE_SUPABASE_* set must not hand these tests a real client.
vi.mock('./supabase', () => ({ supabase: null, isLiveMode: false }));

import { readOfferConsent, writeConsent, type ConsentClient, type ConsentPatch } from './consent';

function fakeClient(over: {
  userId?: string | null;
  updateError?: unknown;
  row?: { offer_consent: boolean } | null;
  selectError?: unknown;
  throws?: boolean;
} = {}) {
  const updates: { patch: ConsentPatch; id: string }[] = [];
  const client: ConsentClient = {
    auth: {
      async getSession() {
        if (over.throws) throw new Error('network');
        const id = over.userId === undefined ? 'user-1' : over.userId;
        return { data: { session: id ? { user: { id } } : null } };
      },
    },
    from: () => ({
      update: (patch) => ({
        eq: async (_column, id) => {
          updates.push({ patch, id });
          return { error: over.updateError ?? null };
        },
      }),
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
  return { client, updates };
}

describe('writeConsent', () => {
  it('does nothing in demo mode: no client, no throw', async () => {
    expect(await writeConsent({ location_consent: true }, null)).toEqual({ ok: false, reason: 'demo' });
  });

  it('positive control: writes the flag to the signed-in guest own row', async () => {
    const { client, updates } = fakeClient();
    expect(await writeConsent({ offer_consent: true }, client)).toEqual({ ok: true });
    expect(updates).toEqual([{ patch: { offer_consent: true }, id: 'user-1' }]);
  });

  it('writes nothing without a session', async () => {
    const { client, updates } = fakeClient({ userId: null });
    expect(await writeConsent({ location_consent: true }, client)).toEqual({ ok: false, reason: 'signed-out' });
    expect(updates).toEqual([]);
  });

  it('reports a rejected write as failed, never as success', async () => {
    const { client } = fakeClient({ updateError: { code: '42501' } });
    expect(await writeConsent({ location_consent: false }, client)).toEqual({ ok: false, reason: 'failed' });
  });

  it('reports a thrown network error as failed', async () => {
    const { client } = fakeClient({ throws: true });
    expect(await writeConsent({ location_consent: true }, client)).toEqual({ ok: false, reason: 'failed' });
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
