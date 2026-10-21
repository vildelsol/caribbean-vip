/**
 * The tourist account layer — LIVE MODE ONLY.
 *
 * A live-mode tourist is an anonymous Supabase user (see `ensureLiveUser` in ./api.ts). Their
 * bookings belong to that anonymous id, which lives only in this browser's storage: a lost phone
 * or a cleared browser loses it, and the tickets with it. This module lets them:
 *
 *   - add an email to the anonymous user (`startLink` / `verifyLink`), which keeps the same user
 *     id, so every booking already made stays theirs;
 *   - sign back in to that account on another device (`startSignIn` / `verifySignIn`);
 *   - read their paid bookings back (`fetchMyBookings`, the `my_bookings()` RPC).
 *
 * Every function takes the client as a parameter, defaulting to the app client. In demo mode that
 * client is null and every function returns `{ ok: false, reason: 'demo' }` without touching the
 * network. The pure parts (normalisation, error classification, the flow reducer) carry no client
 * at all.
 */

import { supabase } from './supabase';
import type { ServerBookingRow, ServerBookingStatus, ServerGuest } from '../data/serverBooking';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The slice of the Supabase client this module uses. Narrow on purpose, so a test can hand in a
 * fake without building a whole client.
 */
export interface AccountClient {
  auth: {
    updateUser(attributes: { email: string }): Promise<{ error: unknown }>;
    verifyOtp(params: { email: string; token: string; type: 'email' | 'email_change' }): Promise<{ error: unknown }>;
    signInWithOtp(credentials: {
      email: string;
      options?: { shouldCreateUser?: boolean };
    }): Promise<{ error: unknown }>;
    signOut(options?: { scope?: 'global' | 'local' | 'others' }): Promise<{ error: unknown }>;
  };
  rpc(fn: 'my_bookings'): PromiseLike<{ data: unknown; error: unknown }>;
}

export type AuthErrorKind =
  | 'email_exists'
  | 'rate_limited'
  | 'wrong_code'
  | 'expired_code'
  | 'unknown_email'
  | 'network'
  | 'unknown';

/** Why an account call did not succeed. `demo`, `invalid_*` are decided here, before any call. */
export type FailReason = AuthErrorKind | 'demo' | 'invalid_email' | 'invalid_code';

export type AccountResult = { ok: true } | { ok: false; reason: FailReason };

export type BookingsResult = { ok: true; rows: ServerBookingRow[] } | { ok: false; reason: FailReason };

const appClient: AccountClient | null = supabase;

// ---------------------------------------------------------------------------
// Input normalisation
// ---------------------------------------------------------------------------

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Conservative: a local part of the common characters, a dotted domain, a 2+ letter TLD. Run on a
 * normalised (lowercased) email. It rejects some technically valid addresses; a guest with one of
 * those is far rarer than one who typed `gmail.co` or left a space in.
 */
const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/;

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

