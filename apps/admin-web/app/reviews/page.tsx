'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { semantic, spacing, radius } from '@cvip/ui';
import type { ReviewModerationState } from '@cvip/types';
import { decideReview, listModeratableReviews, type ModeratableReview } from '../../lib/reviews';
import {
  allowedReviewDecisions,
  REVIEW_LANE_TITLE,
  reviewDecision,
  reviewLane,
  reviewReasonRequired,
  type ReviewDecision,
  type ReviewLane,
} from '../../lib/reviewModeration';

/**
 * Review moderation — the same workbench as listing review: lanes, a queue, a detail pane.
 *
 * A review counts towards a listing's public rating only while it is published, so these are the
 * decisions behind every star a tourist sees. The queue deliberately carries no guest name: see
 * the note in `lib/reviews.ts`.
 */

const LABELS: Record<ReviewDecision, string> = {
  publish: 'Publish',
  reject: 'Reject',
  unpublish: 'Unpublish',
  restore: 'Publish after all',
};

/** Publishing is the constructive move and gets the brand colour; the rest take content down. */
const CONSTRUCTIVE: ReviewDecision[] = ['publish', 'restore'];

const LANES: { key: ReviewLane; label: string; hint: string }[] = [
  { key: 'waiting', label: 'Waiting', hint: 'Written by a guest, needs a decision' },
  { key: 'live', label: 'Published', hint: 'Counting towards the public rating' },
  { key: 'hidden', label: 'Not published', hint: 'Rejected or taken down' },
];

function Stars({ rating }: { rating: number }) {
  const whole = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span aria-label={`${whole} out of 5`} style={{ color: semantic.premiumText, letterSpacing: 1 }}>
      <span aria-hidden="true">
        {'★'.repeat(whole)}
        {'☆'.repeat(5 - whole)}
      </span>
    </span>
  );
}

