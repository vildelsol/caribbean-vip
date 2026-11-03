/**
 * Data-rights calls. A null client does nothing at all; each denial is paired with a positive
 * control on a fake client, so a test that passes because nothing is ever called cannot hide.
 */

import { describe, expect, it, vi } from 'vitest';

// Pin demo mode: a shell with VITE_SUPABASE_* set must not hand these tests a real client.
vi.mock('./supabase', () => ({ supabase: null, isLiveMode: false }));

import { eraseMyData, exportFilename, exportMyData, parseErasure, type PrivacyClient } from './privacy';

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
    const { client, calls } = fakeClient({ data: { erased: true, bookings_retained: 2, account_removable: false } });
    expect(await eraseMyData(client)).toEqual({ ok: true, bookingsRetained: 2, accountRemovable: false });
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
  it('parseErasure rejects malformed reports', () => {
    expect(parseErasure(null)).toBeNull();
    expect(parseErasure({ erased: true })).toBeNull();
    expect(parseErasure({ erased: true, bookings_retained: -1 })).toBeNull();
    expect(parseErasure({ erased: true, bookings_retained: 0, account_removable: true })).toEqual({
      bookingsRetained: 0,
      accountRemovable: true,
    });
  });

  it('exportFilename uses the given day', () => {
    expect(exportFilename(new Date('2026-11-03T10:00:00Z'))).toBe('caribbean-vip-my-data-2026-11-03.json');
  });
});
