/**
 * Voucher token codec.
 *
 * AD-04 / PRD §9: "QR code must contain an opaque signed token or short redemption identifier,
 * not raw personal or payment data."
 *
 * The payload therefore holds exactly two things: a version byte and a random 128-bit voucher id.
 * No user id, no booking reference, no email, no amount. Anything a scanner needs is looked up
 * server-side from the id. The database stores only sha256(token), so a database read cannot mint
 * a working QR code.
 *
 * Uses Web Crypto, which is available in Deno (Edge Functions) and Node 18+. Signing and hashing
 * are server-side only; the mobile app receives the finished token string and renders it.
 */

import { z } from 'zod';

export const VOUCHER_TOKEN_VERSION = 1;
const TOKEN_PREFIX = 'cvip';
const VOUCHER_ID_BYTES = 16;

/** The complete set of data inside a QR code. Deliberately minimal. */
export const voucherPayloadSchema = z
  .object({
    v: z.literal(VOUCHER_TOKEN_VERSION),
    /** Random 128-bit id, base64url. Not the database primary key of anything user-facing. */
    id: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  })
  .strict(); // .strict() makes the "no extra fields" rule a runtime guarantee, not a convention.

export type VoucherPayload = z.infer<typeof voucherPayloadSchema>;

export type VoucherTokenError =
  | { code: 'MALFORMED'; message: string }
  | { code: 'BAD_SIGNATURE'; message: string }
  | { code: 'UNSUPPORTED_VERSION'; message: string };

export type VoucherTokenResult =
  | { ok: true; payload: VoucherPayload }
  | { ok: false; error: VoucherTokenError };

// ---------------------------------------------------------------------------
// base64url helpers (no Buffer — must run in Deno and the browser too)
// ---------------------------------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** Constant-time comparison — a byte-by-byte early return would leak the signature. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Generate a fresh random voucher id. */
export function generateVoucherId(): string {
  const bytes = new Uint8Array(VOUCHER_ID_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/**
 * Build the signed token that goes into the QR code.
 * Format: `cvip://v1/<base64url(payload)>.<base64url(hmac)>`
 */
export async function signVoucherToken(payload: VoucherPayload, secret: string): Promise<string> {
  voucherPayloadSchema.parse(payload);
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return `${TOKEN_PREFIX}://v${payload.v}/${body}.${toBase64Url(sig)}`;
}

/**
 * Verify and decode a scanned token.
 *
 * Signature is checked before the payload is trusted, so a tampered or fabricated QR is rejected
 * without any database access at all (test-plan: "tampered HMAC rejected before any DB access").
 */
export async function verifyVoucherToken(
  token: string,
  secret: string,
): Promise<VoucherTokenResult> {
  const match = /^cvip:\/\/v(\d+)\/([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token.trim());
  if (!match) {
    return { ok: false, error: { code: 'MALFORMED', message: 'Not a Caribbean VIP voucher.' } };
  }

  const [, versionStr, body, sig] = match as unknown as [string, string, string, string];

  if (Number(versionStr) !== VOUCHER_TOKEN_VERSION) {
    return {
      ok: false,
      error: { code: 'UNSUPPORTED_VERSION', message: `Unsupported voucher version ${versionStr}.` },
    };
  }

  const key = await hmacKey(secret);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  if (!timingSafeEqual(expected, fromBase64Url(sig))) {
    return { ok: false, error: { code: 'BAD_SIGNATURE', message: 'Voucher signature invalid.' } };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
  } catch {
    return { ok: false, error: { code: 'MALFORMED', message: 'Voucher payload unreadable.' } };
  }

  const parsed = voucherPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    return { ok: false, error: { code: 'MALFORMED', message: 'Voucher payload rejected.' } };
  }
  return { ok: true, payload: parsed.data };
}

/** What the database stores. The raw token is never persisted. */
export async function hashVoucherToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token.trim()));
  return toBase64Url(new Uint8Array(digest));
}

/**
 * Human-readable booking reference shown next to the QR, e.g. `VIPJ-7M24-83A1`.
 *
 * For support conversations and printed confirmations only. It is deliberately NOT accepted as a
 * redemption credential — it is short, guessable, and spoken aloud in public.
 */
export function formatBookingReference(islandCode: string, seed: string): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford-ish: no I, L, O, U
  const clean = seed.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  let out = '';
  for (let i = 0; i < 8; i++) {
    const ch = clean[i % Math.max(clean.length, 1)] ?? '0';
    out += alphabet[ch.charCodeAt(0) % alphabet.length];
  }
  const prefix = `VIP${islandCode.slice(0, 1).toUpperCase()}`;
  return `${prefix}-${out.slice(0, 4)}-${out.slice(4, 8)}`;
}
