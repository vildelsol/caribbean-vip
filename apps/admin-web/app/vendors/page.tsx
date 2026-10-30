'use client';

import { useCallback, useEffect, useState } from 'react';
import { semantic, spacing, radius } from '@cvip/ui';
import { DOCUMENT_REQUIREMENTS, type VendorStatus } from '@cvip/types';
import {
  decideVendor,
  listReviewableVendors,
  type ReviewableVendor,
} from '../../lib/vendors';
import {
  allowedDecisions,
  documentsGate,
  reasonRequired,
  reviewDecision,
  type ReviewDecision,
} from '../../lib/vendorReview';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  loadDossier,
  openDocument,
  reviewDocument,
  type Dossier,
  type DossierDocument,
} from '../../lib/vendorDossier';

/**
 * Vendor review — PRD §7.
 *
 * This is the other half of vendor onboarding. An organisation arrives as `pending_review` and
 * every public RLS policy gates on `status = 'approved'`, so until a decision is taken here the
 * vendor and its listings are invisible to tourists.
 */

const DECISION_LABELS: Record<ReviewDecision, string> = {
  approve: 'Approve',
  reject: 'Reject',
  request_changes: 'Request changes',
  suspend: 'Suspend',
};

export default function VendorReviewPage() {
  const [vendors, setVendors] = useState<ReviewableVendor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A decided vendor leaves the queue, so without this the card simply vanishes and the reviewer
  // has no confirmation that anything was recorded.
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    listReviewableVendors()
      .then(setVendors)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(load, [load]);

  const announce = useCallback(
    (vendor: ReviewableVendor, status: VendorStatus) => {
      setNotice(`${vendor.tradingName} is now ${status.replace('_', ' ')}.`);
      load();
    },
    [load],
  );

  const queue = (vendors ?? []).filter((v) => v.status !== 'approved');
  const approved = (vendors ?? []).filter((v) => v.status === 'approved');

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: spacing.xl }}>
      <p style={{ color: semantic.textMuted, margin: 0, fontSize: 14 }}>Caribbean VIP</p>
      <h1 style={{ color: semantic.brand, margin: `${spacing.xs}px 0 ${spacing.sm}px` }}>
        Vendor review
      </h1>
      <p style={{ color: semantic.textMuted, marginTop: 0 }}>
        A vendor and its listings stay invisible to tourists until approved. Every decision is
        recorded in the audit log.
      </p>

      {!isSupabaseConfigured ? (
        <p style={{ color: semantic.premiumText, fontSize: 14 }}>
          Demo data — decisions apply in memory and reset on reload.
        </p>
      ) : null}

      {notice ? (
        <p style={{ color: semantic.brand, fontSize: 14 }} role="status">
          {notice}
        </p>
      ) : null}

      {error ? (
        <p style={{ color: semantic.urgentText, fontSize: 14 }} role="alert">
          {error}
        </p>
      ) : null}

      {vendors === null ? (
        <p style={{ color: semantic.textMuted }}>Loading…</p>
      ) : (
        <>
          <h2 style={{ color: semantic.textPrimary, fontSize: 18, marginBottom: spacing.xs }}>
            Waiting on a decision
          </h2>
          {queue.length === 0 ? (
            <p style={{ color: semantic.textMuted }}>Nothing is waiting on a decision.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: spacing.sm }}>
              {queue.map((v) => (
                <VendorCard key={v.id} vendor={v} onDecided={announce} />
              ))}
            </ul>
          )}

          {/* Approved vendors are kept behind a disclosure. Suspension has to be reachable —
              PRD §7 lists it as one of the four actions — but there are far more approved
              vendors than pending ones, and listing them inline buries the queue this page
              exists for. */}
          {approved.length > 0 ? (
            <details style={{ marginTop: spacing.lg }}>
              <summary style={{ cursor: 'pointer', color: semantic.textMuted, fontSize: 15 }}>
                {approved.length} approved vendor{approved.length === 1 ? '' : 's'} — suspend one
              </summary>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  display: 'grid',
                  gap: spacing.sm,
                  marginTop: spacing.sm,
                }}
              >
                {approved.map((v) => (
                  <VendorCard key={v.id} vendor={v} onDecided={announce} />
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </main>
  );
}

function VendorCard({
  vendor,
  onDecided,
}: {
  vendor: ReviewableVendor;
  onDecided: (vendor: ReviewableVendor, status: VendorStatus) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<ReviewDecision | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Live only. The demo has no documents, so nothing below changes what the demo shows.
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [dossierError, setDossierError] = useState<string | null>(null);
  const [waive, setWaive] = useState(false);
  // Approved vendors are not in the intake queue, so their documents load on request: renewals
  // still arrive after approval and have to be reviewable, but there are many approved vendors.
  const [showDocs, setShowDocs] = useState(false);

  const decisions = allowedDecisions(vendor.status);

  const reloadDossier = useCallback(() => {
    if (!isSupabaseConfigured || (vendor.status === 'approved' && !showDocs)) return;
    loadDossier(vendor.id)
      .then((d) => {
        setDossier(d);
        setDossierError(null);
      })
      .catch((e: unknown) => setDossierError(e instanceof Error ? e.message : String(e)));
  }, [vendor.id, vendor.status, showDocs]);

  useEffect(reloadDossier, [reloadDossier]);

  const decide = async (decision: ReviewDecision) => {
    setProblem(null);
    setBusy(decision);
    try {
      const result = await decideVendor(vendor, decision, reason, waive);
      setReason('');
      setWaive(false);
      onDecided(vendor, result.status);
    } catch (e: unknown) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <li
      style={{
        background: semantic.surface,
        border: `1px solid ${semantic.border}`,
        borderRadius: radius.md,
        padding: spacing.md,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: spacing.md }}>
        <strong style={{ color: semantic.brand }}>{vendor.tradingName}</strong>
        <StatusChip status={vendor.status} />
      </div>

      {vendor.description ? (
        <p style={{ margin: `${spacing.xs}px 0 0`, color: semantic.textMuted, fontSize: 14 }}>
          {vendor.description}
        </p>
      ) : null}

      {vendor.reviewNotes ? (
        <p style={{ margin: `${spacing.xs}px 0 0`, color: semantic.textMuted, fontSize: 14 }}>
          Last recorded reason: {vendor.reviewNotes}
        </p>
      ) : null}

      {dossierError ? (
        <p style={{ color: semantic.urgentText, fontSize: 14 }} role="alert">
          Could not load documents. {dossierError}
        </p>
      ) : null}
      {dossier ? <DocumentsPanel dossier={dossier} onChanged={reloadDossier} /> : null}
      {isSupabaseConfigured && vendor.status === 'approved' && !showDocs ? (
        <button
          type="button"
          onClick={() => setShowDocs(true)}
          style={{ marginTop: spacing.sm, background: 'none', border: 'none', padding: 0, color: semantic.brand, cursor: 'pointer', textDecoration: 'underline', fontSize: 14 }}
        >
          Review documents
        </button>
      ) : null}

      {dossier && !dossier.readiness.ready && decisions.includes('approve') ? (
        <label style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.sm, fontSize: 14, color: semantic.textMuted }}>
          <input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} />
          Approve despite missing documents (needs a reason; recorded in the audit log)
        </label>
      ) : null}

      <label style={{ display: 'grid', gap: 4, marginTop: spacing.sm }}>
        <span style={{ fontSize: 14, color: semantic.textMuted }}>
          Reason{' '}
          {decisions.every((d) => reasonRequired(d)) ? '(required)' : '(required to refuse)'}
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          style={{
            padding: spacing.sm,
            fontSize: 15,
            border: `1px solid ${semantic.border}`,
            borderRadius: radius.sm,
            background: semantic.background,
            color: semantic.textPrimary,
            resize: 'vertical',
          }}
        />
      </label>

      <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.sm, flexWrap: 'wrap' }}>
        {decisions.map((d) => {
          // The same rule the write path applies, so a control is never offered for input that
          // would be refused a moment later.
          const checked = reviewDecision(vendor.status, d, reason);
          const gate = documentsGate(d, dossier?.readiness ?? null, waive, reason);
          const allowed = checked.ok && gate.ok;
          return (
            <button
              key={d}
              type="button"
              disabled={busy !== null || !allowed}
              // Deliberately no `title`: it became these buttons' accessible name, so "Reject"
              // was announced as "This decision needs a recorded reason". The visible
              // "(required to refuse)" label on the field carries that information instead.
              onClick={() => void decide(d)}
              style={{
                padding: `${spacing.xs}px ${spacing.sm}px`,
                fontSize: 15,
                fontWeight: 600,
                color: semantic.textOnDark,
                background: d === 'approve' ? semantic.brandActive : semantic.urgentText,
                border: 'none',
                borderRadius: radius.sm,
                cursor: busy !== null || !allowed ? 'default' : 'pointer',
                opacity: busy !== null || !allowed ? 0.55 : 1,
              }}
            >
              {busy === d ? 'Saving…' : DECISION_LABELS[d]}
            </button>
          );
        })}
      </div>

      {problem ? (
        <p style={{ color: semantic.urgentText, fontSize: 14, margin: `${spacing.xs}px 0 0` }} role="alert">
          {problem}
        </p>
      ) : null}
    </li>
  );
}

