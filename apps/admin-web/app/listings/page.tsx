'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { semantic, spacing, radius } from '@cvip/ui';
import { formatMoney, type Currency, type ListingStatus } from '@cvip/types';
import { decideListing, listReviewableListings, type ReviewableListing } from '../../lib/listings';
import {
  allowedListingDecisions,
  listingDecision,
  listingLane,
  listingReasonRequired,
  type ListingDecision,
  type ListingLane,
} from '../../lib/listingReview';

/**
 * Listing moderation — PRD §7. Same workbench as Vendor review: lanes, a queue, a detail pane.
 *
 * A listing reaches tourists only when it and its vendor are both approved, so the detail pane says
 * when an approved listing is held back by its vendor.
 */

const LABELS: Record<ListingDecision, string> = { approve: 'Approve', reject: 'Reject', unpublish: 'Unpublish' };

const LANES: { key: ListingLane; label: string; hint: string }[] = [
  { key: 'waiting', label: 'Waiting', hint: 'Submitted, needs a decision' },
  { key: 'live', label: 'Live', hint: 'Approved listings' },
];

export default function ListingModerationPage() {
  const [listings, setListings] = useState<ReviewableListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lane, setLane] = useState<ListingLane>('waiting');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const laneChosen = useRef(false);

  const load = useCallback(() => {
    setError(null);
    listReviewableListings()
      .then(setListings)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  const byLane = useMemo(() => {
    const g: Record<ListingLane, ReviewableListing[]> = { waiting: [], live: [] };
    for (const l of listings ?? []) {
      const k = listingLane(l.status);
      if (k) g[k].push(l);
    }
    return g;
  }, [listings]);

  useEffect(() => {
    if (listings === null || laneChosen.current) return;
    laneChosen.current = true;
    if (byLane.waiting.length === 0) setLane('live');
  }, [listings, byLane]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? byLane[lane].filter((l) => `${l.title} ${l.vendorName}`.toLowerCase().includes(q))
      : byLane[lane];
  }, [byLane, lane, query]);

  const lastIndex = useRef(0);
  useEffect(() => {
    const at = shown.findIndex((l) => l.id === selectedId);
    if (at >= 0) {
      lastIndex.current = at;
      return;
    }
    setSelectedId(shown.length > 0 ? shown[Math.min(lastIndex.current, shown.length - 1)]!.id : null);
  }, [shown, selectedId]);

  const selected = shown.find((l) => l.id === selectedId) ?? null;

  const announce = useCallback(
    (l: ReviewableListing, status: ListingStatus) => {
      setNotice(`${l.title} is now ${status.replace('_', ' ')}.`);
      load();
    },
    [load],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const step = e.key === 'j' ? 1 : e.key === 'k' ? -1 : 0;
      if (step === 0 || shown.length === 0) return;
      const at = shown.findIndex((l) => l.id === selectedId);
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
          <h1 style={{ color: semantic.brand, margin: `${spacing.xs}px 0 0` }}>Listing moderation</h1>
        </div>
        <p style={{ color: semantic.textMuted, margin: 0, fontSize: 14, maxWidth: 420 }}>
          A listing is public only when it and its vendor are approved. Every decision is recorded in the audit log.
        </p>
      </header>

      <div role="status" aria-live="polite">
        {notice ? (
          <p style={{ margin: `${spacing.md}px 0 0`, padding: `${spacing.sm}px ${spacing.md}px`, background: semantic.locatorTintSoft, color: semantic.brand, borderRadius: radius.sm, fontSize: 14, display: 'flex', justifyContent: 'space-between', gap: spacing.md }}>
            {notice}
            <button type="button" onClick={() => setNotice(null)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>
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

      {listings === null ? (
        <p style={{ color: semantic.textMuted }}>Loading…</p>
      ) : (
        <>
          <div role="tablist" aria-label="Moderation lanes" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: spacing.sm, margin: `${spacing.md}px 0` }}>
            {LANES.map((l) => {
              const active = lane === l.key;
              return (
                <button
                  key={l.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className="review-tab"
                  onClick={() => setLane(l.key)}
                  style={{ textAlign: 'left', padding: `${spacing.sm}px ${spacing.md}px`, background: active ? semantic.brand : semantic.surface, color: active ? semantic.textOnDark : semantic.textPrimary, border: `1px solid ${active ? semantic.brand : semantic.border}`, borderRadius: radius.md, cursor: 'pointer', font: 'inherit' }}
                >
                  <span style={{ display: 'block', fontSize: 28, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: active ? semantic.textOnDark : semantic.brand }}>
                    {byLane[l.key].length}
                  </span>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{l.label}</span>
                  <span style={{ display: 'block', fontSize: 13, opacity: 0.8 }}>{l.hint}</span>
                </button>
              );
            })}
          </div>

          <div className="review-shell">
            <nav className="review-queue" aria-label="Listing queue">
              <input
                type="search"
                aria-label="Search listings"
                placeholder="Search listings or vendors"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', fontSize: 15, border: `1px solid ${semantic.border}`, borderRadius: radius.sm, background: semantic.surface, color: semantic.textPrimary }}
              />
              {shown.length === 0 ? (
                <p style={{ color: semantic.textMuted, fontSize: 15 }}>
                  {query.trim() ? 'No listing matches that search.' : lane === 'waiting' ? 'No listing is waiting on a decision.' : 'No live listings.'}
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: `${spacing.sm}px 0 0`, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
                  {shown.map((l) => {
                    const active = l.id === selectedId;
                    return (
                      <li key={l.id}>
                        <button
                          type="button"
                          className="review-row"
                          aria-current={active ? 'true' : undefined}
                          onClick={() => setSelectedId(l.id)}
                          style={{ width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer', padding: `${spacing.sm}px ${spacing.md}px`, background: active ? semantic.surface : 'transparent', border: `1px solid ${active ? semantic.brand : semantic.border}`, borderLeft: `4px solid ${active ? semantic.brand : semantic.border}`, borderRadius: radius.sm, color: semantic.textPrimary }}
                        >
                          <strong style={{ display: 'block', color: semantic.brand, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</strong>
                          <span style={{ display: 'block', fontSize: 13, color: semantic.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.vendorName}</span>
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

            <section aria-label="Listing detail">
              {selected ? <ListingCard key={selected.id} listing={selected} onDecided={announce} /> : <p style={{ color: semantic.textMuted }}>Select a listing to review.</p>}
            </section>
          </div>
        </>
      )}
    </main>
  );
}

function ListingCard({ listing, onDecided }: { listing: ReviewableListing; onDecided: (l: ReviewableListing, s: ListingStatus) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<ListingDecision | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const decisions = allowedListingDecisions(listing.status);

  const decide = async (d: ListingDecision) => {
    setProblem(null);
    setBusy(d);
    try {
      const result = await decideListing(listing, d, reason);
      onDecided(listing, result.status);
    } catch (e: unknown) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const heldBack = listing.status === 'approved' && listing.vendorStatus !== 'approved';

  return (
    <article style={{ background: semantic.surface, border: `1px solid ${semantic.border}`, borderRadius: radius.md, padding: spacing.lg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: spacing.md, alignItems: 'baseline' }}>
        <h2 style={{ color: semantic.brand, margin: 0, fontSize: 22 }}>{listing.title}</h2>
        <span style={{ color: semantic.premiumText, fontSize: 13, whiteSpace: 'nowrap' }}>{listing.status.replace('_', ' ')}</span>
      </div>
      <p style={{ margin: `${spacing.xs}px 0 0`, color: semantic.textMuted, fontSize: 14 }}>
        {listing.vendorName} · {listing.category.replace(/_/g, ' ')} · from{' '}
        {formatMoney({ amountMinor: listing.fromAmountMinor, currency: listing.currency as Currency })}
      </p>
      {listing.summary ? <p style={{ margin: `${spacing.sm}px 0 0`, fontSize: 15 }}>{listing.summary}</p> : null}
      {heldBack ? (
        <p style={{ margin: `${spacing.sm}px 0 0`, color: semantic.urgentText, fontSize: 14, fontWeight: 600 }}>
          Not visible to tourists: the vendor is {listing.vendorStatus.replace('_', ' ')}.
        </p>
      ) : null}
      {listing.reviewNotes ? (
        <p style={{ margin: `${spacing.xs}px 0 0`, color: semantic.textMuted, fontSize: 14 }}>Last recorded reason: {listing.reviewNotes}</p>
      ) : null}

      <label style={{ display: 'grid', gap: 4, marginTop: spacing.md }}>
        <span style={{ fontSize: 14, color: semantic.textMuted }}>
          Reason {decisions.every((d) => listingReasonRequired(d)) ? '(required)' : '(required to refuse)'}
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          style={{ padding: spacing.sm, fontSize: 15, border: `1px solid ${semantic.border}`, borderRadius: radius.sm, background: semantic.background, color: semantic.textPrimary, resize: 'vertical' }}
        />
      </label>

      <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.sm, flexWrap: 'wrap' }}>
        {decisions.map((d) => {
          const allowed = listingDecision(listing.status, d, reason).ok;
          return (
            <button
              key={d}
              type="button"
              disabled={busy !== null || !allowed}
              onClick={() => void decide(d)}
              style={{ padding: `${spacing.xs}px ${spacing.sm}px`, fontSize: 15, fontWeight: 600, color: semantic.textOnDark, background: d === 'approve' ? semantic.brandActive : semantic.urgentText, border: 'none', borderRadius: radius.sm, cursor: busy !== null || !allowed ? 'default' : 'pointer', opacity: busy !== null || !allowed ? 0.55 : 1 }}
            >
              {busy === d ? 'Saving…' : LABELS[d]}
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
