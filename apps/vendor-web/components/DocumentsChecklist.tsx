'use client';

import { useState } from 'react';
import type { ApprovalReadiness, DocumentRequirement, RequirementStatus } from '@cvip/types';
import { DocumentInvalid, documentUrl, uploadDocument, type StoredDocument } from '../lib/documents';

type Tone = 'idle' | 'review' | 'ok' | 'warn' | 'bad';

const STATE: Record<RequirementStatus['state'], { label: string; tone: Tone }> = {
  missing: { label: 'Needed', tone: 'idle' },
  pending: { label: 'In review', tone: 'review' },
  accepted: { label: 'Accepted', tone: 'ok' },
  rejected: { label: 'Send a new copy', tone: 'bad' },
  expired: { label: 'Expired', tone: 'bad' },
};

const LEVEL_HEADING = {
  required: 'Required for approval',
  conditional: 'Depends on your business',
  recommended: 'Recommended',
} as const;

/** Drawn marks in one stroke weight, so status reads at a glance without relying on colour. */
function StateMark({ tone }: { tone: Tone }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  } as const;
  return (
    <span className={`docmark docmark--${tone}`}>
      {tone === 'ok' ? (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" />
          <path d="M8 12.5l2.7 2.7L16 9.8" stroke="var(--on-dark)" />
        </svg>
      ) : tone === 'review' ? (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      ) : tone === 'bad' || tone === 'warn' ? (
        <svg {...common}>
          <path d="M12 3.8l9 15.6H3z" />
          <path d="M12 10v4.2M12 17h.01" />
        </svg>
      ) : (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" strokeDasharray="2.6 3.2" />
        </svg>
      )}
    </span>
  );
}

/**
 * The checklist: how many required documents are accepted, then one row per requirement with its
 * status and the one action that moves it on. Presentational, so the page owns loading and this
 * can be rendered with fixture data.
 */
