/**
 * The tourist account layer: adding an email to an anonymous guest, signing back in on a new
 * device, and recovering bookings.
 *
 * Every function takes the Supabase client as a parameter. In demo mode that client is null, and
 * the one property that outranks the rest is that a null client does nothing at all: no network,
 * no throw, just `{ ok: false, reason: 'demo' }`. Each denial test is paired with a positive
 * control on a fake client, so a test that passes because nothing is ever called cannot hide.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// The app client is built from VITE_SUPABASE_* at import time. A developer shell (or CI) with those
// set would otherwise hand these tests a real client pointed at a real project. Pin demo mode.
vi.mock('./supabase', () => ({ supabase: null, isLiveMode: false }));

import {
  AUTH_ERROR_TABLE,
  accountStatusOf,
  RESEND_COOLDOWN_MS,
  type AccountClient,
  type FlowState,
  classifyAuthError,
  fetchMyBookings,
  flowReducer,
  initialFlow,
  isValidCode,
  isValidEmail,
  normaliseCode,
  normaliseEmail,
  parseServerBookingRows,
  resendCooldownSeconds,
  emailCooldownSeconds,
  shouldConfirmSignIn,
  signOut,
  startLink,
  startSignIn,
  verifyLink,
  verifySignIn,
} from './account';
import type { ServerBookingRow } from '../data/serverBooking';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type Resp = { data: unknown; error: unknown };

function fakeClient(over: {
  updateUser?: Resp;
  verifyOtp?: Resp;
  signInWithOtp?: Resp;
  rpc?: Resp;
  signOut?: Resp;
} = {}) {
  const ok: Resp = { data: {}, error: null };
  const client = {
    auth: {
      updateUser: vi.fn(async () => over.updateUser ?? ok),
      verifyOtp: vi.fn(async () => over.verifyOtp ?? ok),
      signInWithOtp: vi.fn(async () => over.signInWithOtp ?? ok),
      signOut: vi.fn(async (_opts?: { scope?: 'local' | 'global' | 'others' }) => over.signOut ?? ok),
    },
    rpc: vi.fn(async () => over.rpc ?? { data: [], error: null }),
  };
  return client as typeof client & AccountClient;
}

function row(over: Partial<ServerBookingRow> = {}): ServerBookingRow {
  return {
    id: '7d1f0c1e-0000-4000-8000-000000000001',
    reference: 'VIPJ-7M24-83A1',
    status: 'confirmed',
    seats: 2,
    currency: 'USD',
    subtotal_minor: 20000,
    tax_minor: 3000,
    service_fee_minor: 1000,
    total_minor: 24000,
    created_at: '2026-10-20T14:03:11.123+00:00',
    ticket_token: 'tok',
    experience_title: 'Catamaran Snorkel & Sunset',
    island_code: 'JM',
    starts_at: '2026-10-22T09:00:00+00:00',
    guests: [{ kind: 'adult', label: 'Adult', quantity: 2, unit_amount_minor: 10000 }],
    ...over,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Demo denial, each paired with a positive control
// ---------------------------------------------------------------------------

describe('demo mode (null client)', () => {
  it('the default client is null under test (mocked, whatever the env says), so the default path is the demo path', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await startLink('guest@example.com')).toEqual({ ok: false, reason: 'demo' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('startLink with a null client never reaches the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await startLink('guest@example.com', null);
    expect(result).toEqual({ ok: false, reason: 'demo' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('positive control: startLink with a client calls updateUser with the email', async () => {
    const client = fakeClient();
    const result = await startLink('guest@example.com', client);
    expect(result).toEqual({ ok: true });
    expect(client.auth.updateUser).toHaveBeenCalledTimes(1);
    expect(client.auth.updateUser).toHaveBeenCalledWith({ email: 'guest@example.com' });
  });

  it('verifyLink, startSignIn, verifySignIn and fetchMyBookings all deny with a null client', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await verifyLink('guest@example.com', '123456', null)).toEqual({ ok: false, reason: 'demo' });
    expect(await startSignIn('guest@example.com', null)).toEqual({ ok: false, reason: 'demo' });
    expect(await verifySignIn('guest@example.com', '123456', null)).toEqual({ ok: false, reason: 'demo' });
    expect(await fetchMyBookings(null)).toEqual({ ok: false, reason: 'demo' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('positive control: each of them reaches its client method when there is one', async () => {
    const client = fakeClient({ rpc: { data: [row()], error: null } });
    await verifyLink('guest@example.com', '123456', client);
    await startSignIn('guest@example.com', client);
    await verifySignIn('guest@example.com', '123456', client);
    const rows = await fetchMyBookings(client);

    expect(client.auth.verifyOtp).toHaveBeenNthCalledWith(1, {
      email: 'guest@example.com',
      token: '123456',
      type: 'email_change',
    });
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'guest@example.com',
      options: { shouldCreateUser: false },
    });
    expect(client.auth.verifyOtp).toHaveBeenNthCalledWith(2, {
      email: 'guest@example.com',
      token: '123456',
      type: 'email',
    });
    expect(client.rpc).toHaveBeenCalledWith('my_bookings');
    expect(rows).toEqual({ ok: true, rows: [row()] });
  });
});

// ---------------------------------------------------------------------------
// Input normalisation
// ---------------------------------------------------------------------------

describe('email and code normalisation', () => {
  it('trims and lowercases the email before it reaches the client', async () => {
    const client = fakeClient();
    await startLink('  Guest@Example.COM ', client);
    expect(client.auth.updateUser).toHaveBeenCalledWith({ email: 'guest@example.com' });
  });

  it.each([
    'guest@example.com',
    'first.last+tag@sub.example.co.uk',
    "o'brien@example.ie",
  ])('accepts %s', (email) => {
    expect(isValidEmail(normaliseEmail(email))).toBe(true);
  });

  it.each(['', 'guest', 'guest@', '@example.com', 'guest@example', 'gu est@example.com', 'a@b@c.com', 'guest@example.c'])(
    'rejects %j',
    (email) => {
      expect(isValidEmail(normaliseEmail(email))).toBe(false);
    },
  );

  it('rejects an absurdly long email', () => {
    expect(isValidEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
  });

  it('an invalid email never reaches the client', async () => {
    const client = fakeClient();
    expect(await startLink('not-an-email', client)).toEqual({ ok: false, reason: 'invalid_email' });
    expect(await startSignIn('not-an-email', client)).toEqual({ ok: false, reason: 'invalid_email' });
    expect(await verifyLink('nope', '123456', client)).toEqual({ ok: false, reason: 'invalid_email' });
    expect(await verifySignIn('nope', '123456', client)).toEqual({ ok: false, reason: 'invalid_email' });
    expect(client.auth.updateUser).not.toHaveBeenCalled();
    expect(client.auth.signInWithOtp).not.toHaveBeenCalled();
    expect(client.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('strips spaces and dashes from a pasted code', () => {
    expect(normaliseCode(' 123 456 ')).toBe('123456');
    expect(normaliseCode('123-456')).toBe('123456');
  });

  it.each([
    ['123456', true],
    ['12345678', true],
    ['12345', false],
    ['12345a', false],
    ['', false],
  ])('code %j valid is %s', (code, valid) => {
    expect(isValidCode(code)).toBe(valid);
  });

  it('a malformed code never reaches the client', async () => {
    const client = fakeClient();
    expect(await verifyLink('guest@example.com', '12ab', client)).toEqual({ ok: false, reason: 'invalid_code' });
    expect(await verifySignIn('guest@example.com', '', client)).toEqual({ ok: false, reason: 'invalid_code' });
    expect(client.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('a pasted code with a space is normalised before verify', async () => {
    const client = fakeClient();
    await verifySignIn('guest@example.com', '123 456', client);
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({ email: 'guest@example.com', token: '123456', type: 'email' });
  });
});

// ---------------------------------------------------------------------------
// Errors from the client
// ---------------------------------------------------------------------------

describe('client errors become classified reasons', () => {
  it('startLink reports email_exists for an address another account holds', async () => {
    const client = fakeClient({
      updateUser: {
        data: null,
        error: { code: 'email_exists', status: 422, message: 'A user with this email address has already been registered' },
      },
    });
    expect(await startLink('taken@example.com', client)).toEqual({ ok: false, reason: 'email_exists' });
  });

  it('a client that throws is reported as an error, not rethrown', async () => {
    const client = fakeClient();
    client.auth.signInWithOtp.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await startSignIn('guest@example.com', client)).toEqual({ ok: false, reason: 'network' });
  });

  it('fetchMyBookings reports an rpc error as a reason', async () => {
    const client = fakeClient({ rpc: { data: null, error: { status: 0, message: 'Failed to fetch' } } });
    expect(await fetchMyBookings(client)).toEqual({ ok: false, reason: 'network' });
  });
});

describe('classifyAuthError', () => {
  it.each([
    [{ code: 'email_exists', status: 422, message: 'A user with this email address has already been registered' }, 'email_exists'],
    [{ code: 'user_already_exists', status: 422, message: 'User already registered' }, 'email_exists'],
    [{ status: 422, message: 'A user with this email address has already been registered' }, 'email_exists'],
    [{ code: 'over_email_send_rate_limit', status: 429, message: 'Email rate limit exceeded' }, 'rate_limited'],
    [{ code: 'over_request_rate_limit', status: 429, message: 'Request rate limit reached' }, 'rate_limited'],
    [{ status: 429, message: 'Too many requests' }, 'rate_limited'],
    [{ status: 400, message: 'For security purposes, you can only request this after 42 seconds.' }, 'rate_limited'],
    [{ code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' }, 'expired_code'],
    [{ status: 403, message: 'Email link is invalid or has expired' }, 'expired_code'],
    [{ status: 400, message: 'Invalid OTP' }, 'wrong_code'],
    [{ status: 401, message: 'Token is invalid' }, 'wrong_code'],
    [{ code: 'otp_disabled', status: 422, message: 'Signups not allowed for otp' }, 'unknown_email'],
    [{ code: 'user_not_found', status: 404, message: 'User not found' }, 'unknown_email'],
    [{ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }, 'network'],
    [new TypeError('Failed to fetch'), 'network'],
    [new TypeError('Load failed'), 'network'],
    [{ message: 'NetworkError when attempting to fetch resource.' }, 'network'],
  ] as const)('%j -> %s', (error, expected) => {
    expect(classifyAuthError(error)).toBe(expected);
  });

  it('every kind in the table is covered by at least one case above', () => {
    const kinds = new Set(AUTH_ERROR_TABLE.map((r) => r.kind));
    expect([...kinds].sort()).toEqual(
      ['email_exists', 'expired_code', 'network', 'rate_limited', 'unknown_email', 'wrong_code'].sort(),
    );
  });

  it.each([
    [{ code: 'something_new', status: 500, message: 'Database error saving new user' }],
    [{}],
    [null],
    [undefined],
    ['a bare string'],
    [42],
    [{ code: 42, status: 'x', message: { nested: true } }],
  ])('an unrecognised error %j is unknown and does not throw', (error) => {
    expect(() => classifyAuthError(error)).not.toThrow();
    expect(classifyAuthError(error)).toBe('unknown');
  });

  it('an error whose getters throw is unknown, not a crash', () => {
    const hostile = {
      get code(): string {
        throw new Error('boom');
      },
    };
    expect(classifyAuthError(hostile)).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// Defensive row parsing
// ---------------------------------------------------------------------------

describe('parseServerBookingRows', () => {
  it('keeps well-formed rows', () => {
    expect(parseServerBookingRows([row(), row({ id: 'b2', reference: 'R2' })])).toHaveLength(2);
  });

  it('accepts PostgREST bigint-as-string amounts', () => {
    const r = { ...row(), total_minor: '24000' };
    expect(parseServerBookingRows([r])).toHaveLength(1);
  });

  it('accepts null ticket token and null guests', () => {
    expect(parseServerBookingRows([row({ ticket_token: null, guests: null })])).toHaveLength(1);
  });

  it('drops malformed rows rather than throwing', () => {
    const rows: unknown[] = [
      row(),
      null,
      'nope',
      { ...row(), id: 7 },
      { ...row(), reference: undefined },
      { ...row(), status: 'teleported' },
      { ...row(), total_minor: 'lots' },
      { ...row(), seats: '2' },
      { ...row(), experience_title: null },
      { ...row(), guests: 'adult' },
      { ...row(), starts_at: 12 },
    ];
    expect(() => parseServerBookingRows(rows)).not.toThrow();
    expect(parseServerBookingRows(rows)).toEqual([row()]);
  });

  it('drops malformed guests but keeps the booking', () => {
    const r = { ...row(), guests: [{ kind: 'adult', label: 'Adult', quantity: 2, unit_amount_minor: 10000 }, { kind: 'adult' }, null] };
    const [parsed] = parseServerBookingRows([r]);
    expect(parsed?.guests).toEqual([{ kind: 'adult', label: 'Adult', quantity: 2, unit_amount_minor: 10000 }]);
  });

  it('treats a non-array payload as no rows', () => {
    expect(parseServerBookingRows(null)).toEqual([]);
    expect(parseServerBookingRows({ id: 'x' })).toEqual([]);
  });

  it('fetchMyBookings drops malformed rows from the rpc', async () => {
    const client = fakeClient({ rpc: { data: [row(), { junk: true }], error: null } });
    expect(await fetchMyBookings(client)).toEqual({ ok: true, rows: [row()] });
  });
});

// ---------------------------------------------------------------------------
// Flow reducer
// ---------------------------------------------------------------------------

describe('flowReducer', () => {
  const T0 = 1_800_000_000_000;

  function sentAt(at = T0): FlowState {
    let s = flowReducer(initialFlow, { type: 'submitEmail', email: 'guest@example.com', now: T0 });
    s = flowReducer(s, { type: 'sent', at });
    return s;
  }

  it('starts idle', () => {
    expect(initialFlow.phase).toBe('idle');
  });

  it('idle -> sending -> awaiting_code -> verifying -> done', () => {
    let s = flowReducer(initialFlow, { type: 'submitEmail', email: 'guest@example.com', now: T0 });
    expect(s.phase).toBe('sending');
    expect(s.email).toBe('guest@example.com');
    s = flowReducer(s, { type: 'sent', at: T0 });
    expect(s.phase).toBe('awaiting_code');
    expect(s.sentAt).toBe(T0);
    s = flowReducer(s, { type: 'submitCode' });
    expect(s.phase).toBe('verifying');
    s = flowReducer(s, { type: 'verified' });
    expect(s.phase).toBe('done');
    expect(s.error).toBeNull();
  });

  it('a send rejected with email_exists is a collision, keeping the email', () => {
    let s = flowReducer(initialFlow, { type: 'submitEmail', email: 'taken@example.com', now: T0 });
    s = flowReducer(s, { type: 'failed', reason: 'email_exists' });
    expect(s.phase).toBe('collision');
    expect(s.email).toBe('taken@example.com');
  });

  it('a verify rejected with email_exists is also a collision', () => {
    let s = flowReducer(sentAt(), { type: 'submitCode' });
    s = flowReducer(s, { type: 'failed', reason: 'email_exists' });
    expect(s.phase).toBe('collision');
  });

  it('any other send failure is an error with the reason', () => {
    let s = flowReducer(initialFlow, { type: 'submitEmail', email: 'guest@example.com', now: T0 });
    s = flowReducer(s, { type: 'failed', reason: 'rate_limited' });
    expect(s).toMatchObject({ phase: 'error', error: 'rate_limited' });
  });

  it('a wrong or expired code returns to awaiting_code so the guest can retry', () => {
    for (const reason of ['wrong_code', 'expired_code', 'invalid_code'] as const) {
      let s = flowReducer(sentAt(), { type: 'submitCode' });
      s = flowReducer(s, { type: 'failed', reason });
      expect(s).toMatchObject({ phase: 'awaiting_code', error: reason, sentAt: T0 });
    }
  });

  it('any other verify failure is an error', () => {
    let s = flowReducer(sentAt(), { type: 'submitCode' });
    s = flowReducer(s, { type: 'failed', reason: 'network' });
    expect(s).toMatchObject({ phase: 'error', error: 'network' });
  });

  it('ignores events that do not belong to the current phase', () => {
    expect(flowReducer(initialFlow, { type: 'verified' })).toBe(initialFlow);
    expect(flowReducer(initialFlow, { type: 'submitCode' })).toBe(initialFlow);
    expect(flowReducer(initialFlow, { type: 'sent', at: T0 })).toBe(initialFlow);
    const done = flowReducer(flowReducer(sentAt(), { type: 'submitCode' }), { type: 'verified' });
    expect(flowReducer(done, { type: 'failed', reason: 'network' })).toBe(done);
  });

  it('reset returns to idle, forgetting the email and the code step', () => {
    expect(flowReducer(sentAt(), { type: 'reset' })).toMatchObject({
      phase: 'idle',
      email: '',
      sentAt: null,
      error: null,
      resending: false,
    });
  });

  describe('a failed resend', () => {
    function resending(): FlowState {
      return flowReducer(sentAt(), { type: 'resend', now: T0 + 60_000 });
    }

    it('is tracked as a resend while it is in flight', () => {
      expect(resending()).toMatchObject({ phase: 'sending', resending: true, email: 'guest@example.com' });
    });

    it('returns to the code step with the error, keeping the earlier send time (that code is still valid)', () => {
      for (const reason of ['rate_limited', 'network', 'unknown'] as const) {
        const s = flowReducer(resending(), { type: 'failed', reason });
        expect(s).toMatchObject({
          phase: 'awaiting_code',
          error: reason,
          email: 'guest@example.com',
          sentAt: T0,
          resending: false,
        });
      }
    });

    it('control: the same failure on a FIRST send is an error on the email form', () => {
      const s = flowReducer(flowReducer(initialFlow, { type: 'submitEmail', email: 'guest@example.com', now: T0 }), {
        type: 'failed',
        reason: 'network',
      });
      expect(s).toMatchObject({ phase: 'error', error: 'network', resending: false });
    });

    it('a successful resend clears the flag and restarts the cooldown', () => {
      const s = flowReducer(resending(), { type: 'sent', at: T0 + 61_000 });
      expect(s).toMatchObject({ phase: 'awaiting_code', resending: false, sentAt: T0 + 61_000 });
    });
  });

  describe('the cooldown survives "Use a different email"', () => {
    it('re-entering the same email inside 60s goes back to the code step without a send', () => {
      let s = flowReducer(sentAt(), { type: 'reset' });
      expect(emailCooldownSeconds(s, 'guest@example.com', T0 + 10_000)).toBe(50);
      s = flowReducer(s, { type: 'submitEmail', email: ' Guest@Example.com ', now: T0 + 10_000 });
      expect(s).toMatchObject({ phase: 'awaiting_code', email: 'guest@example.com', sentAt: T0, error: null });
      // And the resend button is still locked for the rest of the minute.
      expect(resendCooldownSeconds(s, T0 + 10_000)).toBe(50);
    });

    it('control: a different email may be sent at once', () => {
      const s = flowReducer(sentAt(), { type: 'reset' });
      expect(emailCooldownSeconds(s, 'other@example.com', T0 + 10_000)).toBe(0);
      expect(flowReducer(s, { type: 'submitEmail', email: 'other@example.com', now: T0 + 10_000 })).toMatchObject({
        phase: 'sending',
        email: 'other@example.com',
      });
    });

    it('control: the same email may be sent again once the minute is up', () => {
      const s = flowReducer(sentAt(), { type: 'reset' });
      expect(emailCooldownSeconds(s, 'guest@example.com', T0 + 60_000)).toBe(0);
      expect(flowReducer(s, { type: 'submitEmail', email: 'guest@example.com', now: T0 + 60_000 })).toMatchObject({
        phase: 'sending',
      });
    });

    it('a send that failed starts no cooldown', () => {
      let s = flowReducer(initialFlow, { type: 'submitEmail', email: 'guest@example.com', now: T0 });
      s = flowReducer(s, { type: 'failed', reason: 'network' });
      expect(emailCooldownSeconds(s, 'guest@example.com', T0 + 1)).toBe(0);
    });
  });

  describe('resend cooldown', () => {
    it('is 60 seconds', () => {
      expect(RESEND_COOLDOWN_MS).toBe(60_000);
    });

    it('counts down from the injected send time', () => {
      const s = sentAt();
      expect(resendCooldownSeconds(s, T0)).toBe(60);
      expect(resendCooldownSeconds(s, T0 + 1)).toBe(60);
      expect(resendCooldownSeconds(s, T0 + 59_001)).toBe(1);
      expect(resendCooldownSeconds(s, T0 + 60_000)).toBe(0);
      expect(resendCooldownSeconds(s, T0 + 600_000)).toBe(0);
    });

    it('is 0 when nothing has been sent', () => {
      expect(resendCooldownSeconds(initialFlow, T0)).toBe(0);
    });

    it('a resend inside the cooldown is ignored', () => {
      const s = sentAt();
      expect(flowReducer(s, { type: 'resend', now: T0 + 30_000 })).toBe(s);
    });

    it('a resend after the cooldown goes back to sending with the same email', () => {
      const s = flowReducer(sentAt(), { type: 'resend', now: T0 + 60_000 });
      expect(s).toMatchObject({ phase: 'sending', email: 'guest@example.com' });
    });

    it('a clock that has gone backwards does not unlock the resend', () => {
      const s = sentAt();
      expect(resendCooldownSeconds(s, T0 - 5_000)).toBe(60);
      expect(flowReducer(s, { type: 'resend', now: T0 - 5_000 })).toBe(s);
    });
  });
});

// ---------------------------------------------------------------------------
// Account status, for the Profile card
// ---------------------------------------------------------------------------

describe('accountStatusOf', () => {
  it('no user is none', () => {
    expect(accountStatusOf(null)).toEqual({ kind: 'none' });
    expect(accountStatusOf(undefined)).toEqual({ kind: 'none' });
  });

  it('an anonymous user with no email is anonymous', () => {
    expect(accountStatusOf({ is_anonymous: true })).toEqual({ kind: 'anonymous' });
    expect(accountStatusOf({ is_anonymous: true, email: '' })).toEqual({ kind: 'anonymous' });
  });

  it('an anonymous user with an email change pending is still anonymous', () => {
    expect(accountStatusOf({ is_anonymous: true, new_email: 'guest@example.com' })).toEqual({ kind: 'anonymous' });
  });

  it('a user with a confirmed email is linked, with the email', () => {
    expect(accountStatusOf({ is_anonymous: false, email: 'guest@example.com' })).toEqual({
      kind: 'linked',
      email: 'guest@example.com',
    });
  });

  it('a user with an email but still flagged anonymous is not shown as linked', () => {
    expect(accountStatusOf({ is_anonymous: true, email: 'guest@example.com' })).toEqual({ kind: 'anonymous' });
  });
});

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

describe('signOut', () => {
  it('demo: a null client does nothing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await signOut(null)).toEqual({ ok: false, reason: 'demo' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('positive control: signs out of THIS device only, never every device', async () => {
    const client = fakeClient();
    expect(await signOut(client)).toEqual({ ok: true });
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('reports a failure as a reason, and a throw is not rethrown', async () => {
    const failing = fakeClient({ signOut: { data: null, error: { status: 0, message: 'Failed to fetch' } } });
    expect(await signOut(failing)).toEqual({ ok: false, reason: 'network' });
    const throwing = fakeClient();
    throwing.auth.signOut.mockRejectedValueOnce(new Error('boom'));
    expect(await signOut(throwing)).toEqual({ ok: false, reason: 'unknown' });
  });
});

// ---------------------------------------------------------------------------
// Signing in over an anonymous session
// ---------------------------------------------------------------------------

describe('shouldConfirmSignIn', () => {
  const confirmed = { status: 'confirmed' as const };
  const cancelled = { status: 'cancelled' as const };

  it('asks an anonymous guest who holds a confirmed booking', () => {
    expect(shouldConfirmSignIn({ kind: 'anonymous' }, [cancelled, confirmed])).toBe(true);
  });

  it('control: an anonymous guest with nothing confirmed is not asked', () => {
    expect(shouldConfirmSignIn({ kind: 'anonymous' }, [])).toBe(false);
    expect(shouldConfirmSignIn({ kind: 'anonymous' }, [cancelled])).toBe(false);
  });

  it('control: a linked account loses nothing by switching, so is not asked', () => {
    expect(shouldConfirmSignIn({ kind: 'linked', email: 'a@example.com' }, [confirmed])).toBe(false);
  });

  it('no session at all has no identity to orphan', () => {
    expect(shouldConfirmSignIn({ kind: 'none' }, [confirmed])).toBe(false);
  });

  it('an unknown status (still loading) is not a reason to warn', () => {
    expect(shouldConfirmSignIn(null, [confirmed])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Claiming the guest's bookings across a sign-in
// ---------------------------------------------------------------------------

describe('verifySignIn claims the anonymous guest’s bookings', () => {
  type Session = { access_token: string; user?: { is_anonymous?: boolean } } | null;

  /** getSession returns the guest's session before verifyOtp and the account's after it. */
  function sessionClient(before: Session, after: Session, over: Parameters<typeof fakeClient>[0] = {}) {
    const client = fakeClient(over);
    let signedIn = false;
    client.auth.verifyOtp.mockImplementation(async () => {
      signedIn = !over.verifyOtp?.error;
      return over.verifyOtp ?? { data: {}, error: null };
    });
    const withSession = client as typeof client & {
      auth: { getSession: ReturnType<typeof vi.fn>; refreshSession: ReturnType<typeof vi.fn> };
    };
    withSession.auth.getSession = vi.fn(async () => ({ data: { session: signedIn ? after : before } }));
    withSession.auth.refreshSession = vi.fn(async () => ({ error: null }));
    return withSession as unknown as typeof client & AccountClient & {
      auth: { getSession: ReturnType<typeof vi.fn>; refreshSession: ReturnType<typeof vi.fn> };
    };
  }

  const guest: Session = { access_token: 'guest-jwt', user: { is_anonymous: true } };
  const account: Session = { access_token: 'account-jwt', user: { is_anonymous: false } };

  it('sends the guest token read BEFORE verifyOtp, with the account token as bearer', async () => {
    const client = sessionClient(guest, account);
    const claim = vi.fn(async () => 2);
    expect(await verifySignIn('guest@example.com', '123456', client, claim)).toEqual({ ok: true });
    expect(claim).toHaveBeenCalledWith('account-jwt', 'guest-jwt');
  });

  it('refreshes the session when bookings moved, so live sync fetches them', async () => {
    const client = sessionClient(guest, account);
    await verifySignIn('guest@example.com', '123456', client, vi.fn(async () => 2));
    expect(client.auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('does not refresh when nothing moved', async () => {
    const client = sessionClient(guest, account);
    await verifySignIn('guest@example.com', '123456', client, vi.fn(async () => 0));
    expect(client.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('a failed claim does not fail the sign-in', async () => {
    const client = sessionClient(guest, account);
    expect(await verifySignIn('guest@example.com', '123456', client, vi.fn(async () => null))).toEqual({ ok: true });
    const throwing = vi.fn(async () => {
      throw new Error('network');
    });
    expect(await verifySignIn('guest@example.com', '123456', client, throwing)).toEqual({ ok: true });
  });

  it('does not claim when the current session is not anonymous', async () => {
    const client = sessionClient(account, account);
    const claim = vi.fn(async () => 1);
    await verifySignIn('guest@example.com', '123456', client, claim);
    expect(claim).not.toHaveBeenCalled();
  });

  it('does not claim when verifyOtp failed', async () => {
    const client = sessionClient(guest, account, { verifyOtp: { data: null, error: { code: 'otp_expired' } } });
    const claim = vi.fn(async () => 1);
    expect(await verifySignIn('guest@example.com', '123456', client, claim)).toEqual({ ok: false, reason: 'expired_code' });
    expect(claim).not.toHaveBeenCalled();
  });

  it('a client with no getSession signs in without claiming', async () => {
    const client = fakeClient();
    const claim = vi.fn(async () => 1);
    expect(await verifySignIn('guest@example.com', '123456', client, claim)).toEqual({ ok: true });
    expect(claim).not.toHaveBeenCalled();
  });
});