/** A pasted code often carries spaces or a dash; the code itself is digits only. */
export function normaliseCode(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

/** Supabase email OTPs are 6 digits by default and configurable up to 10. */
export function isValidCode(code: string): boolean {
  return /^\d{6,10}$/.test(code);
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

interface AuthErrorRule {
  kind: Exclude<AuthErrorKind, 'unknown'>;
  codes?: readonly string[];
  names?: readonly string[];
  statuses?: readonly number[];
  /** Lowercase substrings of `error.message`. */
  messages?: readonly string[];
}

/**
 * First matching row wins, so order matters: a 429 whose message also mentions an email must
 * still read as a rate limit, and `email_exists` must win over everything.
 *
 * Note on codes: Supabase GoTrue reports BOTH an expired code and a mistyped one as
 * `otp_expired` / "Token has expired or is invalid", so `expired_code` is what a wrong code
 * usually arrives as. The UI copy for the two says the same thing for that reason.
 */
export const AUTH_ERROR_TABLE: readonly AuthErrorRule[] = [
  {
    kind: 'email_exists',
    codes: ['email_exists', 'user_already_exists'],
    messages: ['already been registered', 'already registered'],
  },
  {
    kind: 'rate_limited',
    codes: ['over_email_send_rate_limit', 'over_request_rate_limit', 'over_sms_send_rate_limit'],
    statuses: [429],
    messages: ['rate limit', 'too many requests', 'for security purposes, you can only request this'],
  },
  {
    kind: 'unknown_email',
    codes: ['otp_disabled', 'user_not_found'],
    messages: ['signups not allowed', 'user not found'],
  },
  {
    kind: 'expired_code',
    codes: ['otp_expired'],
    messages: ['expired'],
  },
  {
    kind: 'wrong_code',
    codes: ['otp_invalid', 'invalid_otp'],
    messages: ['invalid otp', 'token is invalid', 'invalid token'],
  },
  {
    kind: 'network',
    names: ['AuthRetryableFetchError'],
    statuses: [0],
    messages: ['failed to fetch', 'networkerror', 'load failed', 'network request failed'],
  },
];

function field(error: unknown, key: string): unknown {
  return typeof error === 'object' && error !== null ? (error as Record<string, unknown>)[key] : undefined;
}

/** Never throws, whatever it is handed. Anything unrecognised is `unknown`. */
export function classifyAuthError(error: unknown): AuthErrorKind {
  try {
    const rawCode = field(error, 'code');
    const rawName = field(error, 'name');
    const rawStatus = field(error, 'status');
    const rawMessage = field(error, 'message');
    const code = typeof rawCode === 'string' ? rawCode : undefined;
    const name = typeof rawName === 'string' ? rawName : undefined;
    const status = typeof rawStatus === 'number' ? rawStatus : undefined;
    const message = typeof rawMessage === 'string' ? rawMessage.toLowerCase() : '';

    for (const rule of AUTH_ERROR_TABLE) {
      if (code && rule.codes?.includes(code)) return rule.kind;
      if (name && rule.names?.includes(name)) return rule.kind;
      if (status !== undefined && rule.statuses?.includes(status)) return rule.kind;
      if (message && rule.messages?.some((m) => message.includes(m))) return rule.kind;
    }
  } catch {
    // A hostile or exotic error object is still just an error we do not recognise.
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Client calls
// ---------------------------------------------------------------------------

async function settle(call: () => Promise<{ error: unknown }>): Promise<AccountResult> {
  try {
    const { error } = await call();
    return error ? { ok: false, reason: classifyAuthError(error) } : { ok: true };
  } catch (thrown) {
    return { ok: false, reason: classifyAuthError(thrown) };
  }
}

/** Step one of adding an email to the current (anonymous) user: Supabase emails a code. */
export async function startLink(rawEmail: string, client: AccountClient | null = appClient): Promise<AccountResult> {
  if (!client) return { ok: false, reason: 'demo' };
  const email = normaliseEmail(rawEmail);
  if (!isValidEmail(email)) return { ok: false, reason: 'invalid_email' };
  return settle(() => client.auth.updateUser({ email }));
}

/** Step two: the code from that email confirms the address. The user id does not change. */
export async function verifyLink(
  rawEmail: string,
  rawCode: string,
  client: AccountClient | null = appClient,
): Promise<AccountResult> {
  if (!client) return { ok: false, reason: 'demo' };
  const email = normaliseEmail(rawEmail);
  if (!isValidEmail(email)) return { ok: false, reason: 'invalid_email' };
  const token = normaliseCode(rawCode);
  if (!isValidCode(token)) return { ok: false, reason: 'invalid_code' };
  return settle(() => client.auth.verifyOtp({ email, token, type: 'email_change' }));
}

/** Sign in to an existing account. `shouldCreateUser: false`: this must never mint a new one. */
export async function startSignIn(rawEmail: string, client: AccountClient | null = appClient): Promise<AccountResult> {
  if (!client) return { ok: false, reason: 'demo' };
  const email = normaliseEmail(rawEmail);
  if (!isValidEmail(email)) return { ok: false, reason: 'invalid_email' };
  return settle(() => client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }));
}

export async function verifySignIn(
  rawEmail: string,
  rawCode: string,
  client: AccountClient | null = appClient,
): Promise<AccountResult> {
  if (!client) return { ok: false, reason: 'demo' };
  const email = normaliseEmail(rawEmail);
  if (!isValidEmail(email)) return { ok: false, reason: 'invalid_email' };
  const token = normaliseCode(rawCode);
  if (!isValidCode(token)) return { ok: false, reason: 'invalid_code' };
  return settle(() => client.auth.verifyOtp({ email, token, type: 'email' }));
}

/**
 * Sign out of this device. `scope: 'local'` on purpose: the supabase-js default is `global`, which
 * would also sign the guest out on every other phone they have signed in on.
 *
 * Purging the account's bookings from this device is the caller's job (`purgeServerBookings`),
 * and `startLiveSync` does it again on `SIGNED_OUT`, so it happens however the session ends.
 */
export async function signOut(client: AccountClient | null = appClient): Promise<AccountResult> {
  if (!client) return { ok: false, reason: 'demo' };
  return settle(() => client.auth.signOut({ scope: 'local' }));
}

/** The signed-in user's paid bookings. Malformed rows are dropped, never thrown on. */
export async function fetchMyBookings(client: AccountClient | null = appClient): Promise<BookingsResult> {
  if (!client) return { ok: false, reason: 'demo' };
  try {
    const { data, error } = await client.rpc('my_bookings');
    if (error) return { ok: false, reason: classifyAuthError(error) };
    return { ok: true, rows: parseServerBookingRows(data) };
  } catch (thrown) {
    return { ok: false, reason: classifyAuthError(thrown) };
  }
}

// ---------------------------------------------------------------------------
// Defensive row parsing
// ---------------------------------------------------------------------------

const STATUSES: readonly ServerBookingStatus[] = [
  'pending_payment',
  'confirmed',
  'cancelled',
  'completed',
  'refunded',
  'expired',
];
const GUEST_KINDS: readonly ServerGuest['kind'][] = ['adult', 'child', 'infant', 'addon', 'ticket_type'];

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** PostgREST may serialise `bigint` as a string. */
const isMinor = (v: unknown): boolean => isNum(v) || (isStr(v) && v.trim() !== '' && Number.isFinite(Number(v)));

function parseGuest(g: unknown): ServerGuest | null {
  if (typeof g !== 'object' || g === null) return null;
  const r = g as Record<string, unknown>;
  if (!GUEST_KINDS.includes(r.kind as ServerGuest['kind'])) return null;
  if (!isStr(r.label) || !isNum(r.quantity) || !isMinor(r.unit_amount_minor)) return null;
  return r as unknown as ServerGuest;
}

function parseRow(raw: unknown): ServerBookingRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isStr(r.id) || !isStr(r.reference) || !isStr(r.created_at)) return null;
  if (!STATUSES.includes(r.status as ServerBookingStatus)) return null;
  if (!isNum(r.seats)) return null;
  if (!isStr(r.experience_title) || !isStr(r.island_code) || !isStr(r.starts_at)) return null;
  if (!isStr(r.currency)) return null;
  if (!(r.ticket_token === null || r.ticket_token === undefined || isStr(r.ticket_token))) return null;
  for (const k of ['subtotal_minor', 'tax_minor', 'service_fee_minor', 'total_minor']) {
    if (!isMinor(r[k])) return null;
  }
  let guests: ServerGuest[] | null = null;
  if (Array.isArray(r.guests)) {
    guests = r.guests.map(parseGuest).filter((g): g is ServerGuest => g !== null);
  } else if (r.guests !== null && r.guests !== undefined) {
    return null;
  }
  return { ...(r as unknown as ServerBookingRow), ticket_token: (r.ticket_token as string | null) ?? null, guests };
}

