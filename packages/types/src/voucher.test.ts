import { describe, expect, it } from 'vitest';
import {
  formatBookingReference,
  generateVoucherId,
  hashVoucherToken,
  signVoucherToken,
  verifyVoucherToken,
  voucherPayloadSchema,
  VOUCHER_TOKEN_VERSION,
} from './voucher.ts';

const SECRET = 'test-secret-at-least-32-characters-long!!';
const OTHER_SECRET = 'a-different-secret-also-32-chars-long!!!!';

async function freshToken() {
  return signVoucherToken({ v: VOUCHER_TOKEN_VERSION, id: generateVoucherId() }, SECRET);
}

describe('voucher token codec (PRD §9 / AD-04)', () => {
  it('round-trips a valid token', async () => {
    const id = generateVoucherId();
    const token = await signVoucherToken({ v: VOUCHER_TOKEN_VERSION, id }, SECRET);
    const r = await verifyVoucherToken(token, SECRET);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.id).toBe(id);
  });

  it('carries NO personal or payment data — payload is exactly {v, id}', async () => {
    const token = await freshToken();
    const body = token.split('/')[3]?.split('.')[0] ?? '';
    const json = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(body.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
      ),
    );
    // This assertion is the point of the test: if anyone later adds an email, a user id or a
    // booking reference to the payload, this fails.
    expect(Object.keys(json).sort()).toEqual(['id', 'v']);
  });

  it('rejects extra payload fields at the schema level', () => {
    const bad = { v: 1, id: 'A'.repeat(22), email: 'guest@example.com' };
    expect(voucherPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signVoucherToken(
      { v: VOUCHER_TOKEN_VERSION, id: generateVoucherId() },
      OTHER_SECRET,
    );
    const r = await verifyVoucherToken(token, SECRET);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('BAD_SIGNATURE');
  });

  it('rejects a tampered payload', async () => {
    const token = await freshToken();
    const [body, sig] = (token.split('/')[3] ?? '').split('.');
    const tamperedBody = (body ?? '').slice(0, -1) + ((body ?? '').endsWith('A') ? 'B' : 'A');
    const r = await verifyVoucherToken(`cvip://v1/${tamperedBody}.${sig}`, SECRET);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('BAD_SIGNATURE');
  });

  it('rejects arbitrary strings without touching a database', async () => {
    for (const junk of ['', 'hello', 'cvip://', 'https://example.com', 'cvip://v1/abc']) {
      const r = await verifyVoucherToken(junk, SECRET);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('MALFORMED');
    }
  });

  it('rejects an unsupported version', async () => {
    const token = await freshToken();
    const rest = token.split('/').slice(3).join('/');
    const r = await verifyVoucherToken(`cvip://v9/${rest}`, SECRET);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('UNSUPPORTED_VERSION');
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 2000 }, generateVoucherId));
    expect(ids.size).toBe(2000);
  });

  it('hashes deterministically, and the hash is not the token', async () => {
    const token = await freshToken();
    const h1 = await hashVoucherToken(token);
    const h2 = await hashVoucherToken(token);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(token);
    expect(token).not.toContain(h1);
  });
});

describe('booking reference', () => {
  it('formats as VIP<island>-XXXX-XXXX', () => {
    const ref = formatBookingReference('JM', 'abc123def456');
    expect(ref).toMatch(/^VIPJ-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });

  it('avoids visually ambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      const ref = formatBookingReference('JM', generateVoucherId());
      expect(ref.slice(5)).not.toMatch(/[ILOU]/);
    }
  });
});
