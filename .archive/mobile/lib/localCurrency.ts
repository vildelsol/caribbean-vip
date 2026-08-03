/**
 * Indicative local-currency figures, for DISPLAY ONLY.
 *
 * OD-09 is locked: display may be localized, settlement is USD. Every `*_minor` amount in this
 * system is USD, and these rates never take part in a calculation that leads to a charge — they
 * only produce the "≈ JAM $11,700" line the mockups show beside the USD total, which is genuinely
 * useful to a tourist deciding whether something is expensive.
 *
 * Deliberately app-side rather than a column on `islands`: a number in the database looks
 * authoritative and would eventually be wired into something that matters. It is also deliberately
 * not a live FX feed — a stale rate rendered without an approximation sign would be worse than no
 * rate at all, so the UI always prefixes these with "≈".
 *
 * Keyed by currency rather than by island, because that is what actually determines the figure.
 */
const APPROX_PER_USD: Record<string, number> = {
  JMD: 156,
  KYD: 0.83,
  BBD: 2,
};

/** Indicative local units per USD, or null when the island settles in USD anyway. */
export function approxLocalPerUsd(currency: string): number | null {
  return APPROX_PER_USD[currency] ?? null;
}
