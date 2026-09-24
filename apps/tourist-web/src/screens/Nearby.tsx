import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  byDistanceFrom,
  destinationBySlug,
  experiencesFor,
  heroUrl,
  islandById,
  travelFrom,
  isWalkable,
  isAtVenue,
  formatKm,
} from '../data/catalogue';
import { availabilityLabel } from '../data/availability';
import { useStore } from '../state/store';
import { useGuestPosition } from '../state/useGuestPosition';
import { LocationBar } from '../components/LocationBar';
import { Badge, Card, Chip, Photo, Price, SectionHeader } from '../components/kit';
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

/**
 * One hue per filter, taken from `CAT_COLORS` in Explore.
 *
 * Nearby's five filters are coarser than Explore's twelve categories — its
 * "Adventure" covers adventure, waterfalls and water sports — so each takes the
 * colour of the category it leads with, which is the one a guest pictures when
 * they read the word.
 */
const FILTER_COLORS: Record<string, string | undefined> = {
  All: undefined,
  Adventure: '#17683D',
  Food: '#B04E1C',
  Beach: '#0E7490',
  Culture: '#9E2F27',
};

const CATEGORY_FOR: Record<string, string[]> = {
  Adventure: ['adventure', 'waterfalls', 'water_sports'],
  Food: ['food'],
  Beach: ['beaches'],
  Culture: ['culture', 'day_trips'],
};

export function Nearby() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>('All');
  const [selected, setSelected] = useState<string | null>(null);
  const [mapView, setMapView] = useState(true);

  /*
   * A tap on a listing opens that listing.
   *
   * This used to intercept the first tap on *any* card and navigate to the geofenced offer
   * instead — a way of guaranteeing the offer appeared in a demonstration. It guaranteed something
   * else too: a guest who asked for White River Tubing was handed a rum-punch voucher for a jetty
   * in another parish, and the control they pressed did not do what it said. The offer has its own
   * trigger in `Explore`, which is proximity, and that is the only thing that should raise it.
   */
  const navigateToExperience = (experienceId: string) => {
    navigate(`/experience/${experienceId}`);
  };

  const island = islandById(state.islandId);
  const destination = destinationBySlug(state.destinationSlug);

  /**
   * Real position where it is available and plausible, the destination centre otherwise.
   *
   * Every distance below is measured from `guest.position.coordinates`, and `LocationBar` names
   * which of the two it is — so the numbers on this screen are never a claim the app cannot keep.
   */
  const guest = useGuestPosition();
  const origin = guest.position.coordinates;

  const results = useMemo(() => {
    if (!destination) return [];
    const all = experiencesFor(state.islandId);
    const cats = CATEGORY_FOR[filter];
    const subset = cats ? all.filter((e) => cats.includes(e.category)) : all;
    return byDistanceFrom(origin, subset);
  }, [state.islandId, destination, filter, origin.lat, origin.lng]);

  const chosen = results.find((r) => r.experience.id === selected) ?? results[0];

  if (!island || !destination) return null;

  return (
    <main className="screen">
      {/* Search bar always visible */}
      <div className="nearby-search-bar pad">
        <div className="nearby-search">
          <Icon name="search" size={17} color="var(--green-900)" strokeWidth={2} />
          <span className="grow t-caption-strong">
            {destination.name} · 5 km radius
          </span>
          <span className="t-micro-strong c-locator">{results.length} FOUND</span>
        </div>
      </div>

      {/*
        One header for both views.
        The filters used to be absolutely positioned over the map with `right: 80px`
        reserved for the toggle, which is narrower than the toggle actually is — so the
        chip rail scrolled underneath it and sliced a label mid-word with nothing to say
        it had. The list view meanwhile laid the same two controls out as flex siblings
        and had no such problem. They are peers — a mode switch and a query refinement —
        so they share one row here and the collision cannot be reintroduced by a width,
        a longer word or a larger font.
      */}
      <div className="nearby-header">
        <div className="nearby-filters-bar" role="group" aria-label="Filter experiences">
          {FILTERS.map((f) => (
            <Chip
              key={f}
              selected={filter === f}
              onClick={() => setFilter(f)}
              dotColor={FILTER_COLORS[f]}
            >
              {f === 'All' ? `All ${results.length}` : f}
            </Chip>
          ))}
        </div>
        <div className="nearby-view-toggle" role="group" aria-label="Map or list view">
          <button
            type="button"
            className={`map-toggle ${mapView ? 'map-toggle--on' : ''}`}
            onClick={() => setMapView(true)}
            aria-pressed={mapView}
          >
            Map
          </button>
          <button
            type="button"
            className={`map-toggle ${mapView ? '' : 'map-toggle--on'}`}
            onClick={() => setMapView(false)}
            aria-pressed={!mapView}
          >
            List
          </button>
        </div>
      </div>

      {mapView ? (
        /* ---- Map view ---- */
        <div className="nearby-map" role="img" aria-label={`Stylised map of ${destination.name} showing ${results.length} experiences`}>
          <span className="nearby-map__water" />
          <span className="nearby-map__land" />
          <span className="nearby-map__green" />
          <span className="nearby-map__road nearby-map__road--a" />
          <span className="nearby-map__road nearby-map__road--b" />

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
      ) : null}

      <LocationBar guest={guest} destinationName={destination.name} />


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
                      {isAtVenue(metres)
                        ? "YOU'RE HERE"
                        : `${travel.minutes} MIN ${travel.mode.toUpperCase()} · ${formatKm(metres).toUpperCase()}`}
                    </p>
                    <h3 className="t-card-title near-row__title">{experience.title}</h3>
                    <div className="near-row__tags">
                      <Badge tone="aqua">
                        {isAtVenue(metres)
                          ? 'At this operator'
                          : isWalkable(metres)
                            ? 'Walking distance'
                            : 'Pickup available'}
                      </Badge>
                      {/*
                        * This said "Starts in 90 min" on every row, on every
                        * listing, always — the same fabrication that "Open Now"
                        * was on Explore, sitting next to a real distance and a
                        * real price so it read as fact. `availabilityLabel` is
                        * derived from the actual slot data and returns null when
                        * nothing is bookable, in which case no badge appears
                        * rather than a reassuring guess.
                        */}
                      {availabilityLabel(experience) ? (
                        <Badge tone="sand">{availabilityLabel(experience)}</Badge>
                      ) : null}
                    </div>
                    <div className="row near-row__foot">
                      <Price minor={experience.fromAmountMinor} />
                      {/*
                        * The rating was missing entirely. Every other surface in
                        * the app that lists an experience carries it, and on a
                        * screen sorted by *distance* it is the only thing
                        * telling you whether the nearest is also worth the walk.
                        */}
                      <span className="near-row__rating t-micro-strong">
                        <Icon name="star" size={12} color="var(--gold)" />
                        {experience.ratingAverage.toFixed(1)}
                      </span>
                      {/*
                        * A "View" badge used to sit here. The whole card is the
                        * target, so it was a button-shaped thing that was not a
                        * button, competing with the real one — and it pushed the
                        * price and the rating into half the width they needed.
                        */}
                      <Icon
                        name="chevron-right"
                        size={17}
                        color="var(--ink-faint)"
                        strokeWidth={2.2}
                        className="near-row__go"
                      />
                    </div>
                  </div>
                </div>
              </Card>
              );
            })}
          </div>
        )}
      </section>

    </main>
  );
}
