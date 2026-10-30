'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { semantic, spacing, radius } from '@cvip/ui';
import type { VendorStatus } from '@cvip/types';
import {
  decideVendor,
  listReviewableVendors,
  type ReviewableVendor,
} from '../../lib/vendors';
import {
  allowedDecisions,
  documentsGate,
  needsAttention,
  type AttentionReasons,
  reasonRequired,
  reviewDecision,
  reviewLane,
  type ReviewLane,
  type ReviewDecision,
} from '../../lib/vendorReview';
import { isSupabaseConfigured } from '../../lib/supabase';
import { loadDossier, loadDossiers, type Dossier } from '../../lib/vendorDossier';
import { DocumentsPanel } from '../../components/DocumentsPanel';

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

const LANES: { key: ReviewLane; label: string; hint: string }[] = [
  { key: 'waiting', label: 'Waiting', hint: 'Needs a decision' },
  { key: 'attention', label: 'Needs attention', hint: 'Approved, documents short' },
  { key: 'approved', label: 'Approved', hint: 'Public, documents in order' },
];

export default function VendorReviewPage() {
  const [vendors, setVendors] = useState<ReviewableVendor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A decided vendor leaves the queue, so without this the card simply vanishes and the reviewer
  // has no confirmation that anything was recorded.
  const [notice, setNotice] = useState<string | null>(null);
  // Live only: approved vendors whose documents fall short. Empty in demo, so the demo is unchanged.
  const [attention, setAttention] = useState<Map<string, AttentionReasons>>(new Map());
  const [lane, setLane] = useState<ReviewLane>('waiting');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const laneChosen = useRef(false);

  const load = useCallback(() => {
    setError(null);
    listReviewableVendors()
      .then(async (list) => {
        setVendors(list);
        if (!isSupabaseConfigured) return;
        const approvedIds = list.filter((v) => v.status === 'approved').map((v) => v.id);
        const dossiers = await loadDossiers(approvedIds);
        const next = new Map<string, AttentionReasons>();
        for (const [id, d] of dossiers) {
          const reasons = needsAttention(d.readiness, d.documents);
          if (reasons) next.set(id, reasons);
        }
        setAttention(next);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(load, [load]);

  const flaggedIds = useMemo(() => new Set(attention.keys()), [attention]);

  const byLane = useMemo(() => {
    const groups: Record<ReviewLane, ReviewableVendor[]> = { waiting: [], attention: [], approved: [] };
    for (const v of vendors ?? []) groups[reviewLane(v, flaggedIds)].push(v);
    return groups;
  }, [vendors, flaggedIds]);

  // Open on the lane that has work in it, once, rather than on an empty queue.
  useEffect(() => {
    if (vendors === null || laneChosen.current) return;
    laneChosen.current = true;
    if (byLane.waiting.length === 0) setLane(byLane.attention.length > 0 ? 'attention' : 'approved');
  }, [vendors, byLane]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? byLane[lane].filter((v) => v.tradingName.toLowerCase().includes(q)) : byLane[lane];
  }, [byLane, lane, query]);

  // Keep the detail pane filled: when the selected vendor leaves the list (decided, filtered out,
  // lane changed) the reviewer lands on the vendor now at that position instead of a blank pane.
  const lastIndex = useRef(0);
  useEffect(() => {
    const at = shown.findIndex((v) => v.id === selectedId);
    if (at >= 0) {
      lastIndex.current = at;
      return;
    }
    setSelectedId(shown.length > 0 ? shown[Math.min(lastIndex.current, shown.length - 1)]!.id : null);
  }, [shown, selectedId]);

  const selected = shown.find((v) => v.id === selectedId) ?? null;

  const announce = useCallback(
    (vendor: ReviewableVendor, status: VendorStatus) => {
      setNotice(`${vendor.tradingName} is now ${status.replace('_', ' ')}.`);
      load();
    },
    [load],
  );

  // j / k step through the queue, so a reviewer can work it without leaving the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const step = e.key === 'j' ? 1 : e.key === 'k' ? -1 : 0;
      if (step === 0 || shown.length === 0) return;
      const at = shown.findIndex((v) => v.id === selectedId);
      setSelectedId(shown[Math.max(0, Math.min(shown.length - 1, at + step))]!.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, selectedId]);

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: spacing.lg }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: spacing.md, flexWrap: 'wrap' }}>
        <div>
          <p style={{ color: semantic.textMuted, margin: 0, fontSize: 14 }}>
            <Link href="/" style={{ color: 'inherit' }}>
              Caribbean VIP
            </Link>{' '}
            · Admin
          </p>
          <h1 style={{ color: semantic.brand, margin: `${spacing.xs}px 0 0` }}>Vendor review</h1>
        </div>
        <p style={{ color: semantic.textMuted, margin: 0, fontSize: 14, maxWidth: 420 }}>
          Vendors and their listings stay invisible to tourists until approved. Every decision is
          recorded in the audit log.
        </p>
      </header>

      {!isSupabaseConfigured ? (
        <p style={{ color: semantic.premiumText, fontSize: 14 }}>
          Demo data — decisions apply in memory and reset on reload.
        </p>
      ) : null}

      <div role="status" aria-live="polite">
        {notice ? (
          <p
            style={{
              margin: `${spacing.md}px 0 0`,
              padding: `${spacing.sm}px ${spacing.md}px`,
              background: semantic.locatorTintSoft,
              color: semantic.brand,
              borderRadius: radius.sm,
              fontSize: 14,
              display: 'flex',
              justifyContent: 'space-between',
              gap: spacing.md,
            }}
          >
            {notice}
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" style={linkButton}>
              Dismiss
            </button>
          </p>
        ) : null}
      </div>

      {error ? (
        <p style={{ color: semantic.urgentText, fontSize: 14 }} role="alert">
          {error}
        </p>
      ) : null}

      {vendors === null ? (
        <p style={{ color: semantic.textMuted }}>Loading…</p>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Review lanes"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: spacing.sm, margin: `${spacing.md}px 0` }}
          >
            {LANES.map((l) => {
              const count = byLane[l.key].length;
              const active = lane === l.key;
              const urgent = l.key === 'attention' && count > 0;
              return (
                <button
                  key={l.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className="review-tab"
                  onClick={() => setLane(l.key)}
                  style={{
                    textAlign: 'left',
                    padding: `${spacing.sm}px ${spacing.md}px`,
                    background: active ? semantic.brand : semantic.surface,
                    color: active ? semantic.textOnDark : semantic.textPrimary,
                    border: `1px solid ${active ? semantic.brand : semantic.border}`,
                    borderRadius: radius.md,
                    cursor: 'pointer',
                    font: 'inherit',
                  }}
                >
                  <span style={{ display: 'block', fontSize: 28, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: active ? semantic.textOnDark : urgent ? semantic.urgentText : semantic.brand }}>
                    {count}
                  </span>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{l.label}</span>
                  <span style={{ display: 'block', fontSize: 13, opacity: 0.8 }}>{l.hint}</span>
                </button>
              );
            })}
          </div>

          <div className="review-shell">
            <nav className="review-queue" aria-label="Vendor queue">
              <input
                type="search"
                aria-label="Search vendors"
                placeholder="Search vendors"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', fontSize: 15, border: `1px solid ${semantic.border}`, borderRadius: radius.sm, background: semantic.surface, color: semantic.textPrimary }}
              />
              {shown.length === 0 ? (
                <p style={{ color: semantic.textMuted, fontSize: 15 }}>
                  {query.trim()
                    ? 'No vendor matches that search.'
                    : lane === 'waiting'
                      ? 'Nothing is waiting on a decision.'
                      : lane === 'attention'
                        ? 'Every approved vendor is in order.'
                        : 'No approved vendors yet.'}
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: `${spacing.sm}px 0 0`, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
                  {shown.map((v) => {
                    const active = v.id === selectedId;
                    const why = attention.get(v.id);
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          className="review-row"
                          aria-current={active ? 'true' : undefined}
                          onClick={() => setSelectedId(v.id)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            font: 'inherit',
                            cursor: 'pointer',
                            padding: `${spacing.sm}px ${spacing.md}px`,
                            background: active ? semantic.surface : 'transparent',
                            border: `1px solid ${active ? semantic.brand : semantic.border}`,
                            borderLeft: `4px solid ${active ? semantic.brand : why ? semantic.urgentText : semantic.border}`,
                            borderRadius: radius.sm,
                            color: semantic.textPrimary,
                          }}
                        >
                          <span style={{ display: 'flex', justifyContent: 'space-between', gap: spacing.sm, width: '100%' }}>
                            <strong style={{ color: semantic.brand, fontSize: 15, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {v.tradingName}
                            </strong>
                            <StatusChip status={v.status} flagged={why !== undefined} />
                          </span>
                          {why ? (
                            <span style={{ display: 'block', fontSize: 13, color: semantic.urgentText, marginTop: 2 }}>
                              {attentionSummary(why)}
                            </span>
                          ) : v.description ? (
                            <span style={{ display: 'block', maxWidth: '100%', fontSize: 13, color: semantic.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {v.description}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {shown.length > 1 ? (
                <p style={{ color: semantic.textFaint, fontSize: 13 }}>
                  <kbd>j</kbd> / <kbd>k</kbd> to move through the list
                </p>
              ) : null}
            </nav>

            <section aria-label="Vendor detail">
              {selected ? (
                <VendorCard
                  key={selected.id}
                  vendor={selected}
                  onDecided={announce}
                  attention={attention.get(selected.id)}
                  onDocumentsChanged={load}
                />
              ) : (
                <p style={{ color: semantic.textMuted }}>Select a vendor to review.</p>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}

function attentionSummary(a: AttentionReasons): string {
  return [
    a.awaitingReview > 0 ? `${a.awaitingReview} ${a.awaitingReview === 1 ? 'file' : 'files'} awaiting review` : null,
    a.requiredOutstanding > 0 ? `${a.requiredOutstanding} required ${a.requiredOutstanding === 1 ? 'document' : 'documents'} outstanding` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const linkButton = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  textDecoration: 'underline',
} as const;

function VendorCard({
  vendor,
  onDecided,
  attention,
  onDocumentsChanged,
}: {
  vendor: ReviewableVendor;
  onDecided: (vendor: ReviewableVendor, status: VendorStatus) => void;
  /** Set when this approved vendor is in Needs attention: documents load straight away. */
  attention?: AttentionReasons;
  /** Lets the page re-sort a vendor out of Needs attention once its documents are in order. */
  onDocumentsChanged?: () => void;
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
  const [showDocs, setShowDocs] = useState(attention !== undefined);

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
    <article
      style={{
        background: semantic.surface,
        border: `1px solid ${semantic.border}`,
        borderRadius: radius.md,
        padding: spacing.lg,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: spacing.md, alignItems: 'baseline' }}>
        <h2 style={{ color: semantic.brand, margin: 0, fontSize: 22 }}>{vendor.tradingName}</h2>
        <StatusChip status={vendor.status} flagged={attention !== undefined} />
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

      {attention ? (
        <p style={{ margin: `${spacing.xs}px 0 0`, color: semantic.urgentText, fontSize: 14, fontWeight: 600 }}>
          {attentionSummary(attention)}
        </p>
      ) : null}

      {dossierError ? (
        <p style={{ color: semantic.urgentText, fontSize: 14 }} role="alert">
          Could not load documents. {dossierError}
        </p>
      ) : null}
      {dossier ? (
        <DocumentsPanel
          dossier={dossier}
          onChanged={() => {
            reloadDossier();
            onDocumentsChanged?.();
          }}
        />
      ) : null}
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
    </article>
  );
}

/**
 * `flagged` is an approved vendor short of documents. "Approved" means nothing is needed from an
 * admin, so a vendor in Needs attention shows as pending. This is a label only: the stored status
 * stays `approved`, which is what keeps the vendor and its listings public until an admin acts.
 */
function StatusChip({ status, flagged = false }: { status: VendorStatus; flagged?: boolean }) {
  return (
    <span
      style={{
        color: flagged ? semantic.urgentText : semantic.premiumText,
        fontSize: 13,
        fontWeight: flagged ? 600 : 400,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {flagged ? 'pending' : status.replace('_', ' ')}
    </span>
  );
}
