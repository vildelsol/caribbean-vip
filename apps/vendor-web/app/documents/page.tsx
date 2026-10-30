'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  VENDOR_BUSINESS_TYPES,
  approvalReadiness,
  documentRequirementsFor,
  requirementStatuses,
  type DocumentRequirement,
  type RequirementStatus,
  type VendorBusinessType,
} from '@cvip/types';
import { Crest } from '../../components/Crest';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useActiveMembership } from '../../lib/session';
import { useIsland } from '../../lib/useIsland';
import {
  DocumentInvalid,
  documentUrl,
  loadBusinessType,
  loadDocuments,
  uploadDocument,
  type StoredDocument,
} from '../../lib/documents';

const STATE_LABEL: Record<RequirementStatus['state'], { label: string; pill: string }> = {
  missing: { label: 'Needed', pill: 'pill--draft' },
  pending: { label: 'In review', pill: 'pill--review' },
  accepted: { label: 'Accepted', pill: 'pill--live' },
  rejected: { label: 'Needs a new copy', pill: 'pill--attention' },
  expired: { label: 'Expired', pill: 'pill--attention' },
};

const LEVEL_HEADING = {
  required: 'Required for approval',
  conditional: 'Depends on your business',
  recommended: 'Recommended',
} as const;

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

  const readiness = statuses ? approvalReadiness(statuses) : null;
  const requiredCount = statuses?.filter((s) => s.requirement.level === 'required').length ?? 0;
  const typeLabel = VENDOR_BUSINESS_TYPES.find((t) => t.id === businessType)?.label;

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

        {statuses && readiness ? (
          <>
            <section className="card">
              <div className="card__head">
                <h2>{readiness.ready ? 'Everything required is accepted' : 'Your approval checklist'}</h2>
                <p className="card__note">
                  {island.name}
                  {typeLabel ? ` · ${typeLabel}` : ''} · {requiredCount - readiness.blocking.length} of {requiredCount} required
                  documents accepted.
                </p>
                {businessType === null ? (
                  <p className="card__note">
                    We do not have your business type, so activity licences are not listed yet.
                  </p>
                ) : null}
                <p className="card__note">
                  Your listings stay hidden from guests until every required document is accepted.
                  PDF, JPG or PNG, up to 10 MB each.
                </p>
              </div>
            </section>

            {(['required', 'conditional', 'recommended'] as const).map((level) => {
              const group = statuses.filter((s) => s.requirement.level === level);
              if (group.length === 0) return null;
              return (
                <section key={level} className="card">
                  <div className="card__head">
                    <h2>{LEVEL_HEADING[level]}</h2>
                  </div>
                  <ul className="listing-list">
                    {group.map((s) => (
                      <RequirementRow
                        key={s.requirement.key}
                        status={s}
                        orgId={orgId!}
                        history={docs!.filter((d) => d.kind === s.requirement.key)}
                        onChanged={refresh}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </>
        ) : null}
      </main>
    </>
  );
}

function RequirementRow({
  status,
  orgId,
  history,
  onChanged,
}: {
  status: RequirementStatus;
  orgId: string;
  history: StoredDocument[];
  onChanged: () => Promise<void>;
}) {
  const { requirement: r, state } = status;
  // `loadDocuments` returns newest first, so the first is the one that counts.
  const current = history[0] ?? null;
  const [open, setOpen] = useState(false);
  const view = STATE_LABEL[state];
  const canUpload = state === 'missing' || state === 'rejected' || state === 'expired' || open;

  const openDoc = async (path: string) => {
    try {
      window.open(await documentUrl(path), '_blank', 'noopener');
    } catch {
      /* The row stays; the vendor can try again. */
    }
  };

  return (
    <li className="listing">
      <div className="listing__main">
        <div className="listing__head">
          <span className={`pill ${view.pill}`}>{status.expiringSoon ? 'Expires soon' : view.label}</span>
          <h3 className="listing__title">{r.label}</h3>
        </div>
        <p className="listing__summary">{r.help}</p>
        {r.confirmWithCounsel ? (
          <p className="listing__meta">We are confirming this requirement for your island. Upload it now if you have it.</p>
        ) : null}
        {current ? (
          <p className="listing__meta">
            {current.documentNumber ? `No. ${current.documentNumber} · ` : ''}
            {current.expiresOn ? `Expires ${current.expiresOn} · ` : ''}
            {current.fileName ?? 'Uploaded file'} ·{' '}
            <button type="button" className="auth-link" onClick={() => void openDoc(current.storagePath)}>
              View
            </button>
          </p>
        ) : null}
        {state === 'rejected' && current?.reviewNotes ? (
          <p className="field-error">Reviewer note: {current.reviewNotes}</p>
        ) : null}
        {history.length > 1 ? (
          <p className="listing__meta">{history.length} uploads on file; the newest is the one that counts.</p>
        ) : null}

        {canUpload ? (
          <UploadForm requirement={r} orgId={orgId} onDone={async () => { setOpen(false); await onChanged(); }} />
        ) : (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(true)}>
            {state === 'accepted' ? 'Upload a renewal' : 'Replace'}
          </button>
        )}
      </div>
    </li>
  );
}

function UploadForm({
  requirement,
  orgId,
  onDone,
}: {
  requirement: DocumentRequirement;
  orgId: string;
  onDone: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [number, setNumber] = useState('');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setMessage('Choose a file.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await uploadDocument({ orgId, requirement, file, documentNumber: number, expiresOn: expires });
      await onDone();
    } catch (err) {
      setMessage(
        err instanceof DocumentInvalid ? err.message : `Could not upload. ${err instanceof Error ? err.message : 'Please try again.'}`,
      );
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--s-sm)', marginTop: 'var(--s-sm)' }}>
      <label className="field">
        <span className="field__label">File</span>
        <input
          type="file"
          className="input"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
      </label>
      {requirement.hasNumber ? (
        <label className="field">
          <span className="field__label">Number on the document</span>
          <input type="text" className="input" value={number} maxLength={80} onChange={(e) => setNumber(e.target.value)} required />
        </label>
      ) : null}
      {requirement.hasExpiry ? (
        <label className="field">
          <span className="field__label">Expiry date</span>
          <input type="date" className="input" value={expires} onChange={(e) => setExpires(e.target.value)} required />
        </label>
      ) : null}
      <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
        {busy ? 'Uploading…' : 'Upload'}
      </button>
      {message ? (
        <p className="field-error" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
