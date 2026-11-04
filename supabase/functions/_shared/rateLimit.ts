/**
 * Rate limits for the Edge Functions that create money or vouchers.
 *
 * Two keys per request: the signed-in user (tight; an anonymous Supabase account is cheap to mint, so
 * this alone is not enough) and the network address (loose, because tourists share hotel and
 * cruise-terminal Wi-Fi and a tight per-address limit would block real guests).
 *
 * The address is stored only as a short pseudonym: sha256(address + UTC date). That is not
 * anonymisation (the IPv4 space is small enough to brute force), so it is listed as personal data in
 * docs/data-inventory.md and purged with the rest of `rate_limit_events` after 7 days.
 *
 * If the limiter itself errors the request is allowed and the error logged: the database call that
 * follows would fail too if the database were down, and an attacker cannot cause a limiter error.
 * Pure policy and a small enforcer over an injected `rpc`, so it is testable without Deno or Supabase.
 */

export interface RateRule {
  limit: number;
  windowSeconds: number;
}
export interface RatePolicy {
  user: RateRule;
  address: RateRule;
}

export const RATE_POLICIES = {
  checkout: { user: { limit: 10, windowSeconds: 600 }, address: { limit: 60, windowSeconds: 600 } },
  claim_offer: { user: { limit: 30, windowSeconds: 600 }, address: { limit: 120, windowSeconds: 600 } },
  claim_guest: { user: { limit: 5, windowSeconds: 600 }, address: { limit: 30, windowSeconds: 600 } },
} as const satisfies Record<string, RatePolicy>;

export type RateAction = keyof typeof RATE_POLICIES;

export type RateDecision = { ok: true } | { ok: false; retryAfterSeconds: number };

export type RateRpc = (
  fn: 'check_rate_limit',
  args: { p_actor_key: string; p_action: string; p_limit: number; p_window_seconds: number },
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** First address in `x-forwarded-for`, else null. */
export function clientAddress(header: string | null): string | null {
  const first = (header ?? '').split(',')[0]?.trim();
  return first ? first.slice(0, 64) : null;
}

export async function addressKey(address: string, now: Date): Promise<string> {
  const day = now.toISOString().slice(0, 10);
  const bytes = new TextEncoder().encode(`${address}|${day}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return 'ip:' + Array.from(digest.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function check(rpc: RateRpc, key: string, action: RateAction, rule: RateRule) {
  const { data, error } = await rpc('check_rate_limit', {
    p_actor_key: key,
    p_action: action,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) {
    console.error('rate limiter error (allowing)', error.message);
    return { allowed: true, retry: 0 };
  }
  const d = (data ?? {}) as { allowed?: unknown; retry_after_seconds?: unknown };
  if (d.allowed === false) {
    return { allowed: false, retry: typeof d.retry_after_seconds === 'number' ? d.retry_after_seconds : 60 };
  }
  return { allowed: true, retry: 0 };
}

export async function enforceRateLimit(
  rpc: RateRpc,
  action: RateAction,
  who: { userId: string | null; forwardedFor: string | null; now: Date },
): Promise<RateDecision> {
  const policy: RatePolicy = RATE_POLICIES[action];
  const checks: Array<Promise<{ allowed: boolean; retry: number }>> = [];
  if (who.userId) checks.push(check(rpc, `user:${who.userId}`, action, policy.user));
  const addr = clientAddress(who.forwardedFor);
  if (addr) checks.push(addressKey(addr, who.now).then((k) => check(rpc, k, action, policy.address)));
  const results = await Promise.all(checks);
  const blocked = results.filter((r) => !r.allowed);
  if (blocked.length === 0) return { ok: true };
  return { ok: false, retryAfterSeconds: Math.max(...blocked.map((r) => r.retry)) };
}

export function tooManyRequests(retryAfterSeconds: number, cors: Record<string, string>, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 429,
    headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': String(retryAfterSeconds) },
  });
}
