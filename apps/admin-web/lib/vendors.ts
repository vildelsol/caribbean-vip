'use client';

import { DEMO_VENDORS } from '@cvip/demo';
import type { VendorStatus } from '@cvip/types';
import { supabase, isSupabaseConfigured } from './supabase';
import {
  REVIEW_QUEUE_STATUSES,
  VENDOR_AUDIT_ENTITY,
  documentsGate,
  reviewDecision,
  type ReviewDecision,
} from './vendorReview';
import { loadDossier } from './vendorDossier';

/**
 * Vendor review data access.
 *
 * Live path: `vendor_organizations` directly. No migration or RPC is needed — `vendor_orgs_admin_all`
 * already grants an admin `for all using (is_admin()) with check (is_admin())`, so the status
 * column is writable by exactly the people who should write it, and by nobody else. The client
 * check in AuthGate is a convenience; this policy is the boundary.
 *
 * Each decision also writes an `audit_logs` row through `write_audit_log()`. That function takes
 * its actor from `auth.uid()` rather than a parameter, so the record cannot name someone else.
 * PRD §7 requires privileged actions to be auditable, and approving a vendor into the marketplace
 * is the most consequential one the console has.
 *
 * Demo path: the seeded vendors from `@cvip/demo`, mutated in memory. The demo is shown to
 * investors, so the review queue has to be walkable there too; it resets on reload, like every
 * other demo surface.
 */

export interface ReviewableVendor {
  id: string;
  tradingName: string;
  status: VendorStatus;
  description: string | null;
  reviewNotes: string | null;
}

/** Demo-only status overrides, so a decision made in the demo survives navigation. */
const demoStatus = new Map<string, VendorStatus>();
const demoNotes = new Map<string, string | null>();

function demoVendors(): ReviewableVendor[] {
  return DEMO_VENDORS.map((v) => ({
    id: v.id,
    tradingName: v.tradingName,
    status: demoStatus.get(v.id) ?? (v.status as VendorStatus),
    description: v.description,
    reviewNotes: demoNotes.get(v.id) ?? null,
  }));
}

/**
 * The review queue, plus the approved vendors a suspension could act on.
 *
 * Deliberately not filtered to `REVIEW_QUEUE_STATUSES` alone: suspension applies to an approved
 * vendor, so a console that only showed the intake queue could never perform one of the four
 * actions PRD §7 lists.
 */
export async function listReviewableVendors(): Promise<ReviewableVendor[]> {
  const interesting: VendorStatus[] = [...REVIEW_QUEUE_STATUSES, 'approved'];

  if (!isSupabaseConfigured) {
    return demoVendors()
      .filter((v) => interesting.includes(v.status))
      .sort((a, b) => interesting.indexOf(a.status) - interesting.indexOf(b.status));
  }

  const { data, error } = await supabase
    .from('vendor_organizations')
    .select('id, trading_name, status, description, review_notes')
    .in('status', interesting)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    tradingName: row.trading_name as string,
    status: row.status as VendorStatus,
    description: (row.description as string | null) ?? null,
    reviewNotes: (row.review_notes as string | null) ?? null,
  }));
}

export interface DecisionResult {
  status: VendorStatus;
}

/**
 * Applies a decision, or throws with the reason it was refused.
 *
 * The validation is the same `reviewDecision()` the page uses to enable its controls, so a
 * refusal here means the UI and this path disagreed — not that the rules are stated twice.
 */
export async function decideVendor(
  vendor: ReviewableVendor,
  decision: ReviewDecision,
  reason: string,
  /** Approve despite missing documents. Needs a reason and is written to the audit log. */
  waiveDocuments = false,
): Promise<DecisionResult> {
  const checked = reviewDecision(vendor.status, decision, reason);
  if (!checked.ok) throw new Error(checked.problem);

  // The documents are re-read here, not trusted from the page: what the card showed may be stale,
  // and an approval is the one decision that makes a vendor public. Demo has no documents.
  let waivedMissing: string[] = [];
  if (isSupabaseConfigured && decision === 'approve') {
    const dossier = await loadDossier(vendor.id);
    const gate = documentsGate(decision, dossier.readiness, waiveDocuments, reason);
    if (!gate.ok) throw new Error(gate.problem);
    if (gate.waived) waivedMissing = dossier.readiness.blocking.map((b) => b.requirement.key);
  }

  if (!isSupabaseConfigured) {
    demoStatus.set(vendor.id, checked.status);
    demoNotes.set(vendor.id, checked.reason);
    return { status: checked.status };
  }

  const { error } = await supabase
    .from('vendor_organizations')
    // `reviewed_by` and `reviewed_at` are stamped by the `vendor_organizations_review_stamp`
    // trigger from auth.uid(), so they are deliberately not sent from the browser: a client that
    // names its own reviewer is a client that can name someone else.
    .update({
      status: checked.status,
      review_notes: checked.reason,
    })
    .eq('id', vendor.id);

  if (error) throw new Error(error.message);

  // The audit row is written after the change lands, and a failure to write it is surfaced rather
  // than swallowed: an unrecorded approval is worse than a visibly failed one.
  const { error: auditError } = await supabase.rpc('write_audit_log', {
    p_action: `vendor.${decision}`,
    p_entity_type: VENDOR_AUDIT_ENTITY,
    p_entity_id: vendor.id,
    p_before: { status: vendor.status },
    p_after:
      waivedMissing.length > 0
        ? { status: checked.status, documentsWaived: waivedMissing }
        : { status: checked.status },
    p_reason: checked.reason,
  });

  if (auditError) {
    throw new Error(
      `The vendor is now ${checked.status}, but the audit entry failed to write: ${auditError.message}`,
    );
  }

  return { status: checked.status };
}
