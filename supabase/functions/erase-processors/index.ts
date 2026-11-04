/**
 * erase-processors: ask every outside tool that holds the caller's data to erase it.
 *
 * POST (no body)   Authorization: Bearer <the guest's access token>
 * -> { ok: true, complete, incomplete: string[], notes: string[] }
 * -> { ok: false, message } with 401 / 405 / 500
 *
 * The caller is whoever Auth says the bearer token belongs to; the email searched for is the Auth
 * email, never one from the request. `complete` is true only when every registered tool finished.
 * New tools join by adding a port to the registry below and to `processorCoverage.ts`.
 */

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { createProcessorRegistry, eraseEverywhere } from '@cvip/types';
import { makeStripeErasurePort } from '@cvip/payments';
import { bearerToken } from '../_shared/callerIdentity.ts';
import { makeStripeCustomerClient } from '../_shared/stripeCustomerClient.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, message: 'POST only' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const token = bearerToken(req.headers.get('Authorization'));
  const { data: caller } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  const user = caller.user ?? null;
  if (!user) return json({ ok: false, message: 'Sign in required' }, 401);

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is required');
    const registry = createProcessorRegistry([makeStripeErasurePort(makeStripeCustomerClient(stripeKey))]);

    const report = await eraseEverywhere(registry, { userId: user.id, email: user.email ?? null });
    const notes = report.outcomes.flatMap((o) => (o.result.status === 'done' ? [`${o.id}: ${o.result.value.summary}`] : []));
    return json({ ok: true, complete: report.complete, incomplete: report.incomplete, notes });
  } catch (e) {
    // Logged, never returned: error text can name keys and tables.
    console.error('erase-processors failed', e instanceof Error ? e.message : e);
    return json({ ok: false, message: 'Could not reach the outside tools right now' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
