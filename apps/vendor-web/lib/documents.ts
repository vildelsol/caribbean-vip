'use client';

import {
  DocumentInvalid,
  parseDocumentUpload,
  safeFileName,
  type DocumentRecord,
  type DocumentRequirement,
  type ReviewState,
  type VendorBusinessType,
} from '@cvip/types';
import { supabase } from './supabase';

/**
 * Vendor evidence: licences, insurance, identity. Live only.
 *
 * Storage path is `<vendor_org_id>/<requirement key>/<time>-<file name>`: the bucket policy reads
 * the first folder as the organisation, so that folder is not negotiable. A renewal is a new
 * object and a new row, never an overwrite; the newest row per requirement is current and the
 * older ones are the audit trail (see 20261029000003_vendor_document_requirements.sql).
 *
 * The database refuses a vendor-set review state, so this file never sends one.
 */

export interface StoredDocument extends DocumentRecord {
  id: string;
  storagePath: string;
  fileName: string | null;
  documentNumber: string | null;
  reviewNotes: string | null;
}

const BUCKET = 'vendor-documents';

type Row = {
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

export async function loadDocuments(orgId: string): Promise<StoredDocument[]> {
  const { data, error } = await supabase
    .from('vendor_documents')
    .select(
      'id, kind, review_state, review_notes, expires_on, document_number, storage_path, original_filename, created_at',
    )
    .eq('vendor_org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    reviewState: r.review_state,
    reviewNotes: r.review_notes,
    expiresOn: r.expires_on,
    documentNumber: r.document_number,
    storagePath: r.storage_path,
    fileName: r.original_filename,
    createdAt: r.created_at,
  }));
}

export async function loadBusinessType(orgId: string): Promise<VendorBusinessType | null> {
  const { data, error } = await supabase
    .from('vendor_organizations')
    .select('business_type')
    .eq('id', orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return ((data as { business_type: VendorBusinessType | null } | null)?.business_type) ?? null;
}

export async function uploadDocument(input: {
  orgId: string;
  requirement: DocumentRequirement;
  file: File;
  documentNumber: string;
  expiresOn: string;
}): Promise<void> {
  const parsed = parseDocumentUpload({
    requirement: input.requirement,
    file: { name: input.file.name, size: input.file.size, type: input.file.type },
    documentNumber: input.documentNumber,
    expiresOn: input.expiresOn,
    now: new Date(),
  });

  const path = `${input.orgId}/${input.requirement.key}/${Date.now()}-${safeFileName(input.file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, input.file, { contentType: input.file.type, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { error: rowError } = await supabase.from('vendor_documents').insert({
    vendor_org_id: input.orgId,
    kind: input.requirement.key,
    storage_path: path,
    original_filename: input.file.name.slice(0, 200),
    document_number: parsed.documentNumber,
    expires_on: parsed.expiresOn,
  });
  if (rowError) {
    // A file with no row is invisible to everyone and cannot be reviewed; do not leave it behind.
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(rowError.message);
  }
}

/** A short-lived link to view a stored document. The bucket is private. */
export async function documentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 300);
  if (error || !data) throw new Error(error?.message ?? 'Could not open that document.');
  return data.signedUrl;
}

export { DocumentInvalid };
