'use client';

import { DEMO_EXPERIENCES, DEMO_VENDORS } from '@cvip/demo';
import { supabase, isSupabaseConfigured } from './supabase';
import { needsAttention } from './vendorReview';
import { loadDossiers } from './vendorDossier';
import {
  countActivePromotions,
  summariseBookings,
  summariseFailedPayments,
  WINDOW_DAYS,
  type BookingRow,
  type PaymentRow,
  type PromotionRow,
} from './dashboardMetrics';

/**
 * Admin dashboard data — PRD §7.
 *
 * Live: counts and the last 30 days of bookings and payments, read under the admin policies the
 * tables already have. Demo: the seeded vendors and listings only. The demo has no bookings,
 * payments or promotions, and "no fake flows in demo" holds, so those figures are `null` there and
 * the page says so instead of showing invented numbers.
 */

export interface DashboardData {
  live: boolean;
  vendorsWaiting: number;
  vendorsNeedingAttention: number | null;
  vendorsApproved: number;
  listingsWaiting: number;
  listingsLive: number;
  promotionsWaiting: number | null;
  promotionsActive: number | null;
  bookings: ReturnType<typeof summariseBookings> | null;
  failedPayments: ReturnType<typeof summariseFailedPayments> | null;
  windowDays: number;
}

export async function loadDashboard(now = new Date()): Promise<DashboardData> {
  if (!isSupabaseConfigured) {
    return {
      live: false,
      vendorsWaiting: DEMO_VENDORS.filter((v) => (v.status as string) !== 'approved').length,
      vendorsNeedingAttention: null,
      vendorsApproved: DEMO_VENDORS.filter((v) => v.status === 'approved').length,
      listingsWaiting: DEMO_EXPERIENCES.filter((e) => (e.status as string) === 'pending_review').length,
      listingsLive: DEMO_EXPERIENCES.filter((e) => e.status === 'approved').length,
      promotionsWaiting: null,
      promotionsActive: null,
      bookings: null,
      failedPayments: null,
      windowDays: WINDOW_DAYS,
    };
  }

  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
  const [orgs, listings, promos, bookings, payments] = await Promise.all([
    supabase.from('vendor_organizations').select('id, status'),
    supabase.from('experiences').select('status'),
    supabase.from('promotions').select('approval_state, starts_at, ends_at'),
    supabase.from('bookings').select('status, currency, total_minor, created_at').gte('created_at', since),
    supabase.from('payments').select('status, currency, amount_minor, failure_message, created_at').gte('created_at', since),
  ]);
  for (const r of [orgs, listings, promos, bookings, payments]) if (r.error) throw new Error(r.error.message);

  const orgRows = orgs.data ?? [];
  const approvedIds = orgRows.filter((o) => o.status === 'approved').map((o) => o.id as string);
  const dossiers = await loadDossiers(approvedIds);
  let attention = 0;
  for (const d of dossiers.values()) if (needsAttention(d.readiness, d.documents)) attention++;

  const promoRows = (promos.data ?? []) as unknown as PromotionRow[];
  return {
    live: true,
    vendorsWaiting: orgRows.filter((o) => o.status === 'pending_review' || o.status === 'changes_requested').length,
    vendorsNeedingAttention: attention,
    vendorsApproved: approvedIds.length,
    listingsWaiting: (listings.data ?? []).filter((l) => l.status === 'pending_review').length,
    listingsLive: (listings.data ?? []).filter((l) => l.status === 'approved').length,
    promotionsWaiting: promoRows.filter((p) => p.approval_state === 'pending').length,
    promotionsActive: countActivePromotions(promoRows, now),
    bookings: summariseBookings((bookings.data ?? []) as unknown as BookingRow[], now),
    failedPayments: summariseFailedPayments((payments.data ?? []) as unknown as PaymentRow[], now),
    windowDays: WINDOW_DAYS,
  };
}
