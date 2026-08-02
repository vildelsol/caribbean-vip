import { describe, expect, it } from 'vitest';
import { quoteBooking, startCheckout, type CheckoutRequest } from './checkout';
import type { PaymentCoreDeps, PromotionSnapshot } from './ports';
import {
  FakeBookingStore,
  FakeClock,
  FakePaymentProvider,
  SequentialIds,
  optionFixture,
  slotFixture,
} from './testing';

const USER = '55555555-5555-4555-8555-555555555555';
const ADULT = '44444444-4444-4444-8444-444444444444';
const CHILD = '66666666-6666-4666-8666-666666666666';
const ADDON = '77777777-7777-4777-8777-777777777777';
const PROMO = '88888888-8888-4888-8888-888888888888';

function build(over: { slot?: Parameters<typeof slotFixture>[0] } = {}) {
  const store = new FakeBookingStore({
    slots: [slotFixture(over.slot ?? {})],
    options: [
      optionFixture(),
      optionFixture({ id: CHILD, label: 'Child', unitAmountMinor: 5340 }),
      optionFixture({
        id: ADDON,
        label: 'Photo package',
        unitAmountMinor: 1500,
        occupiesCapacity: false,
      }),
    ],
  });
  const payments = new FakePaymentProvider();
  const clock = new FakeClock();
  const deps: PaymentCoreDeps = {
    store,
    payments,
    clock,
    ids: new SequentialIds(),
    voucherSecret: 'test-secret-at-least-32-characters-long!!',
    pendingPaymentTtlMinutes: 30,
    successUrl: 'https://app.test/success',
    cancelUrl: 'https://app.test/cancel',
  };
  return { deps, store, payments, clock };
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

describe('server-side pricing (PRD §10: never trust totals from the client)', () => {
  it('prices from the database, ignoring anything the client might have sent', async () => {
    const { deps } = build();
    const r = await quoteBooking(deps, {
      availabilitySlotId: slotFixture().id,
      lines: [{ optionId: ADULT, quantity: 2 }],
      promotionId: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 2 × 8900 = 17800, +15% tax, +5% fee.
    expect(r.breakdown.subtotal.amountMinor).toBe(17800);
    expect(r.breakdown.total.amountMinor).toBe(21360);
  });

  it('rejects an option id that does not belong to this experience', async () => {
    const { deps } = build();
    const r = await quoteBooking(deps, {
      availabilitySlotId: slotFixture().id,
      lines: [{ optionId: '99999999-9999-4999-8999-999999999999', quantity: 1 }],
      promotionId: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('INVALID_OPTIONS');
  });

  it('rejects an inactive option rather than pricing it at zero', async () => {
    const { deps, store } = build();
    const adult = store.options.find((o) => o.id === ADULT);
    if (adult) adult.isActive = false;

    const r = await quoteBooking(deps, {
      availabilitySlotId: slotFixture().id,
      lines: [{ optionId: ADULT, quantity: 1 }],
      promotionId: null,
    });
    expect(r.ok).toBe(false);
  });

  it('does not reserve capacity when merely quoting — opening a date picker costs no seats', async () => {
    const { deps, store } = build();
    await quoteBooking(deps, {
      availabilitySlotId: slotFixture().id,
      lines: [{ optionId: ADULT, quantity: 2 }],
      promotionId: null,
    });
    expect(store.slots.get(slotFixture().id)?.bookedCount).toBe(0);
  });

  it('refuses a slot priced in a currency other than the settlement currency (OD-09)', async () => {
    const { deps, store } = build();
    store.settlementCurrency = 'USD';
    const adult = store.options.find((o) => o.id === ADULT);
    if (adult) adult.currency = 'JMD';

    const r = await quoteBooking(deps, {
      availabilitySlotId: slotFixture().id,
      lines: [{ optionId: ADULT, quantity: 1 }],
      promotionId: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('PRICING_FAILED');
  });

  it('counts only capacity-occupying lines toward seats', async () => {
    const { deps } = build();
    const r = await quoteBooking(deps, {
      availabilitySlotId: slotFixture().id,
      lines: [
        { optionId: ADULT, quantity: 2 },
        { optionId: ADDON, quantity: 4 },
      ],
      promotionId: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.breakdown.seats).toBe(2);
  });
});

describe('slot validity', () => {
  it('refuses a closed slot', async () => {
    const { deps } = build({ slot: { status: 'closed' } });
    const r = await startCheckout(deps, request());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('SLOT_CLOSED');
  });

  it('refuses a departure that has already started', async () => {
    const { deps, clock } = build();
    clock.set(new Date('2026-09-01T00:00:00Z'));
    const r = await startCheckout(deps, request());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('SLOT_IN_PAST');
  });

  it('refuses an unknown slot', async () => {
    const { deps } = build();
    const r = await startCheckout(
      deps,
      request({ availabilitySlotId: '00000000-0000-4000-8000-000000000000' }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('SLOT_NOT_FOUND');
  });
});

describe('capacity (V-03)', () => {
  it('reserves before creating the payment session, so nobody pays for a taken seat', async () => {
    const { deps, store, payments } = build({ slot: { capacity: 2 } });
    const r = await startCheckout(deps, request());
    expect(r.ok).toBe(true);
    expect(store.slots.get(slotFixture().id)?.bookedCount).toBe(2);
    expect(payments.sessions).toHaveLength(1);
  });

  it('refuses a checkout that would oversell, and creates no Stripe session', async () => {
    const { deps, store, payments } = build({ slot: { capacity: 2, bookedCount: 1 } });
    const r = await startCheckout(deps, request());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('SOLD_OUT');
    expect(payments.sessions).toHaveLength(0);
    expect(store.bookings.size).toBe(0);
  });

  it('gives the seats back if anything after the reservation fails', async () => {
    const { deps, store, payments } = build({ slot: { capacity: 10 } });
    payments.failNextSession = true;

    const r = await startCheckout(deps, request());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('PROVIDER_FAILED');
    // The whole point: a provider outage must not silently shrink inventory.
    expect(store.slots.get(slotFixture().id)?.bookedCount).toBe(0);
    expect(store.releases).toHaveLength(1);
  });

  it('also gives the seats back when a database write fails mid-flow', async () => {
    const { deps, store } = build({ slot: { capacity: 10 } });
    store.failNextGuestLines = true;

    const r = await startCheckout(deps, request());
    expect(r.ok).toBe(false);
    expect(store.slots.get(slotFixture().id)?.bookedCount).toBe(0);
  });
});

describe('idempotency (T-05)', () => {
  it('returns the existing booking for a repeated key instead of creating a second', async () => {
    const { deps, store } = build();

    const first = await startCheckout(deps, request());
    const second = await startCheckout(deps, request());

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.idempotentReplay).toBe(true);
    expect(second.bookingId).toBe(first.bookingId);
    expect(store.bookings.size).toBe(1);
  });

  it('does not reserve capacity twice on a replay — the classic double-charge bug', async () => {
    const { deps, store } = build({ slot: { capacity: 10 } });

    await startCheckout(deps, request());
    await startCheckout(deps, request());
    await startCheckout(deps, request());

    expect(store.slots.get(slotFixture().id)?.bookedCount).toBe(2);
  });

  it('treats a different key as a genuinely new booking', async () => {
    const { deps, store } = build({ slot: { capacity: 10 } });
    await startCheckout(deps, request({ idempotencyKey: 'key-a' }));
    await startCheckout(deps, request({ idempotencyKey: 'key-b' }));
    expect(store.bookings.size).toBe(2);
    expect(store.slots.get(slotFixture().id)?.bookedCount).toBe(4);
  });
});

describe('promotions (PRD §9)', () => {
  function withPromo(over: Partial<PromotionSnapshot> = {}) {
    const ctx = build();
    ctx.store.promotions.set(PROMO, {
      id: PROMO,
      vendorOrgId: slotFixture().vendorOrgId,
      title: '10% off',
      valueKind: 'percentage',
      valueAmountMinor: null,
      valueRate: 0.1,
      startsAt: '2026-07-01T00:00:00Z',
      endsAt: '2026-09-01T00:00:00Z',
      inventoryLimit: 100,
      issuedCount: 0,
      requiresBooking: true,
      approvalState: 'approved',
      appliesToExperienceIds: [],
      ...over,
    });
    return ctx;
  }

  it('applies an approved, in-window promotion', async () => {
    const { deps } = withPromo();
    const r = await quoteBooking(deps, {
      availabilitySlotId: slotFixture().id,
      lines: [{ optionId: ADULT, quantity: 2 }],
      promotionId: PROMO,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.breakdown.discountTotal.amountMinor).toBe(1780);
  });

  it.each([
    ['expired', { endsAt: '2026-07-02T00:00:00Z' }, 'expired'],
    ['not started', { startsAt: '2026-12-01T00:00:00Z' }, 'not_started'],
    ['unapproved', { approvalState: 'pending' as const }, 'not_approved'],
    ['disabled', { approvalState: 'disabled' as const }, 'not_approved'],
    ['inventory exhausted', { inventoryLimit: 5, issuedCount: 5 }, 'inventory_exhausted'],
    ['wrong vendor', { vendorOrgId: 'other-vendor' }, 'wrong_vendor'],
  ])('rejects a %s promotion', async (_label, override, expectedDetail) => {
    const { deps } = withPromo(override);
    const r = await quoteBooking(deps, {
      availabilitySlotId: slotFixture().id,
      lines: [{ optionId: ADULT, quantity: 1 }],
      promotionId: PROMO,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('PROMOTION_INVALID');
    expect((r.error as { detail: string }).detail).toBe(expectedDetail);
  });

  it('rejects a promotion scoped to a different experience', async () => {
    const { deps } = withPromo({ appliesToExperienceIds: ['some-other-experience'] });
    const r = await quoteBooking(deps, {
      availabilitySlotId: slotFixture().id,
      lines: [{ optionId: ADULT, quantity: 1 }],
      promotionId: PROMO,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects an unknown promotion id rather than ignoring it', async () => {
    const { deps } = build();
    const r = await quoteBooking(deps, {
      availabilitySlotId: slotFixture().id,
      lines: [{ optionId: ADULT, quantity: 1 }],
      promotionId: PROMO,
    });
    expect(r.ok).toBe(false);
  });

  it('itemizes an in-kind offer at zero — the rum punch case', async () => {
    const { deps } = withPromo({ valueKind: 'in_kind', valueRate: null });
    const r = await quoteBooking(deps, {
      availabilitySlotId: slotFixture().id,
      lines: [{ optionId: ADULT, quantity: 2 }],
      promotionId: PROMO,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.breakdown.discountsApplied).toHaveLength(1);
    expect(r.breakdown.total.amountMinor).toBe(21360);
  });
});

describe('what reaches Stripe', () => {
  it('sends the server-computed total, not anything from the request', async () => {
    const { deps, payments } = build();
    await startCheckout(deps, request());
    expect(payments.sessions[0]?.amountMinor).toBe(21360);
    expect(payments.sessions[0]?.currency).toBe('USD');
  });

  it('carries the booking id in metadata so the webhook can match it', async () => {
    const { deps, payments } = build();
    const r = await startCheckout(deps, request());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(payments.sessions[0]?.metadata.booking_id).toBe(r.bookingId);
  });

  it('passes an idempotency key so a retried create cannot open a second session', async () => {
    const { deps, payments } = build();
    await startCheckout(deps, request());
    expect(payments.sessions[0]?.idempotencyKey).toBe('idem-key-0001');
  });

  it('produces a human-readable booking reference in the documented shape', async () => {
    const { deps } = build();
    const r = await startCheckout(deps, request());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reference).toMatch(/^VIPJ-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });
});
