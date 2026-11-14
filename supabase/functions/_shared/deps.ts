/**
 * Factory for PaymentCoreDeps — wires the real Supabase and Stripe adapters together.
 *
 * Every Edge Function calls this once at request time. The service-role key and the Stripe
 * secret must be in Deno.env; missing either throws immediately so the function fails fast
 * with a clear error rather than a confusing NPE inside the core.
 */

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { generateVoucherId } from '@cvip/types';
import { PAYOUT_MODELS, type PaymentCoreDeps, type PayoutModel } from '@cvip/payments';
import { makeSupabaseStore } from './supabaseStore.ts';
import { makeStripeProvider } from './stripeProvider.ts';
import { cancelUrl, successUrl } from './returnUrls.ts';

export function makeDeps(overrides?: Partial<PaymentCoreDeps>): PaymentCoreDeps {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  // Optional: the Connect endpoint's own secret, needed once vendors are paid through connected accounts.
  const stripeConnectWebhookSecret = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET') ?? '';
  const voucherSecret = Deno.env.get('VOUCHER_HMAC_SECRET') ?? '';
  const appUrl = Deno.env.get('APP_URL') ?? '';
  const payoutModel = Deno.env.get('PAYOUT_MODEL') ?? '';

  if (!supabaseUrl) throw new Error('SUPABASE_URL is required');
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  if (!stripeSecretKey) throw new Error('STRIPE_SECRET_KEY is required');
  if (!stripeWebhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is required');
  if (!voucherSecret) throw new Error('VOUCHER_HMAC_SECRET is required');
  if (!appUrl) throw new Error('APP_URL is required');
  // No default: a silent one would decide who the merchant of record is. Staging and the demo set
  // `platform_collects`; production sets `vendor_is_merchant` (docs/payment-partners.md).
  if (!PAYOUT_MODELS.includes(payoutModel as PayoutModel)) {
    throw new Error(`PAYOUT_MODEL must be one of: ${PAYOUT_MODELS.join(', ')}`);
  }

  // With vendors paid through their own accounts the payment events go only to the Connect endpoint.
  // Without its secret every delivery is refused: guests are charged and nothing ever confirms.
  if (payoutModel === 'vendor_is_merchant' && !stripeConnectWebhookSecret) {
    throw new Error('STRIPE_CONNECT_WEBHOOK_SECRET is required when PAYOUT_MODEL is vendor_is_merchant');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    store: makeSupabaseStore(supabase),
    payments: makeStripeProvider(
      stripeSecretKey,
      [stripeWebhookSecret, stripeConnectWebhookSecret].filter((x) => x !== ''),
    ),
    payoutModel: payoutModel as PayoutModel,
    clock: { now: () => new Date() },
    ids: {
      voucherId: () => generateVoucherId(),
      referenceSeed: () => generateVoucherId(),
    },
    voucherSecret,
    pendingPaymentTtlMinutes: 30,
    // Defaults only — `checkout-session` overrides both with the experience it is charging for.
    // They were `{BOOKING_ID}` and `{EXPERIENCE_ID}`, neither of which Stripe substitutes: Stripe
    // knows only `{CHECKOUT_SESSION_ID}`, so a guest would have landed on a literal brace.
    successUrl: successUrl(appUrl),
    cancelUrl: cancelUrl(appUrl, ''),
    ...overrides,
  };
}