export function parseServerBookingRows(data: unknown): ServerBookingRow[] {
  if (!Array.isArray(data)) return [];
  return data.map(parseRow).filter((r): r is ServerBookingRow => r !== null);
}

// ---------------------------------------------------------------------------
// Account status
// ---------------------------------------------------------------------------

export type AccountStatus = { kind: 'none' } | { kind: 'anonymous' } | { kind: 'linked'; email: string };

/**
 * What the Profile card says about the current user. Only a confirmed, non-anonymous email counts
 * as linked: a pending `new_email` has not been verified and would not survive a lost phone.
 */
export function accountStatusOf(
  user: { email?: string | null; is_anonymous?: boolean | null; new_email?: string | null } | null | undefined,
): AccountStatus {
  if (!user) return { kind: 'none' };
  if (user.is_anonymous || !user.email) return { kind: 'anonymous' };
  return { kind: 'linked', email: user.email };
}

/**
 * Whether to stop and warn before signing in to another account — the decision behind the
 * blocking step in SignInSheet. LIVE MODE ONLY: every booking in a live store is a live one.
 *
 * `verifyOtp` replaces the session. An anonymous guest has no way back to the identity they are
 * leaving, so the tickets they bought under it survive only in this browser's storage. Worth a
 * stop only when there is something to lose: a confirmed booking. A linked account can always be
 * signed back in to, and no session at all has nothing to orphan. `null` (status still loading)
 * is not a reason to warn; the sheet waits for the status before showing anything.
 */
export function shouldConfirmSignIn(
  status: AccountStatus | null,
  bookings: readonly { status: 'confirmed' | 'cancelled' }[],
): boolean {
  return status?.kind === 'anonymous' && bookings.some((b) => b.status === 'confirmed');
}

