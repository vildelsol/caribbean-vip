import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RATE_POLICIES, addressKey, clientAddress, enforceRateLimit, type RateRpc } from './rateLimit';

const NOW = new Date('2026-11-04T12:00:00Z');

function fakeRpc(deny: Set<string> = new Set(), fail = false) {
  const calls: Array<{ key: string; action: string; limit: number; win: number }> = [];
  const rpc: RateRpc = async (_fn, a) => {
    calls.push({ key: a.p_actor_key, action: a.p_action, limit: a.p_limit, win: a.p_window_seconds });
    if (fail) return { data: null, error: { message: 'db down' } };
    const blocked = [...deny].some((p) => a.p_actor_key.startsWith(p));
    return { data: { allowed: !blocked, retry_after_seconds: blocked ? 42 : 0 }, error: null };
  };
  return { rpc, calls };
}

describe('enforceRateLimit', () => {
  it('checks the user and the address with the policy for the action', async () => {
    const { rpc, calls } = fakeRpc();
    const r = await enforceRateLimit(rpc, 'checkout', { userId: 'u1', forwardedFor: '203.0.113.9, 10.0.0.1', now: NOW });
    expect(r).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    const u = calls.find((c) => c.key === 'user:u1')!;
    expect(u).toMatchObject({ action: 'checkout', limit: RATE_POLICIES.checkout.user.limit });
    const a = calls.find((c) => c.key.startsWith('ip:'))!;
    expect(a.limit).toBe(RATE_POLICIES.checkout.address.limit);
  });

  it('refuses when the user is over the limit, with the retry time', async () => {
    const { rpc } = fakeRpc(new Set(['user:']));
    expect(await enforceRateLimit(rpc, 'claim_offer', { userId: 'u1', forwardedFor: '1.2.3.4', now: NOW }))
      .toEqual({ ok: false, retryAfterSeconds: 42 });
  });

  it('refuses when only the address is over the limit', async () => {
    const { rpc } = fakeRpc(new Set(['ip:']));
    const r = await enforceRateLimit(rpc, 'claim_guest', { userId: 'u1', forwardedFor: '1.2.3.4', now: NOW });
    expect(r.ok).toBe(false);
  });

  it('allows and logs when the limiter errors (fails open)', async () => {
    const { rpc } = fakeRpc(new Set(), true);
    expect(await enforceRateLimit(rpc, 'checkout', { userId: 'u1', forwardedFor: '1.2.3.4', now: NOW })).toEqual({ ok: true });
  });

  it('a malformed reply is not treated as a refusal', async () => {
    const rpc: RateRpc = async () => ({ data: 'nonsense', error: null });
    expect(await enforceRateLimit(rpc, 'checkout', { userId: 'u1', forwardedFor: null, now: NOW })).toEqual({ ok: true });
  });

  it('keeps the per-user limit tighter than the per-address limit for every action', () => {
    for (const p of Object.values(RATE_POLICIES)) expect(p.user.limit).toBeLessThan(p.address.limit);
  });
});

describe('address pseudonym', () => {
  it('is stable within a day, differs by day and address, and never contains the address', async () => {
    const a = await addressKey('203.0.113.9', NOW);
    expect(a).toBe(await addressKey('203.0.113.9', new Date('2026-11-04T23:59:00Z')));
    expect(a).not.toBe(await addressKey('203.0.113.9', new Date('2026-11-05T00:01:00Z')));
    expect(a).not.toBe(await addressKey('203.0.113.10', NOW));
    expect(a).not.toContain('203');
  });
  it('takes the first forwarded address and bounds its length', () => {
    expect(clientAddress('203.0.113.9, 10.0.0.1')).toBe('203.0.113.9');
    expect(clientAddress(null)).toBeNull();
    expect(clientAddress('x'.repeat(500))!.length).toBe(64);
  });
});

describe('wiring', () => {
  const root = join(__dirname, '../../..');
  const src = (f: string) => readFileSync(join(root, 'supabase/functions', f, 'index.ts'), 'utf8');
  it.each([
    ['checkout-session', 'checkout'],
    ['claim-offer', 'claim_offer'],
    ['claim-guest-bookings', 'claim_guest'],
  ])('%s enforces the %s limit after identity and before work', (fn, action) => {
    const s = src(fn);
    expect(s).toContain(`enforceRateLimit(`);
    expect(s).toContain(`'${action}'`);
    expect(s).toContain('tooManyRequests(');
    expect(s.indexOf('enforceRateLimit(')).toBeGreaterThan(s.indexOf('getUser('));
  });
  it('checkout limits before it builds payment deps', () => {
    const s = src('checkout-session');
    expect(s.indexOf('enforceRateLimit(')).toBeLessThan(s.indexOf('makeDeps('));
  });
});
