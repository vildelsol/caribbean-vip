/**
 * Dashboard figures — pure, so the arithmetic is tested and the page only displays.
 *
 * Money is never summed across currencies: JMD, BBD, KYD and USD amounts added together would be
 * a number that means nothing. Each currency gets its own total.
 */

export interface BookingRow {
  status: string;
  currency: string;
  total_minor: number | string;
  created_at: string;
}

export interface PaymentRow {
  status: string;
  currency: string;
  amount_minor: number | string;
  failure_message: string | null;
  created_at: string;
}

export interface PromotionRow {
  approval_state: string;
  starts_at: string;
  ends_at: string;
}

/** Bookings whose money the platform has actually taken and not returned. */
const REVENUE_STATUSES: readonly string[] = ['confirmed', 'completed'];

export const WINDOW_DAYS = 30;

export function inWindow(iso: string, now: Date, days = WINDOW_DAYS): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t <= now.getTime() && t > now.getTime() - days * 86_400_000;
}

export function summariseBookings(rows: readonly BookingRow[], now: Date) {
  const recent = rows.filter((r) => inWindow(r.created_at, now));
  const byStatus: Record<string, number> = {};
  const grossByCurrency: Record<string, number> = {};
  for (const r of recent) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (REVENUE_STATUSES.includes(r.status)) {
      grossByCurrency[r.currency] = (grossByCurrency[r.currency] ?? 0) + Number(r.total_minor);
    }
  }
  return { count: recent.length, byStatus, grossByCurrency };
}

export function summariseFailedPayments(rows: readonly PaymentRow[], now: Date) {
  const failed = rows.filter((p) => p.status === 'failed' && inWindow(p.created_at, now));
  const reasons: Record<string, number> = {};
  for (const p of failed) {
    const key = p.failure_message?.trim() || 'No reason given';
    reasons[key] = (reasons[key] ?? 0) + 1;
  }
  return { count: failed.length, reasons };
}

/** Approved and inside its dates. An approved offer that has ended or not yet begun is not active. */
export function countActivePromotions(rows: readonly PromotionRow[], now: Date): number {
  const t = now.getTime();
  return rows.filter(
    (p) => p.approval_state === 'approved' && Date.parse(p.starts_at) <= t && t < Date.parse(p.ends_at),
  ).length;
}
