/**
 * Stripe webhook handling — T-05, PRD §10.
 *
 * "Treat Stripe webhook confirmation as the payment source of truth" and "webhook and booking
 * operations must be idempotent."
 *
 * Three properties this file is responsible for:
 *
 *   1. **Signature first.** An unverified payload is rejected before any database access, so a
 *      forged request cannot even cause a read.
 *   2. **Exactly once.** Idempotency is delegated to the unique index on
 *      `payments.stripe_event_id`. A replayed event collides there and returns
 *      `alreadyProcessed`, which this handler turns into a no-op. Handler discipline is not what
 *      makes this safe — the constraint is.
 *   3. **Confirmation happens only here.** No other code path moves a booking to `confirmed`,
 *      which is why the booking state machine allows that transition from `pending_payment` only.
 *
 * Out-of-order delivery is normal: Stripe does not guarantee ordering, and
 * `payment_intent.succeeded` frequently arrives before `checkout.session.completed`. Both are
 * handled, and whichever lands first confirms the booking.
 */

import type { PaymentCoreDeps } from './ports.ts';
import { mintVoucherToken } from './checkout.ts';

export type WebhookOutcome =
  | { status: 'ignored'; reason: string; eventId?: string }
  | { status: 'duplicate'; eventId: string }
  | { status: 'rejected'; reason: 'bad_signature' }
  | {
      status: 'processed';
      eventId: string;
      bookingId: string;
      action: 'confirmed' | 'failed' | 'refunded' | 'expired';
      /** Present only on confirmation. Returned so the adapter can deliver it to the guest. */
      voucherToken?: string;
    };

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

export async function handleStripeWebhook(
  deps: PaymentCoreDeps,
  rawBody: string,
  signature: string,
): Promise<WebhookOutcome> {
  const { store, payments, clock } = deps;

  // 1. Signature before anything else.
  let event;
  try {
    event = await payments.verifyWebhook(rawBody, signature);
  } catch {
    return { status: 'rejected', reason: 'bad_signature' };
  }

  if (!HANDLED.has(event.type)) {
    // Acknowledge unknown types with a 200. Returning an error would make Stripe retry an event
    // we will never handle, forever.
    return { status: 'ignored', reason: `unhandled_type:${event.type}`, eventId: event.id };
  }

  const object = event.data.object;
  const isSession = object.object === 'checkout.session';

  const sessionId = isSession ? object.id : null;
  const paymentIntentId = isSession ? (object.payment_intent ?? null) : object.id;

  // 2. Locate the booking. Metadata is the fast path; the session id is the fallback for events
  // that carry no metadata (payment_intent.* often does not).
  const bookingId = object.metadata?.booking_id ?? null;
  let booking = bookingId ? await store.getBooking(bookingId) : null;
  if (!booking && sessionId) booking = await store.findBookingByCheckoutSession(sessionId);

  if (!booking) {
    return { status: 'ignored', reason: 'no_matching_booking', eventId: event.id };
  }

  const nextStatus = paymentStatusFor(event.type, object.payment_status ?? null);

  // 3. Record the event. The unique index makes this the idempotency gate: a replay returns
  // alreadyProcessed and we stop here, before touching booking state or issuing a voucher.
  const recorded = await store.recordPaymentEvent({
    stripeEventId: event.id,
    stripePaymentIntentId: paymentIntentId,
    stripeCheckoutSessionId: sessionId,
    status: nextStatus,
    paidAt: nextStatus === 'paid' ? clock.now() : null,
  });

  if (recorded.alreadyProcessed) {
    return { status: 'duplicate', eventId: event.id };
  }

  switch (nextStatus) {
    case 'paid':
      return confirmBooking(deps, event.id, booking);

    case 'failed': {
      // Only a booking still awaiting payment may be failed. A confirmed booking that later
      // receives a stale failure event must not be torn down.
      if (booking.status !== 'pending_payment') {
        return { status: 'ignored', reason: 'booking_not_pending', eventId: event.id };
      }
      await store.updateBookingStatus(booking.id, 'cancelled');
      await store.releaseCapacity(booking.availabilitySlotId, booking.seats);
      return {
        status: 'processed',
        eventId: event.id,
        bookingId: booking.id,
        action: 'failed',
      };
    }

    case 'refunded': {
      await store.updateBookingStatus(booking.id, 'refunded');
      // Capacity is NOT released on refund: the departure may already have happened, and the
      // vendor's remaining places are theirs to re-open, not ours to assume.
      return {
        status: 'processed',
        eventId: event.id,
        bookingId: booking.id,
        action: 'refunded',
      };
    }

    default:
      return { status: 'ignored', reason: `no_action_for:${event.type}`, eventId: event.id };
  }
}

/**
 * Confirm a paid booking and issue its voucher.
 *
 * Guarded against confirming twice even if the idempotency check above were somehow bypassed:
 * a booking already past `pending_payment` yields no second voucher. Two independent guards for
 * the one thing that must never happen twice.
 */
async function confirmBooking(
  deps: PaymentCoreDeps,
  eventId: string,
  booking: NonNullable<Awaited<ReturnType<PaymentCoreDeps['store']['getBooking']>>>,
): Promise<WebhookOutcome> {
  const { store, clock } = deps;

  if (booking.status === 'confirmed') {
    return { status: 'ignored', reason: 'already_confirmed', eventId };
  }
  if (booking.status !== 'pending_payment') {
    return { status: 'ignored', reason: `cannot_confirm_from:${booking.status}`, eventId };
  }

  await store.updateBookingStatus(booking.id, 'confirmed');

  const slot = await store.getSlot(booking.availabilitySlotId);
  const { token, tokenHash } = await mintVoucherToken(deps);

  const validFrom = clock.now();
  // The voucher stays valid until the end of the day after the departure, so a guest whose tour
  // overruns, or who arrives on a phone with a stale clock, is not turned away at the gate.
  const validUntil = slot
    ? new Date(new Date(slot.endsAt).getTime() + 24 * 60 * 60 * 1000)
    : new Date(clock.now().getTime() + 30 * 24 * 60 * 60 * 1000);

  await store.issueVoucher({
    tokenHash,
    userId: booking.userId,
    bookingId: booking.id,
    promotionId: booking.promotionId,
    vendorOrgId: booking.vendorOrgId,
    state: 'active',
    validFrom,
    validUntil,
  });

  if (slot) {
    await store.addBookingToTrip({
      userId: booking.userId,
      bookingId: booking.id,
      islandId: '',
      destinationId: null,
      scheduledAt: slot.startsAt,
    });
  }

  return {
    status: 'processed',
    eventId,
    bookingId: booking.id,
    action: 'confirmed',
    voucherToken: token,
  };
}

function paymentStatusFor(
  eventType: string,
  paymentStatus: string | null,
): 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' {
  switch (eventType) {
    case 'checkout.session.completed':
      // A completed session is not necessarily a paid one — delayed methods report `unpaid` here
      // and settle later via async_payment_succeeded. Confirming on `completed` alone would hand
      // out a voucher for money that never arrives.
      return paymentStatus === 'paid' ? 'paid' : 'pending';
    case 'checkout.session.async_payment_succeeded':
    case 'payment_intent.succeeded':
      return 'paid';
    case 'checkout.session.async_payment_failed':
    case 'payment_intent.payment_failed':
      return 'failed';
    case 'checkout.session.expired':
      return 'failed';
    case 'charge.refunded':
      return 'refunded';
    default:
      return 'pending';
  }
}
