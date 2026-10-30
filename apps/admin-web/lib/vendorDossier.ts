'use client';

import {
  approvalReadiness,
  documentRequirementsFor,
  requirementStatuses,
  type ApprovalReadiness,
  type DocumentRecord,
  type IslandCode,
  type RequirementStatus,
  type ReviewState,
  type VendorBusinessType,
} from '@cvip/types';
import { supabase } from './supabase';

/**
 * What an admin needs to decide on a vendor's evidence: the island and business type that fix the
 * checklist, every document uploaded, and the resulting readiness. Live only; the demo has no
 * documents.
 *
 * Reviewing is an UPDATE of `review_state` and `review_notes` under `vendor_documents_admin_all`.
 * `reviewed_by` and `reviewed_at` are not sent: `guard_vendor_document_review_fields` stamps them
 * from auth.uid(), so a client cannot name another reviewer.
 */

export interface DossierDocument extends DocumentRecord {
  id: string;
  storagePath: string;
  fileName: string | null;
  documentNumber: string | null;
  reviewNotes: string | null;
}

export interface Dossier {
  islandCode: IslandCode | null;
  islandName: string | null;
  businessType: VendorBusinessType | null;
  documents: DossierDocument[];
  statuses: RequirementStatus[];
  readiness: ApprovalReadiness;
}

type DocRow = {
  id: string;
  kind: string;
  review_state: ReviewState;
  review_notes: string | null;
  expires_on: string | null;
  document_number: string | null;
  storage_path: string;
  original_filename: string | null;
  created_at: string;
};

export async function loadDossier(vendorId: string): Promise<Dossier> {
  const map = await loadDossiers([vendorId]);
  return map.get(vendorId) ?? emptyDossier();
}

function emptyDossier(): Dossier {
  return {
    islandCode: null,
    islandName: null,
    businessType: null,
    documents: [],
    statuses: [],
    readiness: { ready: false, blocking: [], toConfirm: [] },
  };
}

/**
 * Dossiers for several vendors in two queries, not two per vendor. Used to find approved vendors
 * that need attention without opening each card.
 */
export async function loadDossiers(vendorIds: readonly string[]): Promise<Map<string, Dossier>> {
  const out = new Map<string, Dossier>();
  if (vendorIds.length === 0) return out;

  const [orgs, docs] = await Promise.all([
    supabase.from('vendor_organizations').select('id, business_type, islands(code, name)').in('id', vendorIds),
    supabase
      .from('vendor_documents')
      .select(
        'id, vendor_org_id, kind, review_state, review_notes, expires_on, document_number, storage_path, original_filename, created_at',
      )
      .in('vendor_org_id', vendorIds)
      .order('created_at', { ascending: false }),
  ]);
  if (orgs.error) throw new Error(orgs.error.message);
  if (docs.error) throw new Error(docs.error.message);

  const byVendor = new Map<string, DossierDocument[]>();
  for (const r of (docs.data ?? []) as unknown as (DocRow & { vendor_org_id: string })[]) {
    const list = byVendor.get(r.vendor_org_id) ?? [];
    list.push({
      id: r.id,
      kind: r.kind,
      reviewState: r.review_state,
      reviewNotes: r.review_notes,
      expiresOn: r.expires_on,
      documentNumber: r.document_number,
      storagePath: r.storage_path,
      fileName: r.original_filename,
      createdAt: r.created_at,
    });
    byVendor.set(r.vendor_org_id, list);
  }

  const now = new Date();
  for (const row of (orgs.data ?? []) as unknown as {
    id: string;
    business_type: VendorBusinessType | null;
    islands: { code: string; name: string } | null;
  }[]) {
    const code = row.islands?.code;
    const islandCode: IslandCode | null = code === 'JM' || code === 'BB' || code === 'KY' ? code : null;
    const documents = byVendor.get(row.id) ?? [];
    // Without an island there is no checklist to hold the vendor to; say so rather than pass them.
    const requirements = islandCode ? documentRequirementsFor(islandCode, row.business_type) : [];
    const statuses = requirementStatuses(requirements, documents, now);
    out.set(row.id, {
      islandCode,
      islandName: row.islands?.name ?? null,
      businessType: row.business_type,
      documents,
      statuses,
      readiness: islandCode ? approvalReadiness(statuses) : { ready: false, blocking: [], toConfirm: [] },
    });
  }
  return out;
}

export async function reviewDocument(
  doc: DossierDocument,
  decision: 'accepted' | 'rejected',
  notes: string,
): Promise<void> {
  const trimmed = notes.trim();
  if (decision === 'rejected' && trimmed.length === 0) {
    throw new Error('Say why the document is rejected, so the vendor knows what to send instead.');
  }

  const { error } = await supabase
    .from('vendor_documents')
    .update({ review_state: decision, review_notes: trimmed.length > 0 ? trimmed : null })
    .eq('id', doc.id);
  if (error) throw new Error(error.message);

  const { error: auditError } = await supabase.rpc('write_audit_log', {
    p_action: `vendor_document.${decision === 'accepted' ? 'accept' : 'reject'}`,
    p_entity_type: 'vendor_document',
    p_entity_id: doc.id,
    p_before: { review_state: doc.reviewState },
    p_after: { review_state: decision, kind: doc.kind },
    p_reason: trimmed.length > 0 ? trimmed : 'accepted',
  });
  if (auditError) {
    throw new Error(`The document is now ${decision}, but the audit entry failed to write: ${auditError.message}`);
  }
}

export async function openDocument(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('vendor-documents').createSignedUrl(storagePath, 300);
  if (error || !data) throw new Error(error?.message ?? 'Could not open that document.');
  return data.signedUrl;
}
