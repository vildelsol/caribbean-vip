'use client';

import type { ApprovalState, VendorStatus } from '@cvip/types';
import { supabase, isSupabaseConfigured } from './supabase';
import { buildPromotion, type PromotionDraft } from './promotionDraft';
import {
  PROMOTION_AUDIT_ENTITY,
  promotionDecision,
  promotionLane,
  type PromotionDecision,
} from './promotionReview';

/**
 * Promotion oversight data access.
 *
 * Live path: `promotions` directly. `promotions_vendor_all` admits `is_admin()`, and
 * `guard_promotion_review_fields` stamps `reviewed_by` / `reviewed_at` from auth.uid(), so the
 * browser does not send them. The database writes one audit row for the state change; the console
 * adds its own through `write_audit_log()` to carry the reason.
 *
 * Demo path: the demo has no promotions, so nothing is listed. "No fake flows in demo."
 */

export interface ReviewablePromotion {
  id: string;
  title: string;
  description: string | null;
  terms: string;
  approvalState: ApprovalState;
  valueKind: 'percentage' | 'fixed' | 'in_kind';
  valueRate: number | null;
  valueAmountMinor: number | null;
  currency: string | null;
  startsAt: string;
  endsAt: string;
  inventoryLimit: number | null;
  issuedCount: number;
  requiresBooking: boolean;
  vendorName: string;
  vendorStatus: VendorStatus;
}

/** Waiting, live and disabled promotions: the ones an admin can act on. */
export async function listReviewablePromotions(): Promise<ReviewablePromotion[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('promotions')
    .select(
      'id, vendor_org_id, title, description, terms, approval_state, value_kind, value_rate, value_amount_minor, currency, starts_at, ends_at, inventory_limit, issued_count, requires_booking',
    )
    .in('approval_state', ['pending', 'approved', 'disabled'])
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  // Two reads rather than an embedded select: `database.types.ts` declares no relationships.
  const orgIds = [...new Set(rows.map((r) => r.vendor_org_id as string))];
  const { data: orgs, error: orgError } =
    orgIds.length === 0
      ? { data: [], error: null }
      : await supabase.from('vendor_organizations').select('id, trading_name, status').in('id', orgIds);
  if (orgError) throw new Error(orgError.message);
  const orgById = new Map((orgs ?? []).map((o) => [o.id, o]));

  return rows
    .map((r) => {
      const org = orgById.get(r.vendor_org_id as string);
      return {
        id: r.id as string,
        title: r.title as string,
        description: (r.description as string | null) ?? null,
        terms: r.terms as string,
        approvalState: r.approval_state as ApprovalState,
        valueKind: r.value_kind as ReviewablePromotion['valueKind'],
        valueRate: r.value_rate === null ? null : Number(r.value_rate),
        valueAmountMinor: r.value_amount_minor === null ? null : Number(r.value_amount_minor),
        currency: (r.currency as string | null) ?? null,
        startsAt: r.starts_at as string,
        endsAt: r.ends_at as string,
        inventoryLimit: r.inventory_limit === null ? null : Number(r.inventory_limit),
        issuedCount: Number(r.issued_count),
        requiresBooking: Boolean(r.requires_booking),
        vendorName: org?.trading_name ?? 'Unknown vendor',
        vendorStatus: org?.status ?? 'pending_review',
      } satisfies ReviewablePromotion;
    })
    .filter((p) => promotionLane(p.approvalState) !== null);
}

export async function decidePromotion(
  promotion: ReviewablePromotion,
  decision: PromotionDecision,
  reason: string,
): Promise<{ state: ApprovalState }> {
  const checked = promotionDecision(promotion.approvalState, decision, reason);
  if (!checked.ok) throw new Error(checked.problem);
  if (!isSupabaseConfigured) throw new Error('There are no promotions in demo mode.');

  const { error } = await supabase
    .from('promotions')
    .update({ approval_state: checked.state })
    .eq('id', promotion.id);
  if (error) throw new Error(error.message);

  // Surfaced, not swallowed: an unrecorded decision is worse than a visibly failed one.
  const { error: auditError } = await supabase.rpc('write_audit_log', {
    p_action: `promotion.${decision}`,
    p_entity_type: PROMOTION_AUDIT_ENTITY,
    p_entity_id: promotion.id,
    p_before: { approval_state: promotion.approvalState },
    p_after: { approval_state: checked.state },
    p_reason: checked.reason,
  });
  if (auditError) {
    throw new Error(`The promotion is now ${checked.state}, but the audit entry failed to write: ${auditError.message}`);
  }

  return { state: checked.state };
}

export interface VendorChoice {
  id: string;
  name: string;
  islandId: string;
}

/** Approved vendors only: an offer from a vendor tourists cannot see would never be shown. */
export async function listVendorChoices(): Promise<VendorChoice[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('vendor_organizations')
    .select('id, trading_name, island_id')
    .eq('status', 'approved')
    .order('trading_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((v) => ({ id: v.id, name: v.trading_name, islandId: v.island_id }));
}

/**
 * Create a promotion and its geofence for a vendor. It starts `pending`, like a vendor's would:
 * creating is not approving, so the offer still goes through the oversight queue and its audit row.
 *
 * Two inserts, not one transaction: if the geofence fails, the promotion is removed again, because
 * an offer with no fence would sit in the queue looking real and never fire.
 */
export async function createPromotion(draft: PromotionDraft, vendors: VendorChoice[]): Promise<{ id: string }> {
  if (!isSupabaseConfigured) throw new Error('There are no promotions in demo mode.');

  const vendor = vendors.find((v) => v.id === draft.vendorId) ?? null;
  const built = buildPromotion(draft, vendor?.islandId ?? null, new Date());
  if (!built.ok) throw new Error(built.problems.join(' '));

  const { data, error } = await supabase.from('promotions').insert({ ...built.promotion }).select('id').single();
  if (error) throw new Error(error.message);
  const id = (data as unknown as { id: string }).id;

  const { error: fenceError } = await supabase.from('geofences').insert({ promotion_id: id, ...built.geofence });
  if (fenceError) {
    const { error: undoError } = await supabase.from('promotions').delete().eq('id', id);
    throw new Error(
      undoError
        ? `The geofence failed (${fenceError.message}) and the promotion ${id} could not be removed: ${undoError.message}`
        : `The geofence failed, so the promotion was not created: ${fenceError.message}`,
    );
  }

  const { error: auditError } = await supabase.rpc('write_audit_log', {
    p_action: 'promotion.create',
    p_entity_type: PROMOTION_AUDIT_ENTITY,
    p_entity_id: id,
    p_before: null,
    p_after: { approval_state: 'pending', vendor_org_id: draft.vendorId, is_demo: built.promotion.is_demo },
    p_reason: null,
  });
  if (auditError) {
    throw new Error(`The promotion was created (${id}), but the audit entry failed to write: ${auditError.message}`);
  }

  return { id };
}