export function DocumentsChecklist({
  islandName,
  typeLabel,
  hasBusinessType,
  statuses,
  readiness,
  docs,
  orgId,
  onChanged,
}: {
  islandName: string | null;
  typeLabel: string | null;
  hasBusinessType: boolean;
  statuses: RequirementStatus[];
  readiness: ApprovalReadiness;
  docs: StoredDocument[];
  orgId: string;
  onChanged: () => Promise<void> | void;
}) {
  const required = statuses.filter((s) => s.requirement.level === 'required');
  const accepted = required.length - readiness.blocking.length;

  return (
    <>
      <section className="card docsum">
        <div className="card__head">
          <h2>{readiness.ready ? 'Everything required is accepted' : 'Approval checklist'}</h2>
          <p className="card__note">
            {islandName}
            {typeLabel ? ` · ${typeLabel}` : ''}
          </p>
        </div>
        <div className="docbar" role="img" aria-label={`${accepted} of ${required.length} required documents accepted`}>
          {required.map((s) => (
            <span
              key={s.requirement.key}
              className={`docbar__seg ${s.state === 'accepted' ? 'docbar__seg--ok' : s.state === 'pending' ? 'docbar__seg--review' : ''}`}
            />
          ))}
        </div>
        <p className="docsum__line">
          <strong>
            {accepted} of {required.length}
          </strong>{' '}
          required documents accepted
        </p>
        <p className="card__note">
          Your listings stay hidden from guests until every required document is accepted. PDF, JPG or PNG, up to
          10 MB each.
        </p>
        {!hasBusinessType ? (
          <p className="card__note">We do not have your business type, so activity licences are not listed yet.</p>
        ) : null}
      </section>

      {(['required', 'conditional', 'recommended'] as const).map((level) => {
        const group = statuses.filter((s) => s.requirement.level === level);
        if (group.length === 0) return null;
        return (
          <section key={level} className="card">
            <div className="card__head">
              <h2>{LEVEL_HEADING[level]}</h2>
            </div>
            <ul className="doclist">
              {group.map((s) => (
                <RequirementRow
                  key={s.requirement.key}
                  status={s}
                  orgId={orgId}
                  history={docs.filter((d) => d.kind === s.requirement.key)}
                  onChanged={onChanged}
                />
              ))}
            </ul>
          </section>
        );
      })}
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
  onChanged: () => Promise<void> | void;
}) {
  const { requirement: r, state } = status;
  // `loadDocuments` returns newest first, so the first is the one that counts.
  const current = history[0] ?? null;
  const [open, setOpen] = useState(false);
  const view = status.expiringSoon ? { label: 'Expires soon', tone: 'warn' as Tone } : STATE[state];
  const urgent = state === 'missing' || state === 'rejected' || state === 'expired' || status.expiringSoon;
  const action =
    state === 'missing'
      ? 'Upload'
      : state === 'rejected' || state === 'expired'
        ? 'Upload new copy'
        : state === 'accepted'
          ? 'Renew'
          : 'Replace';
  const formId = `docform-${r.key}`;

  const openDoc = async (path: string) => {
    try {
      window.open(await documentUrl(path), '_blank', 'noopener');
    } catch {
      /* The row stays; the vendor can try again. */
    }
  };

  return (
    <li className={`docrow docrow--${view.tone}`}>
      <StateMark tone={view.tone} />
      <div className="docrow__body">
        <h3 className="docrow__title">{r.label}</h3>
        <p className="docrow__help">{r.help}</p>
        {r.confirmWithCounsel ? (
          <p className="docrow__help">We are confirming this requirement for your island. Upload it now if you have it.</p>
        ) : null}
        {current ? (
          <p className="docrow__meta">
            {current.documentNumber ? <span>No. {current.documentNumber}</span> : null}
            {current.expiresOn ? <span>Expires {current.expiresOn}</span> : null}
            <button type="button" className="auth-link" onClick={() => void openDoc(current.storagePath)}>
              View {current.fileName ? `“${current.fileName}”` : 'file'}
            </button>
          </p>
        ) : null}
        {state === 'rejected' && current?.reviewNotes ? (
          <p className="docrow__note">Reviewer note: {current.reviewNotes}</p>
        ) : null}
        {history.length > 1 ? (
          <p className="docrow__help">{history.length} uploads on file; the newest is the one that counts.</p>
        ) : null}
      </div>
      <div className="docrow__side">
        <span className={`docstate docstate--${view.tone}`}>{view.label}</span>
        <button
          type="button"
          className={`btn btn--sm ${urgent ? 'btn--primary' : 'btn--secondary'}`}
          aria-expanded={open}
          aria-controls={formId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Cancel' : action}
        </button>
      </div>
      {open ? (
        <div className="docrow__form" id={formId}>
          <UploadForm
            requirement={r}
            orgId={orgId}
            onDone={async () => {
              setOpen(false);
              await onChanged();
            }}
          />
        </div>
      ) : null}
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
        err instanceof DocumentInvalid
          ? err.message
          : `Could not upload. ${err instanceof Error ? err.message : 'Please try again.'}`,
      );
      setBusy(false);
    }
  };

  return (
    <form className="docform" onSubmit={submit}>
      <label className="docfile">
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
        <span className="docfile__cta">{file ? 'Change file' : 'Choose a file'}</span>
        <span className="docfile__name">{file ? file.name : 'PDF, JPG or PNG, up to 10 MB'}</span>
      </label>
      {requirement.hasNumber || requirement.hasExpiry ? (
        <div className="docform__pair">
          {requirement.hasNumber ? (
            <label className="field">
              <span className="field__label">Number on the document</span>
              <input
                type="text"
                className="input"
                value={number}
                maxLength={80}
                onChange={(e) => setNumber(e.target.value)}
                required
              />
            </label>
          ) : null}
          {requirement.hasExpiry ? (
            <label className="field">
              <span className="field__label">Expiry date</span>
              <input type="date" className="input" value={expires} onChange={(e) => setExpires(e.target.value)} required />
            </label>
          ) : null}
        </div>
      ) : null}
      <button type="submit" className="btn btn--primary" disabled={busy}>
        {busy ? 'Uploading…' : 'Upload document'}
      </button>
      {message ? (
        <p className="field-error" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