export default function ReviewModerationPage() {
  const [reviews, setReviews] = useState<ModeratableReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lane, setLane] = useState<ReviewLane>('waiting');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const laneChosen = useRef(false);

  const load = useCallback(() => {
    setError(null);
    listModeratableReviews()
      .then(setReviews)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  const byLane = useMemo(() => {
    const g: Record<ReviewLane, ModeratableReview[]> = { waiting: [], live: [], hidden: [] };
    for (const r of reviews ?? []) g[reviewLane(r.state)].push(r);
    return g;
  }, [reviews]);

  useEffect(() => {
    if (reviews === null || laneChosen.current) return;
    laneChosen.current = true;
    if (byLane.waiting.length === 0) setLane('live');
  }, [reviews, byLane]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? byLane[lane].filter((r) => `${r.experienceTitle} ${r.body ?? ''}`.toLowerCase().includes(q))
      : byLane[lane];
  }, [byLane, lane, query]);

  const lastIndex = useRef(0);
  useEffect(() => {
    const at = shown.findIndex((r) => r.id === selectedId);
    if (at >= 0) {
      lastIndex.current = at;
      return;
    }
    setSelectedId(shown.length > 0 ? shown[Math.min(lastIndex.current, shown.length - 1)]!.id : null);
  }, [shown, selectedId]);

  const selected = shown.find((r) => r.id === selectedId) ?? null;

  const announce = useCallback(
    (r: ModeratableReview, state: ReviewModerationState) => {
      setNotice(
        state === 'published'
          ? `That review is published and now counts towards ${r.experienceTitle}.`
          : `That review is no longer published, so it does not count towards ${r.experienceTitle}.`,
      );
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
      const at = shown.findIndex((r) => r.id === selectedId);
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
          <h1 style={{ color: semantic.brand, margin: `${spacing.xs}px 0 0` }}>Review moderation</h1>
        </div>
        <p style={{ color: semantic.textMuted, margin: 0, fontSize: 14, maxWidth: 440 }}>
          Only a published review counts towards a listing&rsquo;s rating. Every decision is recorded in the audit log.
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

      {reviews === null ? (
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
            <nav className="review-queue" aria-label="Review queue">
              <input
                type="search"
                aria-label="Search reviews"
                placeholder="Search listings or review text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', fontSize: 15, border: `1px solid ${semantic.border}`, borderRadius: radius.sm, background: semantic.surface, color: semantic.textPrimary }}
              />
              {shown.length === 0 ? (
                <p style={{ color: semantic.textMuted, fontSize: 15 }}>
                  {query.trim()
                    ? 'No review matches that search.'
                    : lane === 'waiting'
                      ? 'No review is waiting on a decision.'
                      : `Nothing in ${REVIEW_LANE_TITLE[lane].toLowerCase()}.`}
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: `${spacing.sm}px 0 0`, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
                  {shown.map((r) => {
                    const active = r.id === selectedId;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          className="review-row"
                          aria-current={active ? 'true' : undefined}
                          onClick={() => setSelectedId(r.id)}
                          style={{ width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer', padding: `${spacing.sm}px ${spacing.md}px`, background: active ? semantic.surface : 'transparent', border: `1px solid ${active ? semantic.brand : semantic.border}`, borderLeft: `4px solid ${active ? semantic.brand : semantic.border}`, borderRadius: radius.sm, color: semantic.textPrimary }}
                        >
                          <strong style={{ display: 'block', color: semantic.brand, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.experienceTitle}
                          </strong>
                          <span style={{ display: 'block', fontSize: 13, color: semantic.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <Stars rating={r.rating} /> {r.body ? r.body : 'No written review'}
                          </span>
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

            <section aria-label="Review detail">
              {selected ? (
                <ReviewCard key={selected.id} review={selected} onDecided={announce} />
              ) : (
                <p style={{ color: semantic.textMuted }}>Select a review to moderate.</p>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}

function ReviewCard({
  review,
  onDecided,
}: {
  review: ModeratableReview;
  onDecided: (r: ModeratableReview, s: ReviewModerationState) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<ReviewDecision | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const decisions = allowedReviewDecisions(review.state);

  const decide = async (d: ReviewDecision) => {
    setProblem(null);
    setBusy(d);
    try {
      const result = await decideReview(review, d, reason);
      onDecided(review, result.state);
    } catch (e: unknown) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <article style={{ background: semantic.surface, border: `1px solid ${semantic.border}`, borderRadius: radius.md, padding: spacing.lg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: spacing.md, alignItems: 'baseline' }}>
        <h2 style={{ color: semantic.brand, margin: 0, fontSize: 22 }}>{review.experienceTitle}</h2>
        <span style={{ color: semantic.premiumText, fontSize: 13, whiteSpace: 'nowrap' }}>
          {REVIEW_LANE_TITLE[reviewLane(review.state)]}
        </span>
      </div>

      <p style={{ margin: `${spacing.xs}px 0 0`, fontSize: 15 }}>
        <Stars rating={review.rating} />{' '}
        <span style={{ color: semantic.textMuted, fontSize: 14 }}>
          written {new Date(review.createdAtISO).toISOString().slice(0, 10)}
        </span>
      </p>

      {review.body ? (
        <blockquote style={{ margin: `${spacing.md}px 0 0`, padding: `${spacing.sm}px ${spacing.md}px`, borderLeft: `3px solid ${semantic.border}`, fontSize: 15, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {review.body}
        </blockquote>
      ) : (
        <p style={{ margin: `${spacing.md}px 0 0`, color: semantic.textMuted, fontSize: 15 }}>
          A rating with no written review. There is nothing to read, but it still counts towards the average.
        </p>
      )}

      <label style={{ display: 'grid', gap: 4, marginTop: spacing.md }}>
        <span style={{ fontSize: 14, color: semantic.textMuted }}>
          Reason {decisions.every((d) => reviewReasonRequired(d)) ? '(required)' : '(required to take it down)'}
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
          const allowed = reviewDecision(review.state, d, reason).ok;
          return (
            <button
              key={d}
              type="button"
              disabled={busy !== null || !allowed}
              onClick={() => void decide(d)}
              style={{ padding: `${spacing.xs}px ${spacing.sm}px`, fontSize: 15, fontWeight: 600, color: semantic.textOnDark, background: CONSTRUCTIVE.includes(d) ? semantic.brandActive : semantic.urgentText, border: 'none', borderRadius: radius.sm, cursor: busy !== null || !allowed ? 'default' : 'pointer', opacity: busy !== null || !allowed ? 0.55 : 1 }}
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