// ---------------------------------------------------------------------------
// The email -> code flow
// ---------------------------------------------------------------------------

export type FlowPhase = 'idle' | 'sending' | 'awaiting_code' | 'verifying' | 'done' | 'collision' | 'error';

export interface FlowState {
  phase: FlowPhase;
  /** Normalised. */
  email: string;
  /** When the last code was sent (ms since epoch), for the resend cooldown. */
  sentAt: number | null;
  error: FailReason | null;
  /** The send in flight is a resend: a code for `email` is already out and still valid. */
  resending: boolean;
  /**
   * When a code was last sent to each (normalised) email. Survives `reset` ("Use a different
   * email"), so going back and re-entering the same address cannot skip the cooldown.
   */
  sentLog: Readonly<Record<string, number>>;
}

export type FlowEvent =
  | { type: 'submitEmail'; email: string; now: number }
  | { type: 'sent'; at: number }
  | { type: 'failed'; reason: FailReason }
  | { type: 'submitCode' }
  | { type: 'verified' }
  | { type: 'resend'; now: number }
  | { type: 'reset' };

export const RESEND_COOLDOWN_MS = 60_000;

export const initialFlow: FlowState = {
  phase: 'idle',
  email: '',
  sentAt: null,
  error: null,
  resending: false,
  sentLog: {},
};

function cooldownFrom(sentAt: number | null | undefined, now: number): number {
  if (sentAt === null || sentAt === undefined) return 0;
  const elapsed = now - sentAt;
  if (elapsed < 0) return RESEND_COOLDOWN_MS / 1000;
  return Math.max(0, Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000));
}

/** Whole seconds until a code may be resent; 0 when it may. A clock that went backwards waits. */
export function resendCooldownSeconds(state: FlowState, now: number): number {
  return cooldownFrom(state.sentAt, now);
}

/** Whole seconds until a code may be sent to `email` again, whatever the current phase. */
export function emailCooldownSeconds(state: FlowState, email: string, now: number): number {
  return cooldownFrom(state.sentLog[normaliseEmail(email)], now);
}

/** A code was wrong or stale: the guest stays on the code step to try again or resend. */
const RETRYABLE_ON_CODE: readonly FailReason[] = ['wrong_code', 'expired_code', 'invalid_code'];

/**
 * idle -> sending -> awaiting_code -> verifying -> done | collision | error.
 *
 * An event that does not belong to the current phase returns the same state object, so a late
 * network reply after the guest has moved on changes nothing.
 */
export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case 'submitEmail': {
      if (state.phase !== 'idle' && state.phase !== 'error' && state.phase !== 'collision') return state;
      const email = normaliseEmail(event.email);
      // A code went to this address under a minute ago and is still valid: back to the code step,
      // no second send. The caller checks `emailCooldownSeconds` the same way before sending.
      if (emailCooldownSeconds(state, email, event.now) > 0) {
        return { ...state, phase: 'awaiting_code', email, sentAt: state.sentLog[email] ?? null, error: null, resending: false };
      }
      return { ...state, phase: 'sending', email, sentAt: null, error: null, resending: false };
    }

    case 'sent':
      if (state.phase !== 'sending') return state;
      return {
        ...state,
        phase: 'awaiting_code',
        sentAt: event.at,
        error: null,
        resending: false,
        sentLog: { ...state.sentLog, [state.email]: event.at },
      };

    case 'failed':
      if (state.phase !== 'sending' && state.phase !== 'verifying') return state;
      if (event.reason === 'email_exists') return { ...state, phase: 'collision', error: event.reason, resending: false };
      if (state.phase === 'verifying' && RETRYABLE_ON_CODE.includes(event.reason)) {
        return { ...state, phase: 'awaiting_code', error: event.reason };
      }
      // The code emailed before this resend is still valid, so the guest stays on the code step.
      if (state.phase === 'sending' && state.resending) {
        return { ...state, phase: 'awaiting_code', error: event.reason, resending: false };
      }
      return { ...state, phase: 'error', error: event.reason, resending: false };

    case 'submitCode':
      if (state.phase !== 'awaiting_code') return state;
      return { ...state, phase: 'verifying', error: null };

    case 'verified':
      if (state.phase !== 'verifying') return state;
      return { ...state, phase: 'done', error: null };

    case 'resend':
      if (state.phase !== 'awaiting_code' || resendCooldownSeconds(state, event.now) > 0) return state;
      return { ...state, phase: 'sending', error: null, resending: true };

    case 'reset':
      return { ...initialFlow, sentLog: state.sentLog };
  }
}
