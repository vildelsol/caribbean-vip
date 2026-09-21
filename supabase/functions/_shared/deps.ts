/**
 * Factory for PaymentCoreDeps — wires the real Supabase and Stripe adapters together.
 *
 * Every Edge Function calls this once at request time. The service-role key and the Stripe
 * secret must be in Deno.env; missing either throws immediately so the function fails fast
 * with a clear error rather than a confusing NPE inside the core.
 */

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { generateVoucherId } from '@cvip/types';
import type { PaymentCoreDeps } from '@cvip/payments';
import { makeSupabaseStore } from './supabaseStore.ts';
import { makeStripeProvider } from './stripeProvider.ts';

export function makeDeps(overrides?: Partial<PaymentCoreDeps>): PaymentCoreDeps {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  const voucherSecret = Deno.env.get('VOUCHER_HMAC_SECRET') ?? '';
  const appUrl = Deno.env.get('APP_URL') ?? '';

  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  if (!stripeSecretKey) throw new Error('STRIPE_SECRET_KEY is required');
  if (!stripeWebhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is required');
  if (!voucherSecret) throw new Error('VOUCHER_HMAC_SECRET is required');
  if (!appUrl) throw new Error('APP_URL is required');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    store: makeSupabaseStore(supabase),
    payments: makeStripeProvider(stripeSecretKey, stripeWebhookSecret),
    clock: { now: () => new Date() },
    ids: {
      voucherId: () => generateVoucherId(),
      referenceSeed: () => generateVoucherId(),
    },
    voucherSecret,
    pendingPaymentTtlMinutes: 30,
    successUrl: `${appUrl}/booking-return?booking_id={BOOKING_ID}`,
    cancelUrl: `${appUrl}/checkout/{EXPERIENCE_ID}`,
    ...overrides,
  };
}
