import { describe, expect, it } from 'vitest';
import { platformTake, startCheckout, type CheckoutRequest } from './checkout.ts';
import { canTakeBookings, createNullPayoutPort } from './payoutPort.ts';
import type { PaymentCoreDeps, PayoutModel, VendorPayout } from './ports.ts';
import { FakeBookingStore, FakeClock, FakePaymentProvider, SequentialIds, optionFixture, slotFixture } from './testing.ts';

/**
 * The vendor is the merchant of record (OD-01, leaning). A vendor with no ready payout account at the
 * charging provider cannot be booked, and the platform's own account is never a quiet fallback.
 */

const USER = '55555555-5555-4555-8555-555555555555';
const ADULT = '44444444-4444-4444-8444-444444444444';

function build(model: PayoutModel, payout?: Partial<VendorPayout> | null) {
  const slot = slotFixture();
  const store = new FakeBookingStore({ slots: [slot], options: [optionFixture({ id: ADULT })] });
  if (payout !== null) {
    store.vendorPayouts.set(slot.vendorOrgId, {
      provider: 'fake',
      accountRef: 'acct_vendor_1',
      status: 'ready',
      ...payout,
    });
  }
  const payments = new FakePaymentProvider();
  const clock = new FakeClock();
  const deps: PaymentCoreDeps = {
    store,
    payments,
    payoutModel: model,
    clock,
    ids: new SequentialIds(),
    voucherSecret: 'test-secret-at-least-32-characters-long!!',
    pendingPaymentTtlMinutes: 30,
    successUrl: 'https://app.test/success',
    cancelUrl: 'https://app.test/cancel',
  };
  store.now = () => clock.now();
  return { deps, store, payments, slot };
}

function request(over: Partial<CheckoutRequest> = {}): CheckoutRequest {
  return {
    userId: USER,
    availabilitySlotId: slotFixture().id,
    lines: [{ optionId: ADULT, quantity: 2 }],
    promotionId: null,
    customerEmail: null,
    idempotencyKey: 'idem-key-0001',
    ...over,
  };
}

describe('vendor is the merchant of record', () => {
  it('routes the payment to the vendor and keeps commission plus service fee (positive control)', async () => {
    const { deps, payments } = build('vendor_is_merchant');
    const r = await startCheckout(deps, request());
    expect(r.ok).toBe(true);
    // 2 x 8900 = 17800; commission 12% = 2136; service fee 5% = 890.
    expect(payments.sessions[0]?.payee).toEqual({ provider: 'fake', accountRef: 'acct_vendor_1' });
    expect(payments.sessions[0]?.platformFeeMinor).toBe(2136 + 890);
  });

  it('refuses a vendor with no payout account, holds no seat and creates no session', async () => {
    const { deps, store, payments, slot } = build('vendor_is_merchant', null);
    const r = await startCheckout(deps, request());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('VENDOR_NOT_PAYABLE');
    expect(payments.sessions).toHaveLength(0);
    expect(store.slots.get(slot.id)?.bookedCount).toBe(0);
    expect(store.bookings.size).toBe(0);
  });

  it.each(['onboarding', 'restricted'] as const)('refuses an account that is %s, not ready', async (status) => {
    const { deps, payments } = build('vendor_is_merchant', { status });
    const r = await startCheckout(deps, request());
    expect(r.ok).toBe(false);
    expect(payments.sessions).toHaveLength(0);
  });

  it('refuses an account held at a different provider than the one that would charge it', async () => {
    const { deps, payments } = build('vendor_is_merchant', { provider: 'someone_else' });
    const r = await startCheckout(deps, request());
    expect(r.ok).toBe(false);
    expect(payments.sessions).toHaveLength(0);
  });

  it('never falls back to the platform account: a refused vendor is not charged anywhere', async () => {
    const { deps, payments } = build('vendor_is_merchant', null);
    await startCheckout(deps, request());
    expect(payments.sessions.some((s) => s.payee === null)).toBe(false);
  });

  it('a retry of the same request reuses the same payee, so the provider sees the same call', async () => {
    const { deps, payments } = build('vendor_is_merchant');
    await startCheckout(deps, request());
    const replay = await startCheckout(deps, request());
    expect(replay.ok && replay.idempotentReplay).toBe(true);
    expect(payments.sessions[1]?.payee).toEqual(payments.sessions[0]?.payee);
    expect(payments.sessions[1]?.platformFeeMinor).toBe(payments.sessions[0]?.platformFeeMinor);
  });

  it('a retry is refused if the vendor stopped being payable in between', async () => {
    const { deps, store, slot } = build('vendor_is_merchant');
    await startCheckout(deps, request());
    store.vendorPayouts.set(slot.vendorOrgId, { provider: 'fake', accountRef: 'acct_vendor_1', status: 'restricted' });
    const replay = await startCheckout(deps, request());
    expect(replay.ok).toBe(false);
  });
});

describe('platform_collects (demo and staging)', () => {
  it('charges the platform account with no split, even if the vendor has a payout account', async () => {
    const { deps, payments } = build('platform_collects');
    const r = await startCheckout(deps, request());
    expect(r.ok).toBe(true);
    expect(payments.sessions[0]?.payee).toBeNull();
    expect(payments.sessions[0]?.platformFeeMinor).toBe(0);
  });

  it('does not need the vendor to have a payout account at all', async () => {
    const { deps } = build('platform_collects', null);
    expect((await startCheckout(deps, request())).ok).toBe(true);
  });
});

describe('platformTake', () => {
  it('is commission plus service fee, nothing more', () => {
    expect(platformTake({ commissionMinor: 2136, serviceFeeMinor: 890 })).toBe(3026);
    expect(platformTake({ commissionMinor: 0, serviceFeeMinor: 0 })).toBe(0);
  });
});

describe('payout port', () => {
  const ready: VendorPayout = { provider: 'stripe', accountRef: 'acct_1', status: 'ready' };

  it('only a ready account at the same provider can take bookings', () => {
    expect(canTakeBookings(ready, 'stripe')).toBe(true);
    expect(canTakeBookings({ ...ready, status: 'onboarding' }, 'stripe')).toBe(false);
    expect(canTakeBookings(ready, 'other')).toBe(false);
    expect(canTakeBookings(null, 'stripe')).toBe(false);
  });

  it('the null adapter reports not ready and never invents an account', async () => {
    const port = createNullPayoutPort();
    expect(await port.status({ provider: 'none', accountRef: 'x' })).toBe('restricted');
    await expect(port.ensureAccount({ vendorOrgId: 'v', email: null })).rejects.toThrow();
  });
});
