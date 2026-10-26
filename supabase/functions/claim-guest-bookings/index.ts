/**
 * claim-guest-bookings — move an anonymous guest's bookings into the account they signed in to.
 *
 * POST { guestAccessToken }   Authorization: Bearer <the account's access token>
 * → { moved: number }
 *
 * Signing in with an email code replaces the anonymous session, and the bookings stay on the
 * anonymous user id. The app keeps the guest's access token across the sign-in and sends it here
 * together with the new account's token. Both are checked with Auth; ids in the body are never
 * trusted. The RPC then re-checks that the source is anonymous and the target has a confirmed
 * email, so a bug here can only move bookings out of an anonymous user into a real account.
 *
 * Idempotent: a second call finds nothing to move and returns 0.
 */

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { bearerToken } from '../_shared/callerIdentity.ts';
import { decideClaim, guestTokenFromBody } from '../_shared/claimGuest.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const accountToken = bearerToken(req.headers.get('Authorization'));
  const { data: account } = accountToken ? await supabase.auth.getUser(accountToken) : { data: { user: null } };

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // fall through: a missing body is the same 400 as a missing token
  }
  const guestToken = guestTokenFromBody(body);
  const { data: guest } = guestToken ? await supabase.auth.getUser(guestToken) : { data: { user: null } };

  const decision = decideClaim(account.user?.id ?? null, guest.user?.id ?? null);
  if (!decision.ok) {
    return json({ error: decision.status === 401 ? 'Sign in required' : 'Guest session required' }, decision.status);
  }

  const { data, error } = await supabase.rpc('transfer_guest_bookings', {
    p_from: decision.fromUserId,
    p_to: decision.toUserId,
  });
  if (error) {
    // The RPC refuses a non-anonymous source or an unconfirmed target. Say nothing about which.
    console.error('transfer_guest_bookings refused', error.message);
    return json({ error: 'Cannot claim these bookings' }, 403);
  }

  return json({ moved: typeof data === 'number' ? data : 0 });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
