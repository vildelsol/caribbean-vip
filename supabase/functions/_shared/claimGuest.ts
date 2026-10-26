/**
 * Who may move whose bookings.
 *
 * `transfer_guest_bookings` trusts its arguments, so this function is the proof of identity: it
 * needs a verified token for the account (the bearer) AND a verified token for the guest being
 * emptied (the body). Naming a guest id is not enough, since ids leak. Pure and in its own file
 * because the function around it needs Deno and a live Supabase.
 *
 * Both ids come from `auth.getUser`, never from the request. Whether the guest is really anonymous
 * and the account really has a confirmed email is checked again inside the RPC.
 */

export type ClaimDecision =
  | { ok: true; fromUserId: string; toUserId: string }
  | { ok: false; status: 400 | 401 };

export function decideClaim(accountUserId: string | null, guestUserId: string | null): ClaimDecision {
  if (!accountUserId) return { ok: false, status: 401 };
  if (!guestUserId) return { ok: false, status: 400 };
  if (guestUserId === accountUserId) return { ok: false, status: 400 };
  return { ok: true, fromUserId: guestUserId, toUserId: accountUserId };
}

/** The guest's access token from a JSON body, or null for anything that is not a non-empty string. */
export function guestTokenFromBody(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const token = (body as Record<string, unknown>).guestAccessToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}
