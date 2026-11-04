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

/** One flag from `redemption_anomalies()`, open or reviewed. */
export interface AnomalyRow {
  pattern: string;
  scanner_user_id?: string | null;
  voucher_id?: string | null;
  vendor_org_id?: string | null;
  scan_count?: number;
  first_at?: string;
  last_at?: string;
  /** Null while open, including after a newer scan reopens a reviewed flag. */
  reviewed_at?: string | null;
}

export interface AnomalySummary {
  /** Flags nobody has reviewed. The number the tile leads with. */
  count: number;
  /** Reviewed flags still inside the 7-day window. Listed, never hidden. */
  reviewed: number;
  byPattern: Record<string, number>;
}

/** The tile's numbers. Pure, so a row with an unexpected shape cannot quietly read as zero flags. */
export function summariseAnomalies(rows: readonly AnomalyRow[]): AnomalySummary {
  const byPattern: Record<string, number> = {};
  let open = 0;
  for (const r of rows) {
    if (r.reviewed_at == null) {
      open++;
      byPattern[r.pattern] = (byPattern[r.pattern] ?? 0) + 1;
    }
  }
  return { count: open, reviewed: rows.length - open, byPattern };
}
