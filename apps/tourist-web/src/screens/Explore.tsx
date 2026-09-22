import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ISLANDS,
  PROMOTION,
  byDistanceFrom,
  destinationBySlug,
  destinationsFor,
  experienceById,
  experiencesFor,
  heroUrl,
  islandById,
  mediaUrl,
  simulatedPosition,
  vendorFor,
  travelFrom,
  isWalkable,
  formatKm,
  type DemoExperience,
} from '../data/catalogue';
import { evaluateFences, type FenceState } from '../data/geofence';
import { useGuestPosition } from '../state/useGuestPosition';
import { useNavigate } from 'react-router-dom';
import { firstBookableDay, slotsFor } from '../data/availability';
import { useStore } from '../state/store';
import { Icon, type IconName } from '../components/Icon';
import {
  Badge,
  Card,
  Photo,
  Price,
  Rating,
  RoundButton,
  SectionHeader,
} from '../components/kit';
import './Explore.css';

/**
 * Explore — the destination-led home.
 *
 * The design's thesis for this screen is that it sells a *day*, not a listing: a greeting tied to
 * place and time of day, then mood before inventory, then an editorial feed — one hero, a pair of
 * near-you cards, two hidden gems, one evening moment. That is why it is not a grid of identical
 * rows, and the ordering below is the design's, not a convenience.
 */

/**
 * The category row.
 *
 * These were emoji until the design pass. Emoji are a different typeface on every platform, so the
 * row that reads as one set on an iPhone read as twelve unrelated pictures on Android, at a weight
 * nothing else in the app uses — and the family group is a ZWJ sequence that splits into three
 * separate people wherever that sequence is unsupported. They are now the app's own glyphs, so the
 * row inherits `--ink-muted` and the brand green like every other control.
 */
const CATEGORIES = [
  { id: 'all',           label: 'All',          icon: 'compass' },
  { id: 'adventure',     label: 'Adventure',    icon: 'mountain' },
  { id: 'beaches',       label: 'Beaches',      icon: 'beach' },
  { id: 'water_sports',  label: 'Water Sports', icon: 'snorkel' },
  { id: 'waterfalls',    label: 'Waterfalls',   icon: 'waterfall' },
  { id: 'food',          label: 'Food',         icon: 'food' },
  { id: 'culture',       label: 'Culture',      icon: 'drum' },
  { id: 'wellness',      label: 'Wellness',     icon: 'lotus' },
  { id: 'nightlife',     label: 'Nightlife',    icon: 'moon' },
  { id: 'day_trips',     label: 'Day Trips',    icon: 'bus' },
  { id: 'family',        label: 'Family',       icon: 'family' },
  { id: 'shopping',      label: 'Shopping',     icon: 'bag' },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];

/** The design labels a card by what kind of thing it is, not by its raw category id. */
function categoryLabel(category: string): string {
  const map: Record<string, string> = {
    adventure: 'Adventure',
    beaches: 'Beach',
    water_sports: 'Water',
    waterfalls: 'Nature',
    food: 'Food',
    culture: 'Culture',
    wellness: 'Wellness',
    nightlife: 'Nightlife',
    day_trips: 'Day trip',
    family: 'Family',
    shopping: 'Shopping',
  };
  return map[category] ?? 'Experience';
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning from';
  if (h < 18) return 'Good afternoon from';
  return 'Good evening from';
}

