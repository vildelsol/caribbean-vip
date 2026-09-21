/**
 * checkout-session — T-04, T-05.
 *
 * POST { userId, availabilitySlotId, lines, promotionId?, customerEmail?, idempotencyKey, experienceId }
 * → { ok: true,  checkoutUrl, bookingId, reference }
 * → { ok: false, code, message }
 *
 * Thin adapter: parses, wires deps, calls startCheckout, serialises. No business logic here.
 */

import { startCheckout, checkoutRequestSchema } from '@cvip/payments';
import { makeDeps } from '../_shared/deps.ts';
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

  const result = await startCheckout(deps, parsed.data);

  if (!result.ok) {
    const status = result.error.code === 'SLOT_NOT_FOUND' ? 404
      : result.error.code === 'SOLD_OUT' ? 409
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
