import { describe, expect, it } from 'vitest';
import { normalizeStripeEvent, type StripeLikeEvent } from './stripeEvents.ts';

function ev(type: string, object: Partial<StripeLikeEvent['data']['object']>, extra: Partial<StripeLikeEvent> = {}): StripeLikeEvent {
  return { id: 'evt_1', type, data: { object: { id: 'obj_1', object: 'checkout.session', ...object } }, ...extra };
}

function handled(e: StripeLikeEvent) {
  const r = normalizeStripeEvent(e);
  if (!r.handled) throw new Error('expected a handled event');
  return r.event;
}

describe('Stripe events to neutral payment events', () => {
  it('a completed and paid session is paid', () => {
    expect(handled(ev('checkout.session.completed', { payment_status: 'paid' })).kind).toBe('paid');
  });

  it('a completed but unpaid session is only pending, so no voucher is issued for money not received', () => {
    expect(handled(ev('checkout.session.completed', { payment_status: 'unpaid' })).kind).toBe('pending');
  });

  it.each([
    ['checkout.session.async_payment_succeeded', 'paid'],
    ['payment_intent.succeeded', 'paid'],
    ['checkout.session.async_payment_failed', 'failed'],
    ['payment_intent.payment_failed', 'failed'],
    ['checkout.session.expired', 'failed'],
  ] as const)('%s is %s', (type, kind) => {
    expect(handled(ev(type, { object: type.startsWith('payment_intent') ? 'payment_intent' : 'checkout.session' })).kind).toBe(kind);
  });

  it('a full refund is refunded and a partial one is not', () => {
    const full = ev('charge.refunded', { object: 'charge', amount: 10000, amount_refunded: 10000, refunded: true });
    const partial = ev('charge.refunded', { object: 'charge', amount: 10000, amount_refunded: 2500, refunded: false });
    expect(handled(full).kind).toBe('refunded');
    expect(handled(partial).kind).toBe('partially_refunded');
  });

  it('reads the refunded amount even when the refunded flag is missing', () => {
    const e = ev('charge.refunded', { object: 'charge', amount: 5000, amount_refunded: 5000 });
    expect(handled(e).kind).toBe('refunded');
  });

  it('an unknown event type is acknowledged, not handled', () => {
    expect(normalizeStripeEvent(ev('customer.created', {}))).toEqual({ handled: false, id: 'evt_1', type: 'customer.created' });
  });

  it('carries the booking id, session id and payment reference from the right places', () => {
    const session = handled(ev('checkout.session.completed', { id: 'cs_1', payment_intent: 'pi_1', payment_status: 'paid', metadata: { booking_id: 'b1' } }));
    expect(session).toMatchObject({ bookingId: 'b1', checkoutSessionId: 'cs_1', paymentRef: 'pi_1' });
  });

  it('a payment_intent event uses its own id as the payment reference, never a charge id', () => {
    const pi = handled(ev('payment_intent.succeeded', { id: 'pi_9', object: 'payment_intent' }));
    expect(pi.paymentRef).toBe('pi_9');
    expect(pi.checkoutSessionId).toBeNull();
    const charge = handled(ev('charge.refunded', { id: 'ch_1', object: 'charge', payment_intent: 'pi_2', amount: 1, amount_refunded: 1 }));
    expect(charge.paymentRef).toBe('pi_2');
  });

  it('a connected-account event is translated the same way as a platform one', () => {
    const e = ev('checkout.session.completed', { payment_status: 'paid', metadata: { booking_id: 'b1' } }, { account: 'acct_vendor_1' });
    expect(handled(e)).toMatchObject({ kind: 'paid', bookingId: 'b1' });
  });
});
