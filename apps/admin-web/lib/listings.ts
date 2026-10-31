'use client';

import { DEMO_EXPERIENCES, DEMO_VENDORS } from '@cvip/demo';
import type { ListingStatus, VendorStatus } from '@cvip/types';
import { supabase, isSupabaseConfigured } from './supabase';
import { LISTING_AUDIT_ENTITY, listingDecision, listingLane, type ListingDecision } from './listingReview';

/**
 * Listing moderation data access.
 *
 * Live path: `experiences` directly. `experiences_vendor_update` already admits `is_admin()`, and
 * `guard_listing_review_fields` stamps `reviewed_by` / `reviewed_at` from auth.uid(), so the browser
 * does not send them. Each decision also writes an `audit_logs` row through `write_audit_log()`.
 *
 * Demo path: the seeded experiences, mutated in memory and reset on reload, like vendor review.
 */

export interface ReviewableListing {
  id: string;
  title: string;
  summary: string | null;
  category: string;
  status: ListingStatus;
  vendorName: string;
  vendorStatus: VendorStatus;
  fromAmountMinor: number;
  currency: string;
  reviewNotes: string | null;
}

const demoStatus = new Map<string, ListingStatus>();
const demoNotes = new Map<string, string | null>();

function demoListings(): ReviewableListing[] {
  const vendors = new Map(DEMO_VENDORS.map((v) => [v.id, v]));
  return DEMO_EXPERIENCES.map((e) => {
    const vendor = vendors.get(e.vendorId);
    return {
      id: e.id,
      title: e.title,
      summary: e.summary,
      category: e.category,
      status: demoStatus.get(e.id) ?? (e.status as ListingStatus),
      vendorName: vendor?.tradingName ?? 'Unknown vendor',
      vendorStatus: (vendor?.status ?? 'pending_review') as VendorStatus,
      fromAmountMinor: e.fromAmountMinor,
      currency: 'USD',
      reviewNotes: demoNotes.get(e.id) ?? null,
    };
  });
}

/** Submitted listings and live ones: the two a moderator can act on. */
export async function listReviewableListings(): Promise<ReviewableListing[]> {
  if (!isSupabaseConfigured) return demoListings().filter((l) => listingLane(l.status) !== null);

  const { data, error } = await supabase
    .from('experiences')
    .select('id, vendor_org_id, title, summary, category, status, from_amount_minor, currency, review_notes')
    .in('status', ['pending_review', 'approved'])
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  const rows = data ?? [];

  // Two reads rather than an embedded select: the hand-written `database.types.ts` declares no
  // relationships, so the embed does not type-check, and guessing at it would hide a real error.
  const orgIds = [...new Set(rows.map((r) => r.vendor_org_id))];
  const { data: orgs, error: orgError } =
    orgIds.length === 0
      ? { data: [], error: null }
      : await supabase.from('vendor_organizations').select('id, trading_name, status').in('id', orgIds);
  if (orgError) throw new Error(orgError.message);
  const orgById = new Map((orgs ?? []).map((o) => [o.id, o]));

  return rows.map((row) => {
    const org = orgById.get(row.vendor_org_id);
    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      category: row.category,
      status: row.status,
      vendorName: org?.trading_name ?? 'Unknown vendor',
      vendorStatus: org?.status ?? 'pending_review',
      fromAmountMinor: Number(row.from_amount_minor),
      currency: row.currency,
      reviewNotes: row.review_notes,
    };
  });
}

export async function decideListing(
  listing: ReviewableListing,
  decision: ListingDecision,
  reason: string,
): Promise<{ status: ListingStatus }> {
  const checked = listingDecision(listing.status, decision, reason);
  if (!checked.ok) throw new Error(checked.problem);

  if (!isSupabaseConfigured) {
    demoStatus.set(listing.id, checked.status);
    demoNotes.set(listing.id, checked.reason);
    return { status: checked.status };
  }

  const { error } = await supabase
    .from('experiences')
    .update({ status: checked.status, review_notes: checked.reason })
    .eq('id', listing.id);
  if (error) throw new Error(error.message);

  // Surfaced, not swallowed: an unrecorded moderation is worse than a visibly failed one.
  const { error: auditError } = await supabase.rpc('write_audit_log', {
    p_action: `listing.${decision}`,
    p_entity_type: LISTING_AUDIT_ENTITY,
    p_entity_id: listing.id,
    p_before: { status: listing.status },
    p_after: { status: checked.status },
    p_reason: checked.reason,
  });
  if (auditError) {
    throw new Error(`The listing is now ${checked.status}, but the audit entry failed to write: ${auditError.message}`);
  }

  return { status: checked.status };
}
