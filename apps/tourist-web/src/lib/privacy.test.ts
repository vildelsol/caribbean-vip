/**
 * Data-rights calls. A null client does nothing at all; each denial is paired with a positive
 * control on a fake client, so a test that passes because nothing is ever called cannot hide.
 */

import { describe, expect, it, vi } from 'vitest';

// Pin demo mode: a shell with VITE_SUPABASE_* set must not hand these tests a real client.
vi.mock('./supabase', () => ({ supabase: null, isLiveMode: false }));

import { eraseMyData, eraseOutsideTools, parseProcessorReport, exportFilename, exportMyData, parseErasure, removeMyAccount, retainedUntilText, type PrivacyClient } from './privacy';
import type { OffersClient } from './offers';

function fakeClient(over: { userId?: string | null; data?: unknown; error?: unknown; throws?: boolean } = {}) {
  const calls: string[] = [];
  const client: PrivacyClient = {
    auth: {
      async getSession() {
        if (over.throws) throw new Error('network');
        const id = over.userId === undefined ? 'user-1' : over.userId;
        return { data: { session: id ? { user: { id } } : null } };
      },
    },
    async rpc(fn) {
      calls.push(fn);
      return { data: over.data === undefined ? {} : over.data, error: over.error ?? null };
    },
  };
  return { client, calls };
}

