/**
 * Compares two secrets without stopping at the first differing character, so response time does not
 * tell a caller how much of a guess was right. Pure; used where a function is guarded by a key the
 * caller must already hold (the removal job's service-role bearer).
 */
export function sameSecret(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
