import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  experienceById,
  formatKm,
  heroUrl,
  isWalkable,
  mediaUrl,
  qualifiesForRumPunch,
  simulatedPosition,
  travelFrom,
  vendorFor,
  destinationBySlug,
  allInFromMinor,
} from '../data/catalogue';
import { distanceMetres } from '@cvip/types';
import { firstBookableDay, isoDate, slotsFor } from '../data/availability';
import { shapeById } from '../data/itinerary';
import { describeDayFit, soonestDayFitting } from '../data/dayFit';
import { DEFAULT_PARTY } from '../data/catalogue';
import { useStore } from '../state/store';
import { Icon } from '../components/Icon';
import {
  Badge,
  EmptyState,
  Photo,
  PrimaryButton,
  Rating,
  RoundButton,
  StarRow,
  formatUsd,
} from '../components/kit';
import './ExperienceDetail.css';

/**
 * Experience detail — "what it is, why now, what it costs, answered before scrolling".
 *
 * The design puts the price, the rating and today's hours in one card directly under the title,
 * above everything else, and keeps a sticky action bar at the foot. That ordering is the screen's
 * argument: a guest deciding in the street should not have to scroll to find the two numbers the
 * decision turns on.
 */
export function ExperienceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, dispatch } = useStore();

  const experience = id ? experienceById(id) : undefined;

  /*
   * The day, built around this listing, so the page can answer "would this fit my day?" instead of
   * asking it. Same builder Irie uses, same bookings, same rules — see `dayFit.ts` for why none of
   * the judgement lives here.
   *
   * Above the early return, with every other hook: `experience` is undefined for an id that does
   * not resolve, and a hook below that guard changes the hook count between renders. React throws
   * "rendered more hooks than during the previous render" and the screen goes blank. This is the
   * second time that mistake has been made in this codebase — see the handover's 2026-09-22 entry
   * on `App()`. Hooks first, guards after.
   */
  const destination = destinationBySlug(state.destinationSlug);
  const shape = shapeById('full-day');
  const fit = useMemo(() => {
    if (!shape || !destination || !experience) return null;
    const todayISO = isoDate(new Date());
    const built = soonestDayFitting(
      {
        shape,
        islandId: state.islandId,
        destination,
        party: DEFAULT_PARTY,
        bookings: state.bookings.filter((b) => b.status === 'confirmed' && b.islandId === state.islandId),
        plannedExperienceIds: state.plannedExperienceIds,
        anchorExperienceId: experience.id,
      },
      todayISO,
    );
    return describeDayFit(built, experience.id, todayISO);
  }, [shape, destination, state.islandId, state.bookings, state.plannedExperienceIds, experience]);

  /*
   * The gallery's frame index, also above the guard for the same reason.
   */
  const [shown, setShown] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);

  if (!experience) {
    return (
      <main className="screen">
        <EmptyState
          icon="search"
          title="That listing is not available"
          body="It may have been removed, or it belongs to another island. Everything else is still here."
          action="Back to Explore"
          onAction={() => navigate('/')}
        />
      </main>
    );
  }

  const vendor = vendorFor(experience);
  const metres =
    vendor && destination
      ? distanceMetres(simulatedPosition(destination), {
          lat: vendor.location.lat,
          lng: vendor.location.lng,
        })
      : null;
  const travel = metres !== null ? travelFrom(metres) : null;

  const saved = state.savedExperienceIds.includes(experience.id);
  const day = firstBookableDay(experience);
  const slots = day ? slotsFor(experience, day.iso) : [];
  const soonest = slots.find((s) => s.capacityRemaining > 0);
  /**
   * The gallery.
   *
   * 24 of the 38 listings carry two or three photographs and this screen only
   * ever rendered `media[0]` — half the photography already in the repository
   * was never seen by anyone. A scroll-snap row costs no new assets and no
   * library.
   *
   * `shown` tracks which frame is in view, for the dots. It used to carry a
   * licence job as well — each photograph has its own author, so the credit
   * painted over the hero had to follow the scroll or it named the wrong one.
   * The credits moved to `/credits` and off the images entirely, so this is a
   * design concern again and nothing more.
   */
  const frames = experience.media.length > 0 ? experience.media : [undefined];

  const onGalleryScroll = () => {
    const el = railRef.current;
    if (!el) return;
    // Round rather than floor: at rest a snapped frame can sit a sub-pixel
    // short of its offset, which floors to the previous index and flickers the
    // dots back and forth as the scroll settles.
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setShown((prev) => (prev === i ? prev : Math.max(0, Math.min(frames.length - 1, i))));
  };

  const facts = [
    { label: 'Duration', value: durationLabel(experience.durationMinutes) },
    { label: 'Hotel pickup', value: experience.pickupInfo ? 'Included' : 'Not included' },
    experience.minAge
      ? { label: 'Families', value: `Ages ${experience.minAge} and up` }
      : { label: 'Group', value: 'Small group' },
    { label: 'Cancellation', value: `Free until ${experience.cancellationHours} hrs before` },
  ];

  return (
    <main className="screen detail">
      {/* ---------------- Hero ---------------- */}
      <header className="detail__hero">
        {frames.length > 1 ? (
          <div
            className="detail__gallery"
            ref={railRef}
            onScroll={onGalleryScroll}
            role="group"
            aria-label={`${frames.length} photographs of ${experience.title}`}
          >
            {frames.map((key, i) => (
              <div className="detail__frame" key={key ?? i}>
                <Photo
                  src={mediaUrl(key)}
                  mediaKey={key}
                  alt={i === 0 ? experience.title : ''}
                  ratio="390 / 308"
                  radius="0"
                  priority={i === 0}
                />
              </div>
            ))}
          </div>
        ) : (
          <Photo
            src={heroUrl(experience)}
            mediaKey={experience.media[0]}
            alt={experience.title}
            ratio="390 / 308"
            radius="0"
            priority
          />
        )}
        <span className="detail__scrim" />

        {frames.length > 1 ? (
          <div className="detail__dots" aria-hidden="true">
            {frames.map((key, i) => (
              <span
                key={key ?? i}
                className={`detail__dot ${i === shown ? 'is-on' : ''}`}
              />
            ))}
          </div>
        ) : null}

        <div className="detail__hero-controls">
          <RoundButton icon="chevron-left" label="Back" onClick={() => navigate(-1)} />
          <div className="row" style={{ gap: 9 }}>
            <RoundButton
              icon="heart"
              label={saved ? `Remove ${experience.title} from saved` : `Save ${experience.title}`}
              active={saved}
              onClick={() => dispatch({ type: 'toggleSaved', experienceId: experience.id })}
            />
          </div>
        </div>

        <div className="detail__hero-flags">
          {/* No "Open Now" here: the dataset has no opening hours, and the badge beside it already
              states the availability the app can actually stand behind. */}
          {day ? <Badge tone="brand">Available {day.iso === todayISO() ? 'today' : day.weekday}</Badge> : null}
          {qualifiesForRumPunch(experience) ? <Badge tone="sand">Offer attached</Badge> : null}
        </div>

      </header>

      {/* ---------------- Sheet ---------------- */}
      <div className="detail__sheet">
        <h1 className="t-display-md">{experience.title}</h1>

        <div className="detail__meta">
          <span className="row detail__place">
            <Icon name="pin" size={13} color="var(--teal-text)" strokeWidth={2} />
            {vendor?.location.name ?? ''}
          </span>
          {vendor?.status === 'approved' ? (
            <Badge tone="aqua">
              <Icon name="shield-check" size={12} color="var(--green-900)" strokeWidth={2.2} />
              Verified operator
            </Badge>
          ) : null}
        </div>

        <p className="t-caption c-muted detail__summary">{experience.summary}</p>

        {/* The two numbers the decision turns on, together, above the fold. */}
        <section className="detail__price-card">
          <div>
            <p className="t-micro c-faint detail__from">FROM</p>
            <p className="t-amount c-brand">
              {formatUsd(allInFromMinor(experience))}
              <span className="t-micro c-muted"> / adult</span>
            </p>
          </div>
          <div className="detail__price-right">
            <Rating average={experience.ratingAverage} count={experience.ratingCount} />
            {soonest && day ? (
              <p className="t-micro-strong c-locator detail__next">
                Next {day.iso === todayISO() ? 'today' : day.weekday} {soonest.label}
              </p>
            ) : (
              <p className="t-micro-strong c-urgent detail__next">No departures in the next two weeks</p>
            )}
          </div>
        </section>

        {travel && metres !== null ? (
          <p className="detail__travel t-micro">
            <Icon name={travel.mode === 'walk' ? 'walk' : 'car'} size={14} color="var(--teal-text)" />
            {formatKm(metres)} from {destination?.name} · {travel.minutes} min {travel.mode}
            {isWalkable(metres) ? '' : ' · pickup available'}
          </p>
        ) : null}

        {experience.subOptions && experience.subOptions.length > 0 ? (
          <section className="detail__options" aria-label="Included at this venue">
            {experience.subOptions.map((opt) => (
              <div key={opt} className="detail__option">
                <span className="detail__option-mark" aria-hidden="true">
                  <Icon name="check" size={13} color="var(--green-900)" strokeWidth={2.6} />
                </span>
                <span className="detail__option-label">{opt}</span>
              </div>
            ))}
          </section>
        ) : null}

        <section className="detail__facts">
          {facts.map((f) => (
            <div key={f.label} className="fact">
              <p className="t-micro c-faint fact__label">{f.label.toUpperCase()}</p>
              <p className="t-caption-strong">{f.value}</p>
            </div>
          ))}
        </section>

        <section className="detail__block">
          <h2 className="t-section">About this experience</h2>
          <p className="t-caption c-muted detail__body">{experience.description}</p>
        </section>

        {experience.inclusions.length > 0 ? (
          <section className="detail__block">
            <h2 className="t-section">What&rsquo;s included</h2>
            <ul className="detail__included">
              {experience.inclusions.map((inc) => (
                <li key={inc} className="t-caption">
                  <span className="detail__tick">
                    <Icon name="check" size={11} color="var(--green-900)" strokeWidth={2.6} />
                  </span>
                  {inc}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {experience.pickupInfo ? (
          <section className="detail__tip">
            <span className="detail__tip-mark t-micro-strong">TIP</span>
            <p className="t-caption">{experience.pickupInfo}</p>
          </section>
        ) : null}

        {/*
          Social proof, and every number in it is one the dataset actually holds.
          This block used to lead with "Booked 19 times this week" — `ratingCount / 38` — over
          "99% would recommend", which was `ratingAverage * 18 + 17`. Both were invented, sat
          beside a real price and a real distance, and so read as fact. The rating and its count
          are the real figures (documented stand-ins for an aggregate over `reviews`), and the
          seats are the same number checkout enforces, so scarcity here can never oversell a
          departure that is actually empty.
        */}
        <section className="detail__proof">
          <div className="detail__proof-head">
            <p className="detail__proof-score t-display-sm">{experience.ratingAverage.toFixed(1)}</p>
            <div className="grow">
              <StarRow />
              <p className="t-caption-strong detail__proof-claim">
                {ratingClaim(experience.ratingAverage)}
              </p>
              <p className="t-micro c-faint">
                from {experience.ratingCount.toLocaleString()} guest ratings
              </p>
            </div>
          </div>

          {/* The same threshold the sticky bar uses for "Nearly full". Two different urgencies
              for one number, six feet apart on the same screen, is worse than neither. */}
          {soonest && soonest.capacityRemaining <= 6 ? (
            <p className="t-caption-strong detail__proof-scarce">
              <Icon name="user" size={15} color="var(--coral-text)" />
              Only {soonest.capacityRemaining} {soonest.capacityRemaining === 1 ? 'place' : 'places'} left on the
              next departure
            </p>
          ) : null}

          {experience.review ? (
            <div className="detail__review">
              <StarRow />
              <blockquote className="t-caption detail__review-quote">
                &ldquo;{experience.review.quote}&rdquo;
              </blockquote>
              <p className="t-micro c-faint">
                {experience.review.author} · {experience.review.context} · {experience.review.date}
              </p>
            </div>
          ) : null}
        </section>

        <section className="detail__block">
          <h2 className="t-section">Irie AI has already checked</h2>
          {/*
            The listing travels with the question.
            This was a bare link to the Irie tab, which left the guest to re-ask what they were
            already looking at — the concierge was reachable but not informed. Handing the id over
            in router state makes Irie build the day *around* this listing and answer whether it
            fits, which is the only version of this affordance worth the space it takes.
          */}
          <button
            type="button"
            className={`detail__irie detail__irie--${fit ? fit.tone : 'fits'}`}
            onClick={() => navigate('/irie', { state: { askIrieAbout: experience.id } })}
          >
            <span className="detail__irie-mark">
              <Icon name="sparkle" size={19} color="var(--gold-light)" />
            </span>
            <span className="grow detail__irie-text">
              <span className="t-caption-strong">{fit ? fit.headline : 'Would this fit my day?'}</span>
              <span className="t-micro c-locator">
                {fit ? fit.detail : `Build a day around ${experience.title}, with travel and a total`}
              </span>
              <span className="t-micro detail__irie-more">See the whole day</span>
            </span>
            <Icon name="chevron-right" size={16} color="var(--green-900)" strokeWidth={2.2} />
          </button>
        </section>

      </div>

      {/* ---------------- Sticky action ---------------- */}
      <div className="detail__action">
        <div className="detail__action-price">
          <p className="t-amount-sm c-brand">{formatUsd(allInFromMinor(experience))}</p>
          {soonest ? (
            soonest.capacityRemaining <= 6 ? (
              <p className="t-micro c-urgent">Nearly full · {soonest.capacityRemaining} left</p>
            ) : (
              <p className="t-micro c-muted">{soonest.capacityRemaining} places left</p>
            )
          ) : (
            <p className="t-micro c-muted">Check other dates</p>
          )}
        </div>
        <PrimaryButton
          onClick={() => navigate(`/checkout/${experience.id}`)}
          disabled={!day}
          aria-label={`Check availability for ${experience.title}`}
        >
          Check Availability
        </PrimaryButton>
      </div>
    </main>
  );
}

/**
 * What a rating of this strength actually claims.
 *
 * A band, not a sentence per listing: the dataset holds an average and a count, and anything more
 * specific than the band that average sits in would be a number this app does not have.
 */
function ratingClaim(avg: number): string {
  if (avg >= 4.8) return 'Among the highest rated on the island';
  if (avg >= 4.5) return 'Consistently loved by guests';
  return 'Well reviewed by guests';
}


function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const upper = h + (m > 0 ? 1 : 0);
  return m > 0 ? `${h}–${upper} hours` : `${h} hour${h === 1 ? '' : 's'}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
