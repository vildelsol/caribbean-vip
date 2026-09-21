/**
 * Stripe implementation of PaymentProvider (AD-02, AD-09).
 *
 * AD-09 note: nothing here mentions a destination account, so adding Connect later means
 * changing this file only, not the checkout logic.
 */

import Stripe from 'npm:stripe@^17';
import type { PaymentProvider, CheckoutSession, CheckoutSessionRequest, StripeLikeEvent } from '@cvip/payments';

export function makeStripeProvider(secretKey: string, webhookSecret: string): PaymentProvider {
  const stripe = new Stripe(secretKey, { apiVersion: '2025-06-30.basil' });

  return {
    name: 'stripe',

    async createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSession> {
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          currency: req.currency.toLowerCase(),
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: req.currency.toLowerCase(),
                unit_amount: req.amountMinor,
                product_data: { name: req.description },
              },
            },
          ],
          customer_email: req.customerEmail ?? undefined,
          metadata: req.metadata,
          success_url: req.successUrl,
          cancel_url: req.cancelUrl,
        },
        { idempotencyKey: req.idempotencyKey },
      );
      return { id: session.id, url: session.url ?? '' };
    },

    async verifyWebhook(rawBody: string, signature: string): Promise<StripeLikeEvent> {
      // Stripe's Node SDK verifyWebhookSignature is synchronous; the async wrapper is for
      // compatibility with the port interface.
      const event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
      return event as unknown as StripeLikeEvent;
    },

    async refund(paymentIntentId: string, amountMinor: number, idempotencyKey: string): Promise<void> {
      await stripe.refunds.create(
        { payment_intent: paymentIntentId, amount: amountMinor },
        { idempotencyKey },
      );
    },
  };
}
