import { describe, expect, it } from 'vitest';
import { startCheckout } from './checkout.ts';
import { handleStripeWebhook } from './webhook.ts';
import type { PaymentCoreDeps } from './ports.ts';
import {
  FakeBookingStore,
  FakeClock,
  FakePaymentProvider,
  SequentialIds,
  optionFixture,
  slotFixture,
  stripeEvent,
} from './testing.ts';

const USER = '55555555-5555-4555-8555-555555555555';
const ADULT = '44444444-4444-4444-8444-444444444444';

/** Builds a booking that has reached `pending_payment`, exactly as a real checkout leaves it. */
async function withPendingBooking() {
  const store = new FakeBookingStore({
    slots: [slotFixture({ capacity: 10 })],
    options: [optionFixture()],
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

  const checkout = await startCheckout(deps, {
    userId: USER,
    availabilitySlotId: slotFixture().id,
    lines: [{ optionId: ADULT, quantity: 2 }],
    promotionId: null,
    customerEmail: null,
    idempotencyKey: 'idem-webhook-1',
  });
  if (!checkout.ok) throw new Error('fixture checkout failed');

  return { deps, store, payments, clock, bookingId: checkout.bookingId };
}

describe('signature verification', () => {
  it('rejects a bad signature without touching the database', async () => {
    const { deps, store, bookingId } = await withPendingBooking();
    const before = store.seenEventIds.size;

    const r = await handleStripeWebhook(
      deps,
      stripeEvent({ bookingId }),
      'forged-signature',
    );

    expect(r.status).toBe('rejected');
    expect(store.seenEventIds.size).toBe(before);
    expect(store.bookings.get(bookingId)?.status).toBe('pending_payment');
  });
});

describe('exactly once (T-05)', () => {
  it('confirms the booking and issues one voucher', async () => {
    const { deps, store, bookingId } = await withPendingBooking();

    const r = await handleStripeWebhook(deps, stripeEvent({ bookingId }), 'valid-signature');

    expect(r.status).toBe('processed');
    if (r.status !== 'processed') return;
    expect(r.action).toBe('confirmed');
    expect(r.voucherToken).toMatch(/^cvip:\/\/v1\//);
    expect(store.bookings.get(bookingId)?.status).toBe('confirmed');
    expect(store.vouchers).toHaveLength(1);
    expect(store.tripItems).toHaveLength(1);
  });

  it('is a no-op when the SAME event is replayed', async () => {
    const { deps, store, bookingId } = await withPendingBooking();
    const body = stripeEvent({ bookingId, id: 'evt_replay' });

    await handleStripeWebhook(deps, body, 'valid-signature');
    const second = await handleStripeWebhook(deps, body, 'valid-signature');
    const third = await handleStripeWebhook(deps, body, 'valid-signature');

    expect(second.status).toBe('duplicate');
    expect(third.status).toBe('duplicate');
    // The property that matters: one booking, one voucher, one trip entry.
    expect(store.vouchers).toHaveLength(1);
    expect(store.tripItems).toHaveLength(1);
    expect(store.bookings.size).toBe(1);
  });

  it('issues no second voucher even if a DIFFERENT event tries to confirm again', async () => {
    // Belt and braces: the idempotency index is the primary guard, the booking-state check is
    // the backstop. This test removes the primary guard to prove the backstop works.
    const { deps, store, bookingId } = await withPendingBooking();

    await handleStripeWebhook(deps, stripeEvent({ bookingId, id: 'evt_1' }), 'valid-signature');
    const second = await handleStripeWebhook(
      deps,
      stripeEvent({ bookingId, id: 'evt_2', type: 'payment_intent.succeeded', objectType: 'payment_intent', objectId: 'pi_test_1' }),
      'valid-signature',
    );

    expect(second.status).toBe('ignored');
    expect(store.vouchers).toHaveLength(1);
  });
});

describe('out-of-order delivery', () => {
  it('confirms on payment_intent.succeeded arriving BEFORE checkout.session.completed', async () => {
    // Stripe does not guarantee ordering, and this is the common inversion.
    const { deps, store, bookingId } = await withPendingBooking();

    const first = await handleStripeWebhook(
      deps,
      stripeEvent({
        bookingId,
        id: 'evt_pi',
        type: 'payment_intent.succeeded',
        objectType: 'payment_intent',
        objectId: 'pi_test_1',
      }),
      'valid-signature',
    );

    expect(first.status).toBe('processed');
    expect(store.bookings.get(bookingId)?.status).toBe('confirmed');

    // The later session event must not double-issue.
    const second = await handleStripeWebhook(
      deps,
      stripeEvent({ bookingId, id: 'evt_cs' }),
      'valid-signature',
    );
    expect(second.status).toBe('ignored');
    expect(store.vouchers).toHaveLength(1);
  });
});

describe('delayed and failed payments', () => {
  it('does NOT confirm a completed session whose payment_status is unpaid', async () => {
    // Delayed methods report `completed` with `unpaid` and settle later. Confirming here would
    // hand out a voucher for money that never arrives.
    const { deps, store, bookingId } = await withPendingBooking();

    const r = await handleStripeWebhook(
      deps,
      stripeEvent({ bookingId, paymentStatus: 'unpaid' }),
      'valid-signature',
    );

    expect(r.status).toBe('ignored');
    expect(store.bookings.get(bookingId)?.status).toBe('pending_payment');
    expect(store.vouchers).toHaveLength(0);
  });

  it('confirms once the async payment succeeds', async () => {
    const { deps, store, bookingId } = await withPendingBooking();

    await handleStripeWebhook(
      deps,
      stripeEvent({ bookingId, id: 'evt_a', paymentStatus: 'unpaid' }),
      'valid-signature',
    );
    const r = await handleStripeWebhook(
      deps,
      stripeEvent({
        bookingId,
        id: 'evt_b',
        type: 'checkout.session.async_payment_succeeded',
        paymentStatus: 'paid',
      }),
      'valid-signature',
    );

    expect(r.status).toBe('processed');
    expect(store.bookings.get(bookingId)?.status).toBe('confirmed');
    expect(store.vouchers).toHaveLength(1);
  });

  it('cancels the booking and RELEASES the seats on payment failure', async () => {
    const { deps, store, bookingId } = await withPendingBooking();
    expect(store.slots.get(slotFixture().id)?.bookedCount).toBe(2);

    const r = await handleStripeWebhook(
      deps,
      stripeEvent({ bookingId, id: 'evt_fail', type: 'payment_intent.payment_failed', objectType: 'payment_intent', objectId: 'pi_test_1' }),
      'valid-signature',
    );

    expect(r.status).toBe('processed');
    if (r.status !== 'processed') return;
    expect(r.action).toBe('failed');
    expect(store.bookings.get(bookingId)?.status).toBe('cancelled');
    // Held seats must go back, or a failed card permanently removes inventory.
    expect(store.slots.get(slotFixture().id)?.bookedCount).toBe(0);
    expect(store.vouchers).toHaveLength(0);
  });

  it('releases the seats when a checkout session expires', async () => {
    const { deps, store, bookingId } = await withPendingBooking();

    await handleStripeWebhook(
      deps,
      stripeEvent({ bookingId, id: 'evt_exp', type: 'checkout.session.expired', paymentStatus: null }),
      'valid-signature',
    );

    expect(store.slots.get(slotFixture().id)?.bookedCount).toBe(0);
  });

  it('does not tear down a CONFIRMED booking on a late failure event', async () => {
    const { deps, store, bookingId } = await withPendingBooking();

    await handleStripeWebhook(deps, stripeEvent({ bookingId, id: 'evt_ok' }), 'valid-signature');
    const late = await handleStripeWebhook(
      deps,
      stripeEvent({ bookingId, id: 'evt_late_fail', type: 'payment_intent.payment_failed', objectType: 'payment_intent', objectId: 'pi_test_1' }),
      'valid-signature',
    );

    expect(late.status).toBe('ignored');
    expect(store.bookings.get(bookingId)?.status).toBe('confirmed');
  });
});

describe('refunds', () => {
  it('marks the booking refunded but does NOT silently reclaim capacity', async () => {
    const { deps, store, bookingId } = await withPendingBooking();
    await handleStripeWebhook(deps, stripeEvent({ bookingId, id: 'evt_paid' }), 'valid-signature');

    const bookedAfterPayment = store.slots.get(slotFixture().id)?.bookedCount;

    const r = await handleStripeWebhook(
      deps,
      stripeEvent({ bookingId, id: 'evt_refund', type: 'charge.refunded', objectType: 'charge', objectId: 'ch_1' }),
      'valid-signature',
    );

    expect(r.status).toBe('processed');
    expect(store.bookings.get(bookingId)?.status).toBe('refunded');
    // The departure may already have happened; re-opening the place is the vendor's call.
    expect(store.slots.get(slotFixture().id)?.bookedCount).toBe(bookedAfterPayment);
  });
});

describe('events we should not act on', () => {
  it('acknowledges an unhandled event type instead of erroring it into an infinite retry', async () => {
    const { deps, bookingId } = await withPendingBooking();
    const r = await handleStripeWebhook(
      deps,
      stripeEvent({ bookingId, id: 'evt_x', type: 'customer.created' }),
      'valid-signature',
    );
    expect(r.status).toBe('ignored');
    if (r.status !== 'ignored') return;
    expect(r.reason).toContain('customer.created');
  });

  it('ignores an event that matches no booking', async () => {
    const { deps } = await withPendingBooking();
    const r = await handleStripeWebhook(
      deps,
      stripeEvent({ bookingId: null, id: 'evt_orphan', objectId: 'cs_unknown' }),
      'valid-signature',
    );
    expect(r.status).toBe('ignored');
    if (r.status !== 'ignored') return;
    expect(r.reason).toBe('no_matching_booking');
  });

  it('matches by checkout session id when metadata is absent', async () => {
    const { deps, store, payments, bookingId } = await withPendingBooking();
    const sessionId = [...store.payments.values()][0]?.stripeCheckoutSessionId;
    expect(sessionId).toBeTruthy();
    void payments;

    const r = await handleStripeWebhook(
      deps,
      stripeEvent({ bookingId: null, id: 'evt_by_session', objectId: sessionId as string }),
      'valid-signature',
    );

    expect(r.status).toBe('processed');
    if (r.status !== 'processed') return;
    expect(r.bookingId).toBe(bookingId);
  });
});
