import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { REVIEW_LIMITS, reviewStateLabel } from '@cvip/types';
import { experienceById } from '../data/catalogue';
import { formatLongDate } from '../data/availability';
import { canReviewBooking, REVIEW_BLOCKED_COPY } from '../data/reviewEligibility';
import { reviewedBookingIds, submitReview, type MyReview } from '../data/reviewSubmission';
import { createReviewsClient } from '../lib/reviews';
import { isLiveMode } from '../lib/supabase';
import { useStore } from '../state/store';
import { EmptyState, PrimaryButton, SecondaryButton } from '../components/kit';
import { Icon } from '../components/Icon';
import './WriteReview.css';

/**
 * Writing a review of a trip that has happened.
 *
 * Every rule here is the client half of one the database already enforces
 * (`guard_review_fields`): the screen exists so a guest is told why they cannot review something
 * before they type two paragraphs, not because the client is trusted. The submit path re-checks
 * and maps any database refusal to plain copy.
 *
 * The guest is never told their review needs approving — `reviewStateLabel` keeps that wording in
 * one place. It goes in a queue; that is what they are told.
 */

const STARS = [1, 2, 3, 4, 5] as const;

export function WriteReview() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { state } = useStore();

  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [mine, setMine] = useState<MyReview[] | null>(null);
  const [sent, setSent] = useState(false);
  const client = useMemo(() => createReviewsClient(), []);
  const firstStar = useRef<HTMLButtonElement>(null);

  const booking = state.bookings.find((b) => b.id === bookingId);
  const experience = booking ? experienceById(booking.experienceId) : undefined;

  useEffect(() => {
    let cancelled = false;
    client
      .listMyReviews()
      .then((rows) => {
        if (!cancelled) setMine(rows);
      })
      // A failed read must not block the form: the database is the authority on a duplicate, and
      // it has a UNIQUE on booking_id. Treating "unknown" as "none" sends the guest to a refusal
      // they can read, which beats a screen that will not load.
      .catch(() => {
        if (!cancelled) setMine([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (!booking || !experience) {
    return (
      <main className="screen">
        <EmptyState
          icon="calendar"
          title="That trip is not here"
          body="It may have been booked on another device."
          action="Back to trips"
          onAction={() => navigate('/trips')}
        />
      </main>
    );
  }

  const already = mine?.find((r) => r.bookingId === booking.id) ?? null;
  const eligibility = canReviewBooking(
    booking,
    new Date().toISOString(),
    mine ? reviewedBookingIds(mine) : new Set<string>(),
  );

  const send = async () => {
    setProblem(null);
    setBusy(true);
    try {
      const result = await submitReview(
        client,
        { ...booking, experienceId: booking.experienceId },
        { rating, body },
        new Date().toISOString(),
        mine ? reviewedBookingIds(mine) : new Set<string>(),
      );
      if (result.ok) {
        setSent(true);
        setMine(await client.listMyReviews().catch(() => mine ?? []));
      } else {
        setProblem(result.problem);
      }
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <header className="review-write__head">
      <button
        type="button"
        className="review-write__back"
        aria-label="Back"
        onClick={() => navigate(-1)}
      >
        <Icon name="chevron-left" />
      </button>
      <div>
        <p className="review-write__eyebrow">{formatLongDate(booking.dateISO)}</p>
        <h1 className="review-write__title">{experience.title}</h1>
      </div>
    </header>
  );

  if (sent || already) {
    const stateLabel = already ? reviewStateLabel(already.state) : reviewStateLabel('pending');
    return (
      <main className="screen review-write">
        {header}
        <div className="review-write__done" role="status">
          <p className="review-write__done-state">{stateLabel}</p>
          <p className="review-write__done-body">
            {already?.state === 'published'
              ? 'Your review counts towards this trip’s rating.'
              : already?.state === 'rejected'
                ? 'This one was not published. Nothing else is needed from you.'
                : 'Thanks. A person reads every review before it goes on a listing.'}
          </p>
          <SecondaryButton onClick={() => navigate('/trips')}>Back to trips</SecondaryButton>
        </div>
      </main>
    );
  }

  if (!eligibility.ok) {
    return (
      <main className="screen review-write">
        {header}
        <div className="review-write__blocked">
          <p>{REVIEW_BLOCKED_COPY[eligibility.reason]}</p>
          <SecondaryButton onClick={() => navigate('/trips')}>Back to trips</SecondaryButton>
        </div>
      </main>
    );
  }

  const remaining = REVIEW_LIMITS.body - body.trim().length;

  return (
    <main className="screen review-write">
      {header}

      {!isLiveMode ? (
        <p className="review-write__demo">
          This is the demo. Reviews are not saved here.
        </p>
      ) : null}

      <fieldset className="review-write__stars">
        <legend>How was it?</legend>
        <div className="review-write__star-row">
          {STARS.map((n) => (
            <button
              key={n}
              ref={n === 1 ? firstStar : undefined}
              type="button"
              className="review-write__star"
              aria-pressed={rating === n}
              aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
              onClick={() => setRating(n)}
            >
              <span aria-hidden="true">{n <= rating ? '★' : '☆'}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="review-write__field">
        <span className="review-write__label">Anything you want to add? (optional)</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          maxLength={REVIEW_LIMITS.body}
          placeholder="What stood out?"
        />
        <span className="review-write__count" aria-live="polite">
          {remaining < 200 ? `${remaining} characters left` : ''}
        </span>
      </label>

      {/*
        Says only what is built. Nothing renders a review body publicly yet — the listing shows the
        aggregate from `experience_ratings` and nothing else — so this makes no promise about how a
        published review is displayed or what is shown beside it. `reviewCopy.test.ts` holds that.
      */}
      <p className="review-write__note">
        A person reads every review before it counts towards a listing&rsquo;s rating.
      </p>

      {problem ? (
        <p className="review-write__problem" role="alert">
          {problem}
        </p>
      ) : null}

      <PrimaryButton disabled={busy || rating === 0} onClick={() => void send()}>
        {busy ? 'Sending…' : 'Send review'}
      </PrimaryButton>
    </main>
  );
}
