/**
 * checkout-session — T-04, T-05.
 *
 * The user is whoever Auth says the bearer token belongs to. `userId` in the body is accepted only
 * if it matches that user and is otherwise refused (403); no signed-in user is 401. See
 * `_shared/callerIdentity.ts`.
 *
 * POST { userId, availabilitySlotId, lines, promotionId?, customerEmail?, idempotencyKey, experienceId }
 * → { ok: true,  checkoutUrl, bookingId, reference }
 * → { ok: false, code, message }
 *
 * Thin adapter: parses, wires deps, calls startCheckout, serialises. No business logic here.
 */

import { startCheckout, checkoutRequestSchema } from '@cvip/payments';
import { createClient } from 'npm:@supabase/supabase-js@^2';
import { makeDeps } from '../_shared/deps.ts';
import { bearerToken, resolveCheckoutUser } from '../_shared/callerIdentity.ts';
import { cancelUrl, successUrl } from '../_shared/returnUrls.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') {
    return json({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'POST only' }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid JSON' }, 400);
  }

  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid request' }, 422);
  }

  // Ask Auth who the bearer is. The anon key has no user and comes back null.
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const token = bearerToken(req.headers.get('Authorization'));
  const { data: auth } = token ? await authClient.auth.getUser(token) : { data: { user: null } };
  const who = resolveCheckoutUser(auth.user?.id ?? null, parsed.data.userId);
  if (!who.ok) {
    return who.status === 401
      ? json({ ok: false, code: 'UNAUTHENTICATED', message: 'Sign in required' }, 401)
      : json({ ok: false, code: 'FORBIDDEN', message: 'Cannot check out for another user' }, 403);
  }

  const experienceId = (body as { experienceId?: string }).experienceId ?? '';
  const appUrl = Deno.env.get('APP_URL') ?? '';

  let deps;
  try {
    deps = makeDeps({
      successUrl: successUrl(appUrl),
      cancelUrl: cancelUrl(appUrl, experienceId),
    });
  } catch (err) {
    console.error('deps init failed:', err);
    return json({ ok: false, code: 'SERVER_ERROR', message: 'Server configuration error' }, 500);
  }

  const result = await startCheckout(deps, { ...parsed.data, userId: who.userId });

  if (!result.ok) {
    const status = result.error.code === 'SLOT_NOT_FOUND' ? 404
      : result.error.code === 'SOLD_OUT' || result.error.code === 'IDEMPOTENCY_KEY_IN_USE' ? 409
      : result.error.code === 'TOO_MANY_PENDING_BOOKINGS' ? 429
      : 422;
    return json({ ok: false, code: result.error.code, message: result.error.message }, status);
  }

  return json({
    ok: true,
    checkoutUrl: result.checkoutUrl,
    bookingId: result.bookingId,
    reference: result.reference,
    idempotentReplay: result.idempotentReplay,
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
