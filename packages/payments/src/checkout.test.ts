import { describe, expect, it } from 'vitest';
import {
  MAX_LINE_QUANTITY,
  MAX_OPEN_PENDING_BOOKINGS,
  checkoutExpiry,
  checkoutRequestSchema,
  quoteBooking,
  startCheckout,
  type CheckoutRequest,
} from './checkout.ts';
import type { PaymentCoreDeps, PromotionSnapshot } from './ports.ts';
import {
  FakeBookingStore,
  FakeClock,
  FakePaymentProvider,
  SequentialIds,
  optionFixture,
  slotFixture,
} from './testing.ts';

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
  store.now = () => clock.now();
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

describe('a withdrawn listing cannot be booked', () => {
  it('treats a slot on an unapproved listing exactly like a missing one', async () => {
    const { deps, store, payments } = build({ slot: { listingBookable: false } });

    const result = await startCheckout(deps, request());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SLOT_NOT_FOUND');
    expect(store.bookings.size).toBe(0);
    expect(store.slots.get(slotFixture().id)?.bookedCount).toBe(0);
    expect(payments.sessions.length).toBe(0);
  });

  it('refuses a quote too, so the price of a withdrawn listing is not readable', async () => {
    const { deps } = build({ slot: { listingBookable: false } });
    const quote = await quoteBooking(deps, request());
    expect(quote.ok).toBe(false);
  });

  it('still books an approved listing (positive control)', async () => {
    const { deps } = build({ slot: { listingBookable: true } });
    expect((await startCheckout(deps, request())).ok).toBe(true);
  });
});

describe('holding seats without paying (audit finding 1)', () => {
  const MIN = 60_000;

  it('opens the Stripe session with a short expiry, not the 24 hours Stripe defaults to', async () => {
    const { deps, payments, clock } = build({ slot: { capacity: 10 } });
    await startCheckout(deps, request());
    const expiresAt = payments.sessions[0]?.expiresAt;
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt!.getTime() - clock.now().getTime()).toBeLessThanOrEqual(60 * MIN);
  });

  describe('checkoutExpiry', () => {
    const now = new Date('2026-08-02T12:00:00Z');
    it('never asks for less than Stripe will accept (30 min from ITS clock, so 31 from ours)', () => {
      expect(checkoutExpiry(now, 30).getTime() - now.getTime()).toBe(31 * MIN);
      expect(checkoutExpiry(now, 1).getTime() - now.getTime()).toBe(31 * MIN);
    });
    it('uses the configured ttl when it is in range', () => {
      expect(checkoutExpiry(now, 45).getTime() - now.getTime()).toBe(45 * MIN);
    });
    it('never asks for more than Stripe allows (24 h)', () => {
      expect(checkoutExpiry(now, 99_999).getTime() - now.getTime()).toBe(1439 * MIN);
    });
  });

  describe('open unpaid bookings per guest', () => {
    const open = async (ctx: ReturnType<typeof build>, n: number, userId = USER) => {
      for (let i = 0; i < n; i++) {
        const r = await startCheckout(ctx.deps, request({ userId, idempotencyKey: `${userId.slice(0, 4)}-key-${i}-xxxx` }));
        expect(r.ok).toBe(true);
      }
    };

    it(`refuses a guest's ${MAX_OPEN_PENDING_BOOKINGS + 1}th open unpaid booking, and reserves nothing for it`, async () => {
      const ctx = build({ slot: { capacity: 100 } });
      await open(ctx, MAX_OPEN_PENDING_BOOKINGS);
      const heldBefore = ctx.store.slots.get(slotFixture().id)?.bookedCount;
      const sessionsBefore = ctx.payments.sessions.length;

      const r = await startCheckout(ctx.deps, request({ idempotencyKey: 'one-too-many-key' }));

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('TOO_MANY_PENDING_BOOKINGS');
      expect(ctx.store.slots.get(slotFixture().id)?.bookedCount).toBe(heldBefore);
      expect(ctx.payments.sessions.length).toBe(sessionsBefore);
    });

    it('does not stop a different guest (positive control)', async () => {
      const ctx = build({ slot: { capacity: 100 } });
      await open(ctx, MAX_OPEN_PENDING_BOOKINGS);
      const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      const r = await startCheckout(ctx.deps, request({ userId: other, idempotencyKey: 'other-guest-key' }));
      expect(r.ok).toBe(true);
    });

    it('does not count a booking that was paid for', async () => {
      const ctx = build({ slot: { capacity: 100 } });
      await open(ctx, MAX_OPEN_PENDING_BOOKINGS);
      for (const b of ctx.store.bookings.values()) b.status = 'confirmed';
      const r = await startCheckout(ctx.deps, request({ idempotencyKey: 'after-paying-key' }));
      expect(r.ok).toBe(true);
    });

    it('stops counting a booking once its session must have expired, even if the expiry event never arrived', async () => {
      const ctx = build({ slot: { capacity: 100 } });
      await open(ctx, MAX_OPEN_PENDING_BOOKINGS);
      ctx.clock.advance(3 * 60 * MIN);
      const r = await startCheckout(ctx.deps, request({ idempotencyKey: 'much-later-key' }));
      expect(r.ok).toBe(true);
    });

    it('lets a guest retry the same request (idempotent replay is not a new hold)', async () => {
      const ctx = build({ slot: { capacity: 100 } });
      await open(ctx, MAX_OPEN_PENDING_BOOKINGS);
      const again = await startCheckout(ctx.deps, request({ idempotencyKey: `${USER.slice(0, 4)}-key-0-xxxx` }));
      expect(again.ok && again.idempotentReplay).toBe(true);
    });
  });

  describe('seats per line', () => {
    const parse = (quantity: number) =>
      checkoutRequestSchema.safeParse({
        ...request(),
        lines: [{ optionId: ADULT, quantity }],
      });
    it(`allows up to ${MAX_LINE_QUANTITY}`, () => {
      expect(parse(MAX_LINE_QUANTITY).success).toBe(true);
    });
    it('refuses more, so one request cannot name a whole departure', () => {
      expect(parse(MAX_LINE_QUANTITY + 1).success).toBe(false);
    });
  });
});

describe('idempotency keys belong to the guest who made them', () => {
  const STRANGER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('refuses another guest replaying a key, and returns nothing of the first booking', async () => {
    const { deps, store, payments } = build({ slot: { capacity: 10 } });
    const first = await startCheckout(deps, request());
    expect(first.ok).toBe(true);
    const sessionsBefore = payments.sessions.length;

    const replay = await startCheckout(deps, request({ userId: STRANGER }));

    expect(replay.ok).toBe(false);
    if (replay.ok) return;
    expect(replay.error.code).toBe('IDEMPOTENCY_KEY_IN_USE');
    expect(JSON.stringify(replay)).not.toContain(first.ok ? first.reference : 'x');
    expect(payments.sessions.length).toBe(sessionsBefore);
    expect(store.bookings.size).toBe(1);
  });

  it('still replays for the guest who owns the key (positive control)', async () => {
    const { deps } = build();
    await startCheckout(deps, request());
    const again = await startCheckout(deps, request());
    expect(again.ok && again.idempotentReplay).toBe(true);
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
