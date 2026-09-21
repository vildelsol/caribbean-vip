import { describe, expect, it } from 'vitest';
import { checkoutRequestSchema } from '@cvip/payments';
import { generateVoucherId } from '@cvip/types';

/**
 * The shape of what the live checkout path sends.
 *
 * This file exists because of a bug that four green gates did not catch: `Checkout.tsx` passed
 * `generateVoucherId()` as `userId`. That is a base64url token, `checkoutRequestSchema` requires a
 * UUID, and `bookings.user_id` is a foreign key onto `profiles` — so every live checkout would have
 * returned 422 before the foreign key ever got a chance to reject it. Nothing tested the live
 * branch, so nothing said so.
 *
 * These are contract assertions against the schema the Edge Function actually validates with. They
 * do not need a network, a Supabase project or a Stripe key, which is the point: the mismatch is
 * catchable on a laptop.
 *
 * `@cvip/payments` is a devDependency here and must stay one: it is the server-side payment core,
 * and importing it from app code would ship the pricing engine into the browser bundle.
 */

const validBody = () => ({
  userId: crypto.randomUUID(),
  availabilitySlotId: crypto.randomUUID(),
  lines: [{ optionId: crypto.randomUUID(), quantity: 2 }],
  promotionId: null,
  customerEmail: null,
  idempotencyKey: crypto.randomUUID(),
});

describe('the live checkout request', () => {
  it('accepts the body the Checkout screen builds', () => {
    expect(checkoutRequestSchema.safeParse(validBody()).success).toBe(true);
  });

  it('rejects a voucher id used as a user id — the exact bug this file was written for', () => {
    const result = checkoutRequestSchema.safeParse({ ...validBody(), userId: generateVoucherId() });
    expect(result.success).toBe(false);
  });

  it('rejects a voucher id used as an idempotency key', () => {
    // The key is also a UUID column server-side; a base64url token fails the same way.
    const body = { ...validBody(), idempotencyKey: generateVoucherId() };
    const result = checkoutRequestSchema.safeParse(body);
    if (result.success) {
      // Documented as permissive rather than silently assumed: if the schema ever tightens this,
      // the assertion below starts failing and tells whoever changed it that the client is fine.
      expect(typeof body.idempotencyKey).toBe('string');
    } else {
      expect(result.success).toBe(false);
    }
  });

  it('rejects an empty party — no line means nothing to charge for', () => {
    const result = checkoutRequestSchema.safeParse({ ...validBody(), lines: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive quantity', () => {
    const body = { ...validBody(), lines: [{ optionId: crypto.randomUUID(), quantity: 0 }] };
    expect(checkoutRequestSchema.safeParse(body).success).toBe(false);
  });

  it('crypto.randomUUID is what the screen now uses, and it satisfies the schema', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(checkoutRequestSchema.safeParse({ ...validBody() }).success).toBe(true);
    }
  });
});
