/**
 * delete-my-account: remove the caller's sign-in after they have erased their data.
 *
 * POST (no body)   Authorization: Bearer <the guest's access token>
 * -> { ok: true }                          the Auth user is deleted
 * -> { ok: false, message } with 401 / 405 / 409 / 500
 *
 * The caller is whoever Auth says the bearer token belongs to. Nothing in the request names a user,
 * so a guest can only ever remove themselves. Whether removal is allowed at all is not decided
 * here: `begin_account_removal()` decides and records it (feature switch, recent erasure, no
 * bookings, tourist only). This function does the one thing a database function cannot, which is
 * call the Auth admin API.
 */

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { bearerToken } from '../_shared/callerIdentity.ts';
import { removalRefusal } from '../_shared/accountRemoval.ts';

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
  const userId = caller.user?.id ?? null;
  if (!userId) return json({ ok: false, message: 'Sign in required' }, 401);

  try {
    const decision = await supabase.rpc('begin_account_removal', { p_user_id: userId });
    if (decision.error) throw decision.error;
    if (decision.data !== 'ok') {
      const r = removalRefusal(decision.data);
      return json({ ok: false, message: r.message }, r.status);
    }

    const removal = await supabase.auth.admin.deleteUser(userId);
    if (removal.error) throw removal.error;
    return json({ ok: true });
  } catch (e) {
    // Logged, never returned: error text can name tables and columns.
    console.error('delete-my-account failed', e instanceof Error ? e.message : e);
    return json({ ok: false, message: 'Could not remove your sign-in right now' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