describe('exportMyData', () => {
  it('does nothing in demo mode: no client, no throw', async () => {
    expect(await exportMyData(null)).toEqual({ ok: false, reason: 'demo' });
  });

  it('refuses without a session and never calls the database', async () => {
    const { client, calls } = fakeClient({ userId: null });
    expect(await exportMyData(client)).toEqual({ ok: false, reason: 'signed-out' });
    expect(calls).toEqual([]);
  });

  it('positive control: returns the document as JSON with a dated filename', async () => {
    const { client, calls } = fakeClient({ data: { profile: { id: 'user-1' } } });
    const result = await exportMyData(client);
    expect(calls).toEqual(['export_my_data']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.parse(result.json)).toEqual({ profile: { id: 'user-1' } });
      expect(result.filename).toMatch(/^caribbean-vip-my-data-\d{4}-\d{2}-\d{2}\.json$/);
    }
  });

  it('fails on a database error, a non-object answer and a throw', async () => {
    expect(await exportMyData(fakeClient({ error: { message: 'x' } }).client)).toEqual({ ok: false, reason: 'failed' });
    expect(await exportMyData(fakeClient({ data: null }).client)).toEqual({ ok: false, reason: 'failed' });
    expect(await exportMyData(fakeClient({ throws: true }).client)).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('eraseMyData', () => {
  it('does nothing in demo mode: no client, no throw', async () => {
    expect(await eraseMyData(null)).toEqual({ ok: false, reason: 'demo' });
  });

  it('refuses without a session and never calls the database', async () => {
    const { client, calls } = fakeClient({ userId: null });
    expect(await eraseMyData(client)).toEqual({ ok: false, reason: 'signed-out' });
    expect(calls).toEqual([]);
  });

  it('positive control: reports what stays', async () => {
    const { client, calls } = fakeClient({ data: { erased: true, bookings_retained: 2, retained_until: '2033-11-04T10:00:00Z', account_removable: false } });
    expect(await eraseMyData(client)).toEqual({ ok: true, bookingsRetained: 2, retainedUntil: '2033-11-04T10:00:00Z', accountRemovable: false });
    expect(calls).toEqual(['erase_my_data']);
  });

  it('does not claim an erasure the server did not report', async () => {
    expect(await eraseMyData(fakeClient({ data: { erased: false, bookings_retained: 0 } }).client)).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(await eraseMyData(fakeClient({ error: { message: 'x' } }).client)).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('helpers', () => {
  it('reads the retention date, and drops one it cannot read', () => {
    expect(parseErasure({ erased: true, bookings_retained: 1, retained_until: '2033-11-04T10:00:00Z' })?.retainedUntil).toBe('2033-11-04T10:00:00Z');
    expect(parseErasure({ erased: true, bookings_retained: 1, retained_until: 'soon' })?.retainedUntil).toBeNull();
    expect(retainedUntilText('2033-11-04T23:30:00Z')).toBe('4 November 2033');
  });

  it('parseErasure rejects malformed reports', () => {
    expect(parseErasure(null)).toBeNull();
    expect(parseErasure({ erased: true })).toBeNull();
    expect(parseErasure({ erased: true, bookings_retained: -1 })).toBeNull();
    expect(parseErasure({ erased: true, bookings_retained: 0, account_removable: true })).toEqual({
      bookingsRetained: 0,
      retainedUntil: null,
      accountRemovable: true,
    });
  });

  it('exportFilename uses the given day', () => {
    expect(exportFilename(new Date('2026-11-03T10:00:00Z'))).toBe('caribbean-vip-my-data-2026-11-03.json');
  });
});

describe('removeMyAccount', () => {
  const client = (status: number, body: unknown, token: string | null = 'tok', calls: { url: string; init: RequestInit }[] = []): OffersClient => ({
    functionsBase: 'https://x.supabase.co/functions/v1',
    anonKey: 'anon',
    getAccessToken: async () => token,
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { status, json: async () => body } as Response;
    }) as unknown as typeof fetch,
  });

  it('does nothing in demo mode: no client, no throw', async () => {
    expect(await removeMyAccount(null)).toEqual({ ok: false, reason: 'demo' });
  });

  it('sends nothing without a session', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    expect(await removeMyAccount(client(200, { ok: true }, null, calls))).toEqual({ ok: false, reason: 'signed-out' });
    expect(calls).toEqual([]);
  });

  it('positive control: posts to the function with the guest token and no body', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    expect(await removeMyAccount(client(200, { ok: true }, 'tok', calls))).toEqual({ ok: true });
    expect(calls[0]?.url).toBe('https://x.supabase.co/functions/v1/delete-my-account');
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(calls[0]?.init.body).toBeUndefined();
  });

  it('shows a refusal in the server words, and never reports success for it', async () => {
    const r = await removeMyAccount(client(409, { ok: false, message: 'Erase your data first, then remove your sign-in.' }));
    expect(r).toEqual({ ok: false, reason: 'refused', status: 409, message: 'Erase your data first, then remove your sign-in.' });
  });

  it('does not count a 200 without ok:true as success', async () => {
    const r = await removeMyAccount(client(200, {}));
    expect(r.ok).toBe(false);
  });
});

describe('eraseOutsideTools', () => {
  const client = (status: number, body: unknown, token: string | null = 'tok', calls: { url: string; init: RequestInit }[] = []): OffersClient => ({
    functionsBase: 'https://x.supabase.co/functions/v1',
    anonKey: 'anon',
    getAccessToken: async () => token,
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { status, json: async () => body } as Response;
    }) as unknown as typeof fetch,
  });

  it('does nothing in demo mode, and sends nothing without a session', async () => {
    expect(await eraseOutsideTools(null)).toEqual({ ok: false, reason: 'demo' });
    const calls: { url: string; init: RequestInit }[] = [];
    expect(await eraseOutsideTools(client(200, {}, null, calls))).toEqual({ ok: false, reason: 'signed-out' });
    expect(calls).toEqual([]);
  });

  it('positive control: posts to erase-processors with the token and no body', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const r = await eraseOutsideTools(client(200, { ok: true, complete: true, incomplete: [] }, 'tok', calls));
    expect(r).toEqual({ ok: true, complete: true, incomplete: [] });
    expect(calls[0]!.url).toBe('https://x.supabase.co/functions/v1/erase-processors');
    expect(calls[0]!.init.body).toBeUndefined();
  });

  it('reports a tool that did not finish', async () => {
    expect(await eraseOutsideTools(client(200, { ok: true, complete: false, incomplete: ['stripe'] }))).toEqual({ ok: true, complete: false, incomplete: ['stripe'] });
  });

  it('a server error or network failure is failed, never complete', async () => {
    expect(await eraseOutsideTools(client(500, { ok: false }))).toEqual({ ok: false, reason: 'failed' });
    const broken = { ...client(200, {}), fetch: (async () => { throw new Error('net'); }) as unknown as typeof fetch };
    expect(await eraseOutsideTools(broken)).toEqual({ ok: false, reason: 'failed' });
  });

  it('never believes complete:true while tools are listed unfinished, or a malformed report', () => {
    expect(parseProcessorReport({ ok: true, complete: true, incomplete: ['stripe'] })).toMatchObject({ complete: false });
    expect(parseProcessorReport({ ok: true })).toEqual({ ok: false, reason: 'failed' });
    expect(parseProcessorReport(null)).toEqual({ ok: false, reason: 'failed' });
  });
});
