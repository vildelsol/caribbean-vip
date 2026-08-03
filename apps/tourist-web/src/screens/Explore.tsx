import { useMemo, useState } from 'react';
import {
  ISLANDS,
  byDistanceFrom,
  destinationBySlug,
  destinationsFor,
  experiencesFor,
  heroUrl,
  islandById,
  mediaUrl,
  simulatedPosition,
  vendorFor,
  walkMinutes,
  type DemoExperience,
} from '../data/catalogue';
import { useStore } from '../state/store';
import { Icon } from '../components/Icon';
import {
  Badge,
  Card,
  DemoNote,
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
 * The four moods, and the categories each one ranks up.
 *
 * Their photographs are **not** hard-coded. Each tile borrows the hero of a real listing in that
 * category on the current island, falling back to the island hero when there is none — so the tiles
 * localise with everything else when the guest switches island, and a tile can never point at a
 * file that does not exist. Two of them did, before this was derived rather than written down.
 */
const MOODS = [
  { id: 'adventure', label: 'Adventure', categories: ['adventure', 'waterfalls', 'water_sports'] },
  { id: 'relax', label: 'Relax & Unwind', categories: ['beaches', 'wellness'] },
  { id: 'taste', label: 'Taste the Island', categories: ['food'] },
  { id: 'local', label: 'Explore Like a Local', categories: ['culture', 'day_trips'] },
] as const;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning from';
  if (h < 18) return 'Good afternoon from';
  return 'Good evening from';
}

export function Explore() {
  const { state, dispatch } = useStore();
  const [islandOpen, setIslandOpen] = useState(false);
  const [mood, setMood] = useState<string | null>(null);

  const island = islandById(state.islandId);
  const destination = destinationBySlug(state.destinationSlug);
  const destinations = destinationsFor(state.islandId);

  const experiences = useMemo(() => experiencesFor(state.islandId), [state.islandId]);

  /**
   * The feed, composed rather than listed.
   *
   * Mood ranks, it never filters — picking "Adventure" floats adventure up, it does not hide the
   * waterfalls. A first-run control that quietly removes half the catalogue is a trap, because the
   * guest has no way to connect the short list back to the tile they tapped a minute earlier.
   */
  const ranked = useMemo(() => {
    if (!mood) return experiences;
    const cats = new Set<string>(MOODS.find((m) => m.id === mood)?.categories ?? []);
    const hits = experiences.filter((e) => cats.has(e.category));
    const rest = experiences.filter((e) => !cats.has(e.category));
    return [...hits, ...rest];
  }, [experiences, mood]);

  /** A representative photograph per mood, drawn from this island's own catalogue. */
  const moodTiles = useMemo(
    () =>
      MOODS.map((m) => {
        const match = experiences.find((e) => (m.categories as readonly string[]).includes(e.category));
        return { ...m, src: match ? heroUrl(match) : mediaUrl(island?.hero_media_path ?? undefined) };
      }),
    [experiences, island],
  );

  const nearby = useMemo(() => {
    if (!destination) return [];
    return byDistanceFrom(simulatedPosition(destination), ranked).slice(0, 6);
  }, [destination, ranked]);

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
        <button type="button" className="search-pill" onClick={() => setMood(null)}>
          <Icon name="search" size={17} color="var(--green-900)" strokeWidth={2} />
          <span className="grow t-caption c-muted">Search experiences, food, beaches</span>
          <Icon name="filter" size={17} color="var(--gold)" strokeWidth={2} />
        </button>
      </div>

      {/* ---------------- Mood ---------------- */}
      <section className="pad ex-moods">
        {moodTiles.map((m) => {
          const on = mood === m.id;
          return (
            <button
              key={m.id}
              type="button"
              className={`mood ${on ? 'mood--on' : ''}`}
              onClick={() => setMood(on ? null : m.id)}
              aria-pressed={on}
            >
              <Photo src={m.src} alt="" ratio="163 / 88" radius="var(--r-lg)" />
              <span className="mood__scrim" />
              <span className="mood__label">{m.label}</span>
              {on ? <span className="mood__flag t-micro-strong">PICKED</span> : null}
            </button>
          );
        })}
      </section>

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

      {/* ---------------- Hidden gems ---------------- */}
      {gems.length > 0 ? (
        <section className="pad ex-section">
          <SectionHeader title="Hidden Gems" />
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
          <article className="tonight">
            <div className="grow">
              <Badge tone="sand">7:30 PM · 3 tables left</Badge>
              <h3 className="t-display-sm c-on-dark tonight__title">{evening.title}</h3>
              <p className="t-micro tonight__sub">{evening.summary}</p>
            </div>
            <Photo
              src={heroUrl(evening)}
              mediaKey={evening.media[0]}
              alt=""
              ratio="1 / 1"
              radius="var(--r-md)"
              className="tonight__photo"
            />
          </article>
        </section>
      ) : null}

      <DemoNote>Demo inventory · sample pricing</DemoNote>
    </main>
  );
}

// ---------------------------------------------------------------------------

function FeatureCard({ experience }: { experience: DemoExperience }) {
  const { state, dispatch } = useStore();
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
          <span className="badge badge--brand feature__cta">View Experience</span>
        </div>
      </div>
    </Card>
  );
}

function NearCard({ experience, metres }: { experience: DemoExperience; metres: number }) {
  return (
    <Card className="near">
      <div className="near__media">
        <Photo src={heroUrl(experience)} mediaKey={experience.media[0]} alt={experience.title} ratio="206 / 112" radius="0" />
        <span className="near__flag">
          <Badge tone="plain">{walkMinutes(metres)} min away</Badge>
        </span>
      </div>
      <div className="near__body">
        <h3 className="t-caption-strong near__title">{experience.title}</h3>
        <p className="t-micro c-locator">
          {(metres / 1000).toFixed(1)} km · {metres < 1200 ? 'Walking distance' : 'Pickup available'}
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
  return (
    <article className="gem">
      <Photo src={heroUrl(experience)} mediaKey={experience.media[0]} alt={experience.title} ratio="163 / 132" radius="var(--r-lg)" />
      <span className="gem__scrim" />
      <div className="gem__body">
        <h3 className="t-micro-strong c-on-dark">{experience.title}</h3>
        <p className="gem__price">
          {`US$${Math.round(experience.fromAmountMinor / 100)}`} · Small group
        </p>
      </div>
    </article>
  );
}
