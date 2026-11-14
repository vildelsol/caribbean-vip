/**
 * Stripe implementation of PaymentProvider (AD-02, AD-09).
 *
 * With a payee (the vendor is the merchant of record) this makes a DIRECT charge on the vendor's
 * connected account and keeps the platform's fee as an application fee: the vendor is the seller of
 * record in Stripe's own terms, which is what the marketplace position needs. Without a payee the
 * charge lands in the platform's account (`platform_collects`).
 *
 * Another partner replaces this file and implements the same `PaymentProvider`; see
 * docs/payment-partners.md. Event translation lives in `@cvip/payments` (`normalizeStripeEvent`), so
 * the booking logic never sees Stripe's event names.
 *
 * NOT yet exercised against live Stripe Connect: the account-header and application-fee calls follow
 * Stripe's documented direct-charge shape and are covered only by the `payments` unit tests. Prove
 * them in a Connect test-mode account before production (docs/production-provisioning.md section 7).
 */

import Stripe from 'npm:stripe@^17';
import {
  normalizeStripeEvent,
  type CheckoutSession,
  type CheckoutSessionRequest,
  type ParsedWebhook,
  type PaymentProvider,
  type RefundRequest,
  type StripeLikeEvent,
} from '@cvip/payments';

/**
 * `webhookSecrets` holds one secret per Stripe endpoint: the platform endpoint, and the Connect
 * endpoint that receives events for vendors' connected accounts. A payload is accepted if any one
 * secret verifies it.
 */
export function makeStripeProvider(secretKey: string, webhookSecrets: string[]): PaymentProvider {
  const stripe = new Stripe(secretKey, { apiVersion: '2025-06-30.basil' });

  return {
    name: 'stripe',

    async createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSession> {
      const currency = req.currency.toLowerCase();
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          currency,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency,
                unit_amount: req.amountMinor,
                product_data: { name: req.description },
              },
            },
          ],
          customer_email: req.customerEmail ?? undefined,
          metadata: req.metadata,
          ...(req.payee
            ? {
                payment_intent_data: {
                  application_fee_amount: req.platformFeeMinor,
                  // Without this the payment intent events on the vendor's account carry no booking id.
                  metadata: req.metadata,
                },
              }
            : {}),
          success_url: req.successUrl,
          cancel_url: req.cancelUrl,
          // Without this Stripe keeps the session open for 24 hours and the seats stay held.
          expires_at: Math.floor(req.expiresAt.getTime() / 1000),
        },
        {
          idempotencyKey: req.idempotencyKey,
          ...(req.payee ? { stripeAccount: req.payee.accountRef } : {}),
        },
      );
      return { id: session.id, url: session.url ?? '' };
    },

    async parseWebhook(rawBody: string, signature: string): Promise<ParsedWebhook> {
      let lastError: unknown = new Error('no webhook secret configured');
      for (const secret of webhookSecrets) {
        try {
          const event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret);
          return normalizeStripeEvent(event as unknown as StripeLikeEvent);
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError;
    },

    async refund(req: RefundRequest): Promise<void> {
      await stripe.refunds.create(
        {
          payment_intent: req.paymentRef,
          amount: req.amountMinor,
          // Ro's rule, 2026-11-14: the platform's fee goes back with a refund, in proportion for a
          // partial one, so the vendor is not left carrying a fee on money the guest got back.
          ...(req.payee ? { refund_application_fee: true } : {}),
        },
        {
          idempotencyKey: req.idempotencyKey,
          // A refund must come out of the account the payment went to.
          ...(req.payee ? { stripeAccount: req.payee.accountRef } : {}),
        },
      );
    },
  };
}
