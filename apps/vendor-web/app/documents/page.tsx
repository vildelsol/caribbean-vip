'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  VENDOR_BUSINESS_TYPES,
  approvalReadiness,
  documentRequirementsFor,
  requirementStatuses,
  type VendorBusinessType,
} from '@cvip/types';
import { Crest } from '../../components/Crest';
import { DocumentsChecklist } from '../../components/DocumentsChecklist';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useActiveMembership } from '../../lib/session';
import { useIsland } from '../../lib/useIsland';
import { loadBusinessType, loadDocuments, type StoredDocument } from '../../lib/documents';

/**
 * Documents: the licences, insurance and identity an island and activity require.
 *
 * What is asked is `documentRequirementsFor(island, businessType)` in `@cvip/types`, the same list
 * the admin console checks before approving. A vendor uploads against a requirement; an admin
 * accepts or rejects each upload. Live only: the demo has no storage to put files in, and a
 * screen that appeared to accept them would be a fake flow.
 */
export default function Documents() {
  if (!isSupabaseConfigured) {
    return (
      <>
        <Header />
        <main className="page">
          <section className="card">
            <p className="card__note">Documents are collected in live accounts. The demo has nowhere to store them.</p>
          </section>
        </main>
      </>
    );
  }
  return <LiveDocuments />;
}

function Header() {
  return (
    <header className="masthead">
      <div className="masthead__inner">
        <Crest />
        <div>
          <p className="masthead__sub">Vendor Portal</p>
          <h1 className="masthead__title">Documents</h1>
        </div>
      </div>
    </header>
  );
}

function LiveDocuments() {
  const orgId = useActiveMembership()?.vendor_org_id ?? null;
  const island = useIsland();
  const [businessType, setBusinessType] = useState<VendorBusinessType | null | undefined>(undefined);
  const [docs, setDocs] = useState<StoredDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    try {
      const [type, rows] = await Promise.all([loadBusinessType(orgId), loadDocuments(orgId)]);
      setBusinessType(type);
      setDocs(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your documents.');
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const statuses = useMemo(() => {
    if (!island.code || docs === null || businessType === undefined) return null;
    return requirementStatuses(documentRequirementsFor(island.code, businessType), docs, new Date());
  }, [island.code, docs, businessType]);

  const typeLabel = VENDOR_BUSINESS_TYPES.find((t) => t.id === businessType)?.label ?? null;

  return (
    <>
      <Header />
      <main className="page">
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}

        {!statuses && !error ? <p className="card__note">Loading your checklist…</p> : null}

        {statuses && docs && orgId ? (
          <DocumentsChecklist
            islandName={island.name}
            typeLabel={typeLabel}
            hasBusinessType={businessType !== null}
            statuses={statuses}
            readiness={approvalReadiness(statuses)}
            docs={docs}
            orgId={orgId}
            onChanged={refresh}
          />
        ) : null}
      </main>
    </>
  );
}
