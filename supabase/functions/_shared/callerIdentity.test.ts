import { describe, expect, it } from 'vitest';
import { bearerToken, resolveCheckoutUser } from './callerIdentity';

/**
 * checkout-session used to take `userId` from the request body and write it onto the booking. The
 * body is whatever the caller sends, so any holder of the publishable anon key could create
 * bookings, reserve capacity and open Stripe sessions in another guest's name.
 *
 * `verify_jwt` does not help: the anon key is itself a valid JWT. The user has to come from Auth.
 * The function needs Deno and a live Supabase, so the decision is pulled out and pinned here.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('which user a checkout is for', () => {
  it('is the signed-in caller when the body names the same user', () => {
    expect(resolveCheckoutUser(ME, ME)).toEqual({ ok: true, userId: ME });
  });

  it('is refused when the body names someone else — the impersonation case', () => {
    expect(resolveCheckoutUser(ME, OTHER)).toEqual({ ok: false, status: 403 });
  });

  it('is refused with 401 when there is no signed-in user (the anon key alone)', () => {
    expect(resolveCheckoutUser(null, ME)).toEqual({ ok: false, status: 401 });
  });

  it('is 401, not a pass, when neither side names a user', () => {
    expect(resolveCheckoutUser(null, null)).toEqual({ ok: false, status: 401 });
    expect(resolveCheckoutUser('', '')).toEqual({ ok: false, status: 401 });
  });

  it('never returns the body user — the caller identity is what comes back', () => {
    const r = resolveCheckoutUser(ME, ME);
    expect(r.ok && r.userId).toBe(ME);
  });
});

describe('reading the caller token from the Authorization header', () => {
  it('extracts a bearer token', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });
  it('is case-insensitive about the scheme', () => {
    expect(bearerToken('bearer abc')).toBe('abc');
  });
  it.each([null, '', 'Bearer', 'Bearer ', 'Basic abc', 'abc'])('returns null for %j', (h) => {
    expect(bearerToken(h)).toBeNull();
  });
});