function StatusChip({ status }: { status: VendorStatus }) {
  return (
    <span style={{ color: semantic.premiumText, fontSize: 14 }}>
      {status.replace('_', ' ')}
    </span>
  );
}

/**
 * The checklist and the uploaded files for one vendor. Shown in live mode only.
 *
 * Approval is gated on this being complete (see `documentsGate`), so the missing items are listed
 * first and in the same words the vendor sees.
 */
function DocumentsPanel({ dossier, onChanged }: { dossier: Dossier; onChanged: () => void }) {
  const label = (kind: string) => DOCUMENT_REQUIREMENTS.find((r) => r.key === kind)?.label ?? kind;
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const review = async (doc: DossierDocument, decision: 'accepted' | 'rejected') => {
    setBusy(doc.id);
    setProblem(null);
    try {
      await reviewDocument(doc, decision, notes[doc.id] ?? '');
      onChanged();
    } catch (e: unknown) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const open = async (path: string) => {
    try {
      window.open(await openDocument(path), '_blank', 'noopener');
    } catch (e: unknown) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };

  const { readiness } = dossier;
  const small = { fontSize: 14, color: semantic.textMuted } as const;

  return (
    <div style={{ marginTop: spacing.sm, borderTop: `1px solid ${semantic.border}`, paddingTop: spacing.sm }}>
      <p style={{ margin: 0, fontWeight: 600, color: semantic.textPrimary }}>
        Documents · {dossier.islandName ?? 'island unknown'}
      </p>
      {dossier.islandCode === null ? (
        <p style={{ ...small, margin: `${spacing.xs}px 0 0` }}>
          This vendor has no recognised island, so there is no checklist to hold them to. Do not approve.
        </p>
      ) : readiness.ready ? (
        <p style={{ ...small, margin: `${spacing.xs}px 0 0` }}>Every required document is accepted and in date.</p>
      ) : (
        <p style={{ ...small, margin: `${spacing.xs}px 0 0` }}>
          Still needed: {readiness.blocking.map((b) => `${b.requirement.label} (${b.state})`).join('; ')}.
        </p>
      )}
      {readiness.toConfirm.length > 0 ? (
        <p style={{ ...small, margin: `${spacing.xs}px 0 0` }}>
          Confirm whether these apply: {readiness.toConfirm.map((c) => c.requirement.label).join('; ')}.
        </p>
      ) : null}
      {dossier.businessType === null ? (
        <p style={{ ...small, margin: `${spacing.xs}px 0 0` }}>No business type on file, so activity licences are not listed.</p>
      ) : null}

      {dossier.documents.length === 0 ? (
        <p style={{ ...small, margin: `${spacing.xs}px 0 0` }}>Nothing uploaded yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: `${spacing.xs}px 0 0`, display: 'grid', gap: spacing.xs }}>
          {dossier.documents.map((d) => (
            <li key={d.id} style={{ ...small, borderTop: `1px dashed ${semantic.border}`, paddingTop: spacing.xs }}>
              <strong style={{ color: semantic.textPrimary }}>{label(d.kind)}</strong> · {d.reviewState}
              {d.documentNumber ? ` · No. ${d.documentNumber}` : ''}
              {d.expiresOn ? ` · expires ${d.expiresOn}` : ''} ·{' '}
              <button
                type="button"
                onClick={() => void open(d.storagePath)}
                style={{ background: 'none', border: 'none', padding: 0, color: semantic.brand, cursor: 'pointer', textDecoration: 'underline', fontSize: 14 }}
              >
                {d.fileName ?? 'View'}
              </button>
              {d.reviewNotes ? <div>Note: {d.reviewNotes}</div> : null}
              {d.reviewState === 'pending' ? (
                <div style={{ display: 'flex', gap: spacing.xs, marginTop: 4, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Note (required to reject)"
                    value={notes[d.id] ?? ''}
                    maxLength={300}
                    onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                    style={{ flex: 1, minWidth: 160, padding: 6, border: `1px solid ${semantic.border}`, borderRadius: radius.sm }}
                  />
                  <button type="button" disabled={busy === d.id} onClick={() => void review(d, 'accepted')}>
                    Accept
                  </button>
                  <button type="button" disabled={busy === d.id} onClick={() => void review(d, 'rejected')}>
                    Reject
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {problem ? (
        <p style={{ color: semantic.urgentText, fontSize: 14, margin: `${spacing.xs}px 0 0` }} role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
