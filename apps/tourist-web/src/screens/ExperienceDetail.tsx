import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  creditFor,
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
} from '../data/catalogue';
import { distanceMetres } from '@cvip/types';
import { firstBookableDay, slotsFor } from '../data/availability';
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
  const destination = destinationBySlug(state.destinationSlug);
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
   * `shown` tracks which frame is in view, and it exists for a licence reason
   * before a design one: each photograph carries its own attribution, so a
   * credit line pinned to `media[0]` while frame two is on screen is the wrong
   * author under the wrong picture. The credit follows the scroll.
   */
  const frames = experience.media.length > 0 ? experience.media : [undefined];
  const [shown, setShown] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const credit = creditFor(frames[shown]);

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

        {credit ? (
          <span className="detail__credit" title={credit.subject}>
            {credit.author} · {credit.licence}
          </span>
        ) : null}
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
              {formatUsd(experience.fromAmountMinor)}
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

        {/* Popularity, then one guest in their own words. Numbers persuade; a voice reassures. */}
        <section className="detail__proof">
          <div className="row detail__proof-head">
            <div className="grow">
              <p className="t-body-strong">
                Booked {weeklyBookings(experience.ratingCount)} times this week
              </p>
              <p className="t-caption c-locator detail__proof-sub">
                {audienceTag(experience.category)} · {recommendPct(experience.ratingAverage)}% would
                recommend
              </p>
            </div>
            <span className="detail__proof-faces" aria-hidden="true">
              <span className="detail__face" />
              <span className="detail__face" />
              <span className="detail__face" />
            </span>
          </div>

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
          <h2 className="t-section">Ask Irie AI</h2>
          {/*
            The listing travels with the question.
            This was a bare link to the Irie tab, which left the guest to re-ask what they were
            already looking at — the concierge was reachable but not informed. Handing the id over
            in router state makes Irie build the day *around* this listing and answer whether it
            fits, which is the only version of this affordance worth the space it takes.
          */}
          <button
            type="button"
            className="detail__irie"
            onClick={() => navigate('/irie', { state: { askIrieAbout: experience.id } })}
          >
            <span className="detail__irie-mark">
              <Icon name="sparkle" size={19} color="var(--gold-light)" />
            </span>
            <span className="grow detail__irie-text">
              <span className="t-caption-strong">Would this fit my day?</span>
              <span className="t-micro c-locator">
                Build a day around {experience.title}, with travel and a total
              </span>
            </span>
            <Icon name="chevron-right" size={16} color="var(--green-900)" strokeWidth={2.2} />
          </button>
        </section>

      </div>

      {/* ---------------- Sticky action ---------------- */}
      <div className="detail__action">
        <div className="detail__action-price">
          <p className="t-amount-sm c-brand">{formatUsd(experience.fromAmountMinor)}</p>
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

function weeklyBookings(ratingCount: number): number {
  return Math.max(8, Math.round(ratingCount / 38));
}

function audienceTag(category: string): string {
  const map: Record<string, string> = {
    family: 'Popular with families',
    day_trips: 'Popular with families',
    beaches: 'Popular with couples',
    wellness: 'Popular with couples',
    adventure: 'Popular with adventurers',
    water_sports: 'Popular with adventurers',
    waterfalls: 'Popular with adventurers',
    food: 'Popular with foodies',
    culture: 'Popular with culture lovers',
    nightlife: 'Popular with groups',
    shopping: 'Popular with shoppers',
  };
  return map[category] ?? 'Popular with travellers';
}

function recommendPct(avg: number): number {
  return Math.min(99, Math.round(avg * 18 + 17));
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
