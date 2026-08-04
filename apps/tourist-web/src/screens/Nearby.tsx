import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  byDistanceFrom,
  destinationBySlug,
  experiencesFor,
  heroUrl,
  islandById,
  simulatedPosition,
  travelFrom,
  isWalkable,
  formatKm,
} from '../data/catalogue';
import { useStore } from '../state/store';
import { Badge, Card, Chip, DemoNote, Photo, Price, SectionHeader } from '../components/kit';
import { Icon } from '../components/Icon';
import './Nearby.css';

/**
 * Nearby — proximity and timing.
 *
 * The design's map is drawn as abstract shapes rather than map tiles, and that is what makes this
 * screen buildable at all: OD-05 (which maps provider) is still an open decision, so there is no
 * key, no tile bill and no attribution requirement. It is also why the notice below is not
 * optional — the shapes show *relative* position, not geography, and a stylised map that is not
 * labelled as one is simply a wrong map.
 *
 * Distances are real. They come from `distanceMetres` in `@cvip/types` over the vendors' actual
 * coordinates, measured from the centre of the selected destination.
 */

const FILTERS = ['All', 'Adventure', 'Food', 'Beach', 'Culture'] as const;

const CATEGORY_FOR: Record<string, string[]> = {
  Adventure: ['adventure', 'waterfalls', 'water_sports'],
  Food: ['food'],
  Beach: ['beaches'],
  Culture: ['culture', 'day_trips'],
};

export function Nearby() {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>('All');
  const [selected, setSelected] = useState<string | null>(null);

  const offerPending = !state.offerShownForIslands.includes(state.islandId);

  const navigateToExperience = (experienceId: string) => {
    if (offerPending) {
      dispatch({ type: 'markOfferShown', islandId: state.islandId });
      navigate('/offer');
    } else {
      navigate(`/experience/${experienceId}`);
    }
  };

  const island = islandById(state.islandId);
  const destination = destinationBySlug(state.destinationSlug);

  const results = useMemo(() => {
    if (!destination) return [];
    const all = experiencesFor(state.islandId);
    const cats = CATEGORY_FOR[filter];
    const subset = cats ? all.filter((e) => cats.includes(e.category)) : all;
    return byDistanceFrom(simulatedPosition(destination), subset);
  }, [state.islandId, destination, filter]);

  const chosen = results.find((r) => r.experience.id === selected) ?? results[0];

  if (!island || !destination) return null;

  return (
    <main className="screen">
      <div className="nearby-map" role="img" aria-label={`Stylised map of ${destination.name} showing ${results.length} experiences`}>
        <span className="nearby-map__water" />
        <span className="nearby-map__land" />
        <span className="nearby-map__green" />
        <span className="nearby-map__road nearby-map__road--a" />
        <span className="nearby-map__road nearby-map__road--b" />

        {/* Proximity rings, centred on the guest. */}
        <span className="ring ring--3" />
        <span className="ring ring--2" />
        <span className="ring ring--1" />
        <span className="you" />
        <span className="you__label t-micro-strong">You are here</span>
        <span className="ring__scale t-micro">1 KM</span>

        {results.slice(0, 4).map(({ experience, metres }, i) => (
          <button
            key={experience.id}
            type="button"
            className={`map-pin map-pin--${i} ${chosen?.experience.id === experience.id ? 'is-on' : ''}`}
            onClick={() => setSelected(experience.id)}
            aria-label={`${experience.title}, ${formatKm(metres)} away`}
          >
            <span className="t-micro-strong">{`US$${Math.round(experience.fromAmountMinor / 100)}`}</span>
            <span className="map-pin__name">{experience.title.split(' ').slice(0, 2).join(' ')}</span>
          </button>
        ))}
      </div>

      <div className="nearby-head pad">
        <div className="nearby-search">
          <Icon name="search" size={17} color="var(--green-900)" strokeWidth={2} />
          <span className="grow t-caption-strong">
            {destination.name} · 5 km radius
          </span>
          <span className="t-micro-strong c-locator">{results.length} FOUND</span>
        </div>
        <div className="nearby-filters">
          {FILTERS.map((f) => (
            <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>
              {f}
            </Chip>
          ))}
        </div>
      </div>

      <p className="nearby-notice t-micro">
        <Icon name="pin" size={13} color="var(--teal-text)" />
        Stylised map — it shows relative position and distance, not geography. Live mapping is not
        part of this demonstration.
      </p>

      <section className="pad nearby-list">
        <SectionHeader title="Closest to you" />
        {results.length === 0 ? (
          <p className="t-caption c-muted">Nothing in this category near {destination.name}.</p>
        ) : (
          <div className="col" style={{ gap: 12 }}>
            {results.map(({ experience, metres }) => {
              const travel = travelFrom(metres);
              return (
              <Card
                key={experience.id}
                className="near-row"
                label={experience.title}
                onClick={() => navigateToExperience(experience.id)}
              >
                <div className="row near-row__inner">
                  <Photo
                    src={heroUrl(experience)}
                    mediaKey={experience.media[0]}
                    alt={experience.title}
                    ratio="1 / 1"
                    radius="var(--r-md)"
                    className="near-row__photo"
                  />
                  <div className="grow">
                    <p className="t-micro-strong c-locator near-row__dist">
                      {travel.minutes} MIN {travel.mode.toUpperCase()} · {formatKm(metres).toUpperCase()}
                    </p>
                    <h3 className="t-caption-strong near-row__title">{experience.title}</h3>
                    <div className="near-row__tags">
                      <Badge tone="aqua">{isWalkable(metres) ? 'Walking distance' : 'Pickup available'}</Badge>
                      <Badge tone="sand">Starts in 90 min</Badge>
                    </div>
                    <div className="row near-row__foot">
                      <Price minor={experience.fromAmountMinor} />
                      <span className="badge badge--brand near-row__cta">View</span>
                    </div>
                  </div>
                </div>
              </Card>
              );
            })}
          </div>
        )}
      </section>

      <DemoNote>Demo inventory · simulated position</DemoNote>
    </main>
  );
}
