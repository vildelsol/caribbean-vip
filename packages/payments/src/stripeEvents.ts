/**
 * Stripe's webhook payloads, translated to the provider-neutral `PaymentEvent`.
 *
 * This is the whole of what the payment core knows about Stripe's event vocabulary. A different
 * payment partner ships its own file of this shape (see docs/payment-partners.md) and the core is
 * untouched. Pure: no Stripe SDK, no network.
 */

import type { ParsedWebhook, PaymentEvent } from './ports.ts';

/** The subset of a Stripe event we read. Deliberately not Stripe's own type. */
export interface StripeLikeEvent {
  id: string;
  type: string;
  /** Present on events delivered for a connected (vendor) account. */
  account?: string | null;
  data: {
    object: {
      id: string;
      object: string;
      amount_total?: number | null;
      currency?: string | null;
      payment_intent?: string | null;
      payment_status?: string | null;
      status?: string | null;
      /** `charge` objects: the amounts and the flag Stripe sets once a charge is fully refunded. */
      amount?: number | null;
      amount_refunded?: number | null;
      refunded?: boolean | null;
      metadata?: Record<string, string> | null;
      last_payment_error?: { code?: string | null; message?: string | null } | null;
    };
  };
}

/** Event types the core acts on. Anything else is acknowledged and ignored. */
const HANDLED = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
]);

type EventObject = StripeLikeEvent['data']['object'];

/** A charge is fully refunded when Stripe says so, or when the refunded amount covers it. */
function isFullyRefunded(object: EventObject): boolean {
  if (object.refunded === true) return true;
  return (
    typeof object.amount === 'number' &&
    typeof object.amount_refunded === 'number' &&
    object.amount > 0 &&
    object.amount_refunded >= object.amount
  );
}

function kindFor(eventType: string, object: EventObject): PaymentEvent['kind'] {
  switch (eventType) {
    case 'checkout.session.completed':
      // A completed session is not necessarily a paid one: delayed methods report `unpaid` here
      // and settle later via async_payment_succeeded. Confirming on `completed` alone would hand
      // out a voucher for money that never arrives.
      return (object.payment_status ?? null) === 'paid' ? 'paid' : 'pending';
    case 'checkout.session.async_payment_succeeded':
    case 'payment_intent.succeeded':
      return 'paid';
    case 'checkout.session.async_payment_failed':
    case 'payment_intent.payment_failed':
    case 'checkout.session.expired':
      return 'failed';
    case 'charge.refunded':
      // Stripe also sends this for a partial refund. Treating it as a full one would void a
      // voucher the guest still has money in, so a partial refund is recorded and nothing else.
      return isFullyRefunded(object) ? 'refunded' : 'partially_refunded';
    default:
      return 'pending';
  }
}

export function normalizeStripeEvent(event: StripeLikeEvent): ParsedWebhook {
  if (!HANDLED.has(event.type)) return { handled: false, id: event.id, type: event.type };

  const object = event.data.object;
  const isSession = object.object === 'checkout.session';
  return {
    handled: true,
    event: {
      id: event.id,
      kind: kindFor(event.type, object),
      bookingId: object.metadata?.booking_id ?? null,
      checkoutSessionId: isSession ? object.id : null,
      // A session and a charge both point at their payment intent; a payment_intent event is one.
      // Using `object.id` for a charge would store `ch_…` where a `pi_…` belongs.
      paymentRef: object.object === 'payment_intent' ? object.id : (object.payment_intent ?? null),
    },
  };
}
