/**
 * Who a checkout is for.
 *
 * The user comes from Auth, never from the request body. `verify_jwt = true` only proves the bearer
 * is SOME valid Supabase JWT, and the publishable anon key is one, so on its own it lets any
 * visitor name any user. Pure and in its own file for the same reason as `returnUrls.ts`: the
 * function around it needs Deno and a live Supabase.
 */

export type CheckoutUserDecision = { ok: true; userId: string } | { ok: false; status: 401 | 403 };

/**
 * `callerUserId` is what Auth says about the bearer token (null for the anon key or a bad token).
 * `bodyUserId` is what the request claims. The client still sends it, so an old client and a new
 * function keep working while they deploy out of step — but a claim that differs from the caller is
 * refused loudly, not quietly overwritten, because that is either a bug or an attack.
 */
export function resolveCheckoutUser(
  callerUserId: string | null,
  bodyUserId: string | null,
): CheckoutUserDecision {
  if (!callerUserId) return { ok: false, status: 401 };
  if (bodyUserId !== null && bodyUserId !== callerUserId) return { ok: false, status: 403 };
  return { ok: true, userId: callerUserId };
}

/** The bearer token from an `Authorization` header, or null. */
export function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match?.[1] ?? null;
}
