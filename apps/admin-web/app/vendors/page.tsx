'use client';

import { useCallback, useEffect, useState } from 'react';
import { semantic, spacing, radius } from '@cvip/ui';
import type { VendorStatus } from '@cvip/types';
import {
  decideVendor,
  listReviewableVendors,
  type ReviewableVendor,
} from '../../lib/vendors';
import {
  allowedDecisions,
  reasonRequired,
  reviewDecision,
  type ReviewDecision,
} from '../../lib/vendorReview';
import { isSupabaseConfigured } from '../../lib/supabase';

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

  const decisions = allowedDecisions(vendor.status);

  const decide = async (decision: ReviewDecision) => {
    setProblem(null);
    setBusy(decision);
    try {
      const result = await decideVendor(vendor, decision, reason);
      setReason('');
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
          return (
            <button
              key={d}
              type="button"
              disabled={busy !== null || !checked.ok}
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
                cursor: busy !== null || !checked.ok ? 'default' : 'pointer',
                opacity: busy !== null || !checked.ok ? 0.55 : 1,
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
