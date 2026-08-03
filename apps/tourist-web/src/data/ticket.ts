import { signVoucherToken, verifyVoucherToken, VOUCHER_TOKEN_VERSION } from '@cvip/types';

/**
 * The ticket token behind the QR code.
 *
 * This uses the **real** signing routine from `@cvip/types` — the same HMAC the production path
 * uses, covered by `voucher.test.ts` — rather than putting the booking reference straight into the
 * QR. That is the property worth demonstrating: a tampered code is rejected by a signature check,
 * not by a database lookup. Change one character and `verifyTicket` fails here exactly as it would
 * against a server, before any state is consulted.
 *
 * ## The payload is deliberately tiny
 *
 * `voucherPayloadSchema` is `{ v, id }` and `.strict()`, so nothing else can be smuggled in. In
 * particular the **booking reference is not in the token**: it is short, guessable and read aloud
 * in public, and `@cvip/types` is explicit that it is not a redemption credential. The QR carries
 * the opaque id; the reference is printed beside it for humans.
 *
 * ## What is simulated, stated plainly
 *
 * The secret is a build-time constant and is therefore visible in the shipped bundle. In production
 * it lives only on the server and no client ever holds it. This demonstrates that the *scheme*
 * works; it does not demonstrate a secure deployment, and a token minted here would be worthless
 * against a real backend holding a real secret. Recorded in `SIMULATION.md`.
 */
const DEMO_SECRET = 'cvip-investor-demo-signing-key-not-a-production-secret';

/**
 * @param id an opaque 128-bit base64url id from `generateVoucherId()`. The schema pins the shape,
 *   so passing anything else throws at sign time rather than producing an unverifiable token.
 */
export async function signTicket(id: string): Promise<string> {
  return signVoucherToken({ v: VOUCHER_TOKEN_VERSION, id }, DEMO_SECRET);
}

export type TicketCheck =
  | { ok: true; id: string }
  | { ok: false; reason: 'invalid_signature' | 'malformed' | 'unsupported_version' };

/** Verifies a scanned token. Drives the redemption demonstration. */
export async function verifyTicket(token: string): Promise<TicketCheck> {
  const result = await verifyVoucherToken(token, DEMO_SECRET);
  if (result.ok) return { ok: true, id: result.payload.id };
  switch (result.error.code) {
    case 'BAD_SIGNATURE':
      return { ok: false, reason: 'invalid_signature' };
    case 'UNSUPPORTED_VERSION':
      return { ok: false, reason: 'unsupported_version' };
    default:
      return { ok: false, reason: 'malformed' };
  }
}