export function Explore() {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const [islandOpen, setIslandOpen] = useState(false);
  const [category, setCategory] = useState<string>('all');

  const island = islandById(state.islandId);
  const destination = destinationBySlug(state.destinationSlug);
  const destinations = destinationsFor(state.islandId);

  const experiences = useMemo(() => experiencesFor(state.islandId), [state.islandId]);

  const ranked = useMemo(() => {
    if (category === 'all') return experiences;
    const hits = experiences.filter((e) => e.category === category);
    const rest = experiences.filter((e) => e.category !== category);
    return [...hits, ...rest];
  }, [experiences, category]);

  const guestPosition = useGuestPosition();
  const resolvedCoords = guestPosition.position.coordinates;

  const nearby = useMemo(() => {
    if (!destination) return [];
    const origin = resolvedCoords.lat !== 0 ? resolvedCoords : simulatedPosition(destination);
    return byDistanceFrom(origin, ranked).slice(0, 6);
  }, [destination, ranked, resolvedCoords]);

  // Fences: one per vendor that the on-island promotion applies to.
  const offerFences = useMemo(() => {
    return PROMOTION.appliesToExperienceIds
      .map((id) => experienceById(id))
      .filter((e): e is NonNullable<typeof e> => !!e && e.islandId === state.islandId)
      .map((e) => vendorFor(e))
      .filter((v): v is NonNullable<typeof v> => !!v)
      .map((v) => ({ id: v.id, coordinates: { lat: v.location.lat, lng: v.location.lng } }));
  }, [state.islandId]);

  // Hysteresis state — a ref so evaluateFences can read previous state without triggering renders.
  const fenceStateRef = useRef<FenceState>({ insideId: null });

  /**
   * Real geofence — fires when the guest walks within 250 m of a promoted vendor.
   *
   * Runs only when we have a real GPS fix (position.kind === 'real'). The `offerShownForIslands`
   * guard ensures it fires at most once per island regardless of how many position updates arrive.
   */
  useEffect(() => {
    if (guestPosition.position.kind !== 'real') return;
    if (state.offerShownForIslands.includes(state.islandId)) return;
    if (offerFences.length === 0) return;

    const result = evaluateFences(guestPosition.position.coordinates, offerFences, fenceStateRef.current);
    fenceStateRef.current = result.state;

    if (result.entered) {
      dispatch({ type: 'markOfferShown', islandId: state.islandId });
      navigate('/offer');
    }
  }, [guestPosition.position, offerFences, state.islandId, state.offerShownForIslands, dispatch, navigate]);

  /**
   * Demo fallback — when no real fix is available, fires on a timer so the offer still appears
   * in a demonstration or on a device without GPS consent. The real geofence above takes over
   * the moment consent is granted and a plausible position arrives.
   */
  useEffect(() => {
    if (guestPosition.position.kind === 'real') return;
    if (state.offerShownForIslands.includes(state.islandId)) return;
    const t = setTimeout(() => {
      dispatch({ type: 'markOfferShown', islandId: state.islandId });
      navigate('/offer');
    }, 6000);
    return () => clearTimeout(t);
  }, [guestPosition.position.kind, state.islandId, state.offerShownForIslands, dispatch, navigate]);

  const hero = ranked[0];
  const nearYou = nearby.slice(1, 4);
  const gems = ranked.slice(4, 6);
  const evening = ranked.find((e) => e.category === 'nightlife' || e.category === 'food');

  if (!island || !destination) return null;

  return (
    <main className="screen">
      {/* ---------------- Hero ---------------- */}
      <header className="ex-hero">
        <Photo
          src={mediaUrl(island.hero_media_path ?? undefined)}
          mediaKey={island.hero_media_path ?? undefined}
          alt={`${destination.name}, ${island.name}`}
          ratio="390 / 322"
          radius="0"
          priority
          className="ex-hero__photo"
        />
        <div className="ex-hero__scrim" />

        <div className="ex-hero__top">
          <button
            type="button"
            className="island-pill"
            onClick={() => setIslandOpen((v) => !v)}
            aria-expanded={islandOpen}
            aria-haspopup="menu"
          >
            <span className="island-pill__brand">Caribbean VIP</span>
            <span className="island-pill__rule" />
            <span className="island-pill__name">
              {island.in_app_brand} · {destination.name}
            </span>
            <Icon name="chevron-down" size={12} strokeWidth={2.2} />
          </button>

          <RoundButton icon="bell" label="Notifications" tone="dark" />
        </div>

        {islandOpen ? (
          <div className="island-menu" role="menu">
            <p className="t-overline c-faint island-menu__head">Switch destination</p>
            {ISLANDS.map((i) => {
              const first = destinationsFor(i.id)[0];
              const on = i.id === island.id;
              return (
                <button
                  key={i.id}
                  role="menuitem"
                  type="button"
                  className={`island-menu__row ${on ? 'is-on' : ''}`}
                  onClick={() => {
                    dispatch({ type: 'selectIsland', islandId: i.id });
                    setIslandOpen(false);
                  }}
                >
                  <span className="t-caption-strong">
                    {i.in_app_brand} · {first?.name ?? ''}
                  </span>
                  {on ? <span className="island-menu__dot" /> : null}
                </button>
              );
            })}
            {destinations.length > 1 ? (
              <>
                <p className="t-overline c-faint island-menu__head">In {island.name}</p>
                {destinations.map((d) => (
                  <button
                    key={d.id}
                    role="menuitem"
                    type="button"
                    className={`island-menu__row ${d.slug === destination.slug ? 'is-on' : ''}`}
                    onClick={() => {
                      dispatch({ type: 'selectDestination', slug: d.slug });
                      setIslandOpen(false);
                    }}
                  >
                    <span className="t-caption">{d.name}</span>
                    {d.slug === destination.slug ? <span className="island-menu__dot" /> : null}
                  </button>
                ))}
              </>
            ) : null}
          </div>
        ) : null}

        <div className="ex-hero__title">
          <h1 className="t-display c-on-dark">
            {greeting()}
            <br />
            <span className="ex-hero__place">{destination.name}</span>
          </h1>
          <p className="t-caption-strong ex-hero__sub">What kind of day are you in the mood for?</p>
        </div>
      </header>

      {/* ---------------- Search ---------------- */}
      <div className="pad">
        <button type="button" className="search-pill" onClick={() => navigate('/search')}>
          <Icon name="search" size={17} color="var(--green-900)" strokeWidth={2} />
          <span className="grow t-caption c-muted">Search experiences, food, beaches</span>
          <Icon name="filter" size={17} color="var(--gold)" strokeWidth={2} />
        </button>
      </div>

      {/* ---------------- Categories ---------------- */}
      <div className="ex-cats-wrap">
        <div className="ex-cats" role="group" aria-label="Filter by category">
          {CATEGORIES.map((c) => {
            const on = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                className={`ex-cat ${on ? 'ex-cat--on' : ''}`}
                onClick={() => setCategory(c.id)}
                aria-pressed={on}
              >
                <span className="ex-cat__icon">
                  <Icon name={c.icon} size={22} strokeWidth={1.8} />
                </span>
                <span className="ex-cat__label">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------------- Experience of the day ---------------- */}
      {hero ? (
        <section className="pad ex-section">
          <SectionHeader title="Experience of the Day" note="Today only" />
          <FeatureCard experience={hero} />
        </section>
      ) : null}

      {/* ---------------- Near you ---------------- */}
      {nearYou.length > 0 ? (
        <section className="ex-section">
          <div className="pad">
            <SectionHeader title="Near You Now" action="See all" />
          </div>
          <div className="rail">
            {nearYou.map(({ experience, metres }) => (
              <NearCard key={experience.id} experience={experience} metres={metres} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------------- Local finds ---------------- */}
      {gems.length > 0 ? (
        <section className="pad ex-section">
          <SectionHeader title="Local Finds" />
          <div className="ex-gems">
            {gems.map((e) => (
              <GemCard key={e.id} experience={e} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------------- Tonight ---------------- */}
      {evening ? (
        <section className="pad ex-section">
          <SectionHeader title="Tonight Near You" />
          <button type="button" className="tonight" onClick={() => navigate(`/experience/${evening.id}`)}>
            <div className="grow">
              <Badge tone="gold-glass">7:30 PM · 3 tables left</Badge>
              <h3 className="t-display-sm c-on-dark tonight__title">{evening.title}</h3>
              <p className="t-caption tonight__sub">{evening.summary}</p>
            </div>
            <Photo
              src={heroUrl(evening)}
              mediaKey={evening.media[0]}
              alt=""
              ratio="1 / 1"
              radius="var(--r-md)"
              className="tonight__photo"
            />
          </button>
        </section>
      ) : null}

      {/* ---------------- Plan the gap ---------------- */}
      <section className="pad ex-section">
        <button
          type="button"
          className="ex-nudge"
          onClick={() => navigate('/irie')}
        >
          <span className="ex-nudge__mark">
            <Icon name="sparkle" size={19} color="var(--gold-light)" />
          </span>
          <span className="grow ex-nudge__text">
            <span className="t-caption-strong">You have {freeHours()} free hours this afternoon</span>
            <span className="t-micro c-locator">Ask Irie AI to plan it</span>
          </span>
          <Icon name="chevron-right" size={16} color="var(--green-900)" strokeWidth={2.2} />
        </button>
      </section>

      {/* ---------------- Map teaser ---------------- */}
      <section className="pad ex-section">
        <div className="ex-map">
          <span className="ex-map__road ex-map__road--a" />
          <span className="ex-map__road ex-map__road--b" />
          <span className="ex-map__blob" />
          <span className="ex-map__ring" />
          <span className="ex-map__you" />
          {nearby.slice(0, 2).map(({ experience }, i) => (
            <span key={experience.id} className={`ex-map__pin ex-map__pin--${i}`}>
              {`US$${Math.round(experience.fromAmountMinor / 100)}`}
            </span>
          ))}
          <span className="ex-map__count t-caption-strong">
            {nearby.length} experiences within 5 km
          </span>
          <button type="button" className="ex-map__cta" onClick={() => navigate('/nearby')}>
            Open map
          </button>
        </div>
      </section>

    </main>
  );
}

/** Hours between now and a 7pm dinner, floored at two — the nudge should never read as nagging. */
function freeHours(): number {
  const h = new Date().getHours();
  return Math.max(2, Math.min(6, 19 - h));
}

// ---------------------------------------------------------------------------

function FeatureCard({ experience }: { experience: DemoExperience }) {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const saved = state.savedExperienceIds.includes(experience.id);
  const vendor = vendorFor(experience);

  return (
    <Card className="feature">
      <div className="feature__media">
        <Photo
          src={heroUrl(experience)}
          mediaKey={experience.media[0]}
          alt={experience.title}
          ratio="358 / 186"
          radius="0"
          credit
        />
        <div className="feature__flags">
          <Badge tone="brand">Open Now</Badge>
          <Badge tone="plain">Cruise-Friendly</Badge>
        </div>
        <span className="feature__save">
          <RoundButton
            icon="heart"
            label={saved ? `Remove ${experience.title} from saved` : `Save ${experience.title}`}
            active={saved}
            onClick={() => dispatch({ type: 'toggleSaved', experienceId: experience.id })}
          />
        </span>
      </div>
      <div className="feature__body">
        <h3 className="t-display-sm">{experience.title}</h3>
        <p className="t-micro c-locator feature__meta">
          {experience.category.replace(/_/g, ' ')} · {vendor?.location.name ?? ''}
        </p>
        <p className="t-caption c-muted feature__summary">{experience.summary}</p>
        <div className="row feature__foot">
          <div className="grow">
            <Rating average={experience.ratingAverage} count={experience.ratingCount} />
            <div className="feature__price">
              <span className="t-micro c-muted">From </span>
              <Price minor={experience.fromAmountMinor} size="lg" />
            </div>
          </div>
          <button
            type="button"
            className="badge badge--brand feature__cta"
            onClick={() => navigate(`/experience/${experience.id}`)}
          >
            View Experience
          </button>
        </div>
      </div>
    </Card>
  );
}

function NearCard({ experience, metres }: { experience: DemoExperience; metres: number }) {
  const travel = travelFrom(metres);
  const navigate = useNavigate();
  return (
    <Card className="near" onClick={() => navigate(`/experience/${experience.id}`)} label={experience.title}>
      <div className="near__media">
        <Photo src={heroUrl(experience)} mediaKey={experience.media[0]} alt={experience.title} ratio="206 / 112" radius="0" />
        <span className="near__flag">
          <Badge tone="travel">
            {/* 1.9 is the set's native weight — at 2.2 the wheels fill in and the car blobs. */}
            <Icon
              name={travel.mode === 'walk' ? 'walk' : 'car'}
              size={14}
              color="var(--teal-text)"
              strokeWidth={1.9}
            />
            {travel.minutes} min
          </Badge>
        </span>
      </div>
      <div className="near__body">
        <h3 className="t-card-title near__title">{experience.title}</h3>
        <p className="t-micro c-locator near__meta">
          <span className="near__cat">{categoryLabel(experience.category)}</span> · {formatKm(metres)} ·{' '}
          {isWalkable(metres) ? 'Walking distance' : 'Pickup available'}
        </p>
        <div className="row near__foot">
          <Price minor={experience.fromAmountMinor} />
          <Rating average={experience.ratingAverage} compact />
        </div>
      </div>
    </Card>
  );
}

function GemCard({ experience }: { experience: DemoExperience }) {
  const navigate = useNavigate();
  /*
   * The next departure, not the group size.
   *
   * A guest off a ship is deciding against a deadline — "small group" does not help them work out
   * whether this fits before they have to be back on board, and the departure time does.
   */
  const day = firstBookableDay(experience);
  const next = day ? slotsFor(experience, day.iso).find((s) => s.capacityRemaining > 0) : undefined;
  return (
    <button type="button" className="gem" onClick={() => navigate(`/experience/${experience.id}`)}>
      <Photo src={heroUrl(experience)} mediaKey={experience.media[0]} alt={experience.title} ratio="163 / 150" radius="var(--r-lg)" />
      <span className="gem__scrim" />
      <div className="gem__body">
        <h3 className="gem__title">{experience.title}</h3>
        <p className="gem__price">
          {`US$${Math.round(experience.fromAmountMinor / 100)}`}
          {next ? ` · leaves ${next.label}` : ' · check dates'}
        </p>
      </div>
    </button>
  );
}
