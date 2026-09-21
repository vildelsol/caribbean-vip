/**
 * stripe-webhook — T-05.
 *
 * POST with raw Stripe webhook body + Stripe-Signature header.
 * Verifies signature, delegates to handleStripeWebhook, stores the ticket token on the
 * booking row so the tourist app can fetch it after redirect.
 *
 * Returns 200 for every outcome except a bad signature (400). Stripe interprets any non-2xx
 * as a failure and retries; returning 200 for duplicates or ignored events is intentional.
 */

import { handleStripeWebhook } from '@cvip/payments';
import { createClient } from 'npm:@supabase/supabase-js@^2';
import { makeDeps } from '../_shared/deps.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('POST only', { status: 405 });
  }

  const sig = req.headers.get('stripe-signature') ?? '';
  const rawBody = await req.text();

  let deps;
  try {
    deps = makeDeps();
  } catch (err) {
    console.error('deps init failed:', err);
    return new Response('Server configuration error', { status: 500 });
  }

  const outcome = await handleStripeWebhook(deps, rawBody, sig);

  if (outcome.status === 'rejected') {
    return new Response('Bad signature', { status: 400 });
  }

  // On confirmation, persist the ticket token so the guest app can retrieve it.
  if (outcome.status === 'processed' && outcome.action === 'confirmed' && outcome.voucherToken) {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    await supabase
      .from('bookings')
      .update({ ticket_token: outcome.voucherToken })
      .eq('id', outcome.bookingId);
  }

  console.log('webhook outcome:', outcome.status, 'eventId' in outcome ? outcome.eventId : '');
  return new Response(JSON.stringify({ received: true, outcome: outcome.status }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
