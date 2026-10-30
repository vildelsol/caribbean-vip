'use client';

import { useState } from 'react';
import { semantic, spacing, radius } from '@cvip/ui';
import { DOCUMENT_REQUIREMENTS, type RequirementStatus } from '@cvip/types';
import { openDocument, reviewDocument, type Dossier, type DossierDocument } from '../lib/vendorDossier';

type Tone = 'idle' | 'review' | 'ok' | 'warn' | 'bad';

const STATE: Record<RequirementStatus['state'], { label: string; tone: Tone }> = {
  missing: { label: 'Missing', tone: 'idle' },
  pending: { label: 'Awaiting review', tone: 'review' },
  accepted: { label: 'Accepted', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
  expired: { label: 'Expired', tone: 'bad' },
};

/** Required is the default and goes unlabelled; only the exceptions are tagged. */
const LEVEL_TAG = { required: 'Required', conditional: 'If it applies', recommended: 'Recommended' } as const;

const TONE_COLOUR: Record<Tone, string> = {
  idle: semantic.textFaint,
  review: semantic.locatorText,
  ok: semantic.brand,
  warn: semantic.premiumText,
  bad: semantic.urgentText,
};

/** Drawn marks in one stroke weight, so status reads without relying on colour. */
function Mark({ tone }: { tone: Tone }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  } as const;
  return (
    <span style={{ color: TONE_COLOUR[tone], display: 'grid', placeItems: 'center', width: 20, height: 20 }}>
      {tone === 'ok' ? (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" />
          <path d="M8 12.5l2.7 2.7L16 9.8" stroke={semantic.textOnDark} />
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

const small = { fontSize: 13.5, color: semantic.textMuted } as const;
const rowStyle = {
  display: 'grid',
  gridTemplateColumns: '20px minmax(0, 1fr) auto',
  columnGap: spacing.sm,
  alignItems: 'start',
  padding: `${spacing.sm}px 0`,
  borderTop: `1px solid ${semantic.border}`,
} as const;
const listStyle = { listStyle: 'none', padding: 0, margin: 0 } as const;

/**
 * One vendor's evidence: the checklist for their island and business type as a list, then every
 * file they uploaded with its review controls. Live mode only.
 *
 * Approval is gated on this being complete (see `documentsGate`), so each requirement shows its
 * state in the same words the vendor sees, required items first.
 */
export function DocumentsPanel({ dossier, onChanged }: { dossier: Dossier; onChanged: () => void }) {
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

  const { readiness, statuses } = dossier;
  const required = statuses.filter((s) => s.requirement.level === 'required');
  const accepted = required.length - readiness.blocking.length;

  return (
    <section
      aria-label="Documents"
      style={{ marginTop: spacing.sm, borderTop: `1px solid ${semantic.border}`, paddingTop: spacing.sm }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16, color: semantic.textPrimary }}>
          Documents{dossier.islandName ? ` · ${dossier.islandName}` : ''}
        </h3>
        {dossier.islandCode ? (
          <span style={{ ...small, fontVariantNumeric: 'tabular-nums', color: readiness.ready ? semantic.brand : semantic.textMuted, fontWeight: 600 }}>
            {accepted} of {required.length} required accepted
          </span>
        ) : null}
      </div>

      {dossier.islandCode === null ? (
        <p style={{ ...small, margin: `${spacing.xs}px 0 0`, color: semantic.urgentText }}>
          This vendor has no recognised island, so there is no checklist to hold them to. Do not approve.
        </p>
      ) : (
        <>
          {required.length > 0 ? (
            <div
              role="img"
              aria-label={`${accepted} of ${required.length} required documents accepted`}
              style={{ display: 'flex', gap: 4, marginTop: spacing.xs }}
            >
              {required.map((s) => (
                <span
                  key={s.requirement.key}
                  style={{
                    flex: 1,
                    height: 5,
                    borderRadius: 999,
                    background:
                      s.state === 'accepted' ? semantic.brand : s.state === 'pending' ? semantic.locator : semantic.surfaceSunken,
                    boxShadow: s.state === 'accepted' || s.state === 'pending' ? 'none' : `inset 0 0 0 1px ${semantic.border}`,
                  }}
                />
              ))}
            </div>
          ) : null}

          <ul style={{ ...listStyle, marginTop: spacing.xs }}>
            {statuses.map((s) => {
              const view = s.expiringSoon ? { label: 'Expires soon', tone: 'warn' as Tone } : STATE[s.state];
              return (
                <li key={s.requirement.key} style={rowStyle}>
                  <Mark tone={view.tone} />
                  <div style={{ minWidth: 0 }}>
                    <span style={{ color: semantic.textPrimary, fontSize: 15, fontWeight: 600 }}>{s.requirement.label}</span>
                    {s.requirement.level !== 'required' ? (
                      <span style={{ ...small, marginLeft: spacing.xs }}>{LEVEL_TAG[s.requirement.level]}</span>
                    ) : null}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: TONE_COLOUR[view.tone] }}>{view.label}</span>
                </li>
              );
            })}
          </ul>

          {dossier.businessType === null ? (
            <p style={{ ...small, margin: `${spacing.xs}px 0 0` }}>
              No business type on file, so activity licences are not listed.
            </p>
          ) : null}
        </>
      )}

      <h4 style={{ margin: `${spacing.md}px 0 0`, fontSize: 14, color: semantic.textPrimary }}>Uploaded files</h4>
      {dossier.documents.length === 0 ? (
        <p style={{ ...small, margin: `${spacing.xs}px 0 0` }}>Nothing uploaded yet.</p>
      ) : (
        <ul style={{ ...listStyle, marginTop: spacing.xs }}>
          {dossier.documents.map((d) => {
            const view = STATE[d.reviewState === 'pending' ? 'pending' : d.reviewState === 'accepted' ? 'accepted' : 'rejected'];
            return (
              <li key={d.id} style={rowStyle}>
                <Mark tone={view.tone} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: semantic.textPrimary, fontSize: 15, fontWeight: 600 }}>{label(d.kind)}</div>
                  <div style={{ ...small, fontVariantNumeric: 'tabular-nums' }}>
                    {[d.documentNumber ? `No. ${d.documentNumber}` : null, d.expiresOn ? `expires ${d.expiresOn}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                    {d.documentNumber || d.expiresOn ? ' · ' : ''}
                    <button
                      type="button"
                      onClick={() => void open(d.storagePath)}
                      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: semantic.locatorText, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                    >
                      {d.fileName ?? 'View file'}
                    </button>
                  </div>
                  {d.reviewNotes ? <div style={{ ...small, marginTop: 2 }}>Note: {d.reviewNotes}</div> : null}
                  {d.reviewState === 'pending' ? (
                    <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        aria-label={`Note for ${label(d.kind)}`}
                        placeholder="Note (required to reject)"
                        value={notes[d.id] ?? ''}
                        maxLength={300}
                        onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                        style={{ flex: 1, minWidth: 180, padding: '8px 10px', fontSize: 14, border: `1px solid ${semantic.border}`, borderRadius: radius.sm, background: semantic.background, color: semantic.textPrimary }}
                      />
                      <button
                        type="button"
                        disabled={busy === d.id}
                        onClick={() => void review(d, 'accepted')}
                        style={{ padding: '8px 14px', fontSize: 14, fontWeight: 600, color: semantic.textOnDark, background: semantic.brandActive, border: 'none', borderRadius: radius.sm, cursor: 'pointer', opacity: busy === d.id ? 0.55 : 1 }}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={busy === d.id}
                        onClick={() => void review(d, 'rejected')}
                        style={{ padding: '8px 14px', fontSize: 14, fontWeight: 600, color: semantic.urgentText, background: 'transparent', border: `1px solid ${semantic.urgentText}`, borderRadius: radius.sm, cursor: 'pointer', opacity: busy === d.id ? 0.55 : 1 }}
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: TONE_COLOUR[view.tone] }}>
                  {d.reviewState === 'pending' ? 'Awaiting review' : d.reviewState === 'accepted' ? 'Accepted' : 'Rejected'}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {problem ? (
        <p style={{ color: semantic.urgentText, fontSize: 14, margin: `${spacing.xs}px 0 0` }} role="alert">
          {problem}
        </p>
      ) : null}
    </section>
  );
}
