import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  EMPTY_FILTERS,
  SORT_LABELS,
  SORT_OPTIONS,
  activeFilterCount,
  searchAndSort,
  type ExperienceCategory,
  type SearchFilters,
  type SortOption,
} from '@cvip/types';
import {
  byDistanceFrom,
  destinationBySlug,
  experiencesFor,
  formatKm,
  heroUrl,
  islandById,
  simulatedPosition,
  travelFrom,
} from '../data/catalogue';
import { searchCandidates } from '../data/search';
import { useStore } from '../state/store';
import { Badge, Card, Chip, DemoNote, EmptyState, Photo, Price, Rating } from '../components/kit';
import { Icon } from '../components/Icon';
import './Search.css';

/**
 * Search — T-03.
 *
 * The rule this screen exists to exercise is that **search returns only active listings from
 * approved vendors**. That rule lives in `search_experiences()` and in the
 * `experiences_public_read` policy, and it is proven by `search.test.sql`; here it holds because
 * every candidate comes from `experiencesFor`, which goes through `visibleExperiences()` — the
 * mirror of that policy. A draft listing, or one under an unapproved vendor, cannot be found by
 * exact title, and the dataset carries one of each on purpose.
 *
 * ## Filtering happens here, not on a server
 *
 * With a backend, the filter predicates go to `search_experiences()` so a filtered search is a real
 * query rather than the first page re-filtered. There is no backend in the demo, so the same
 * predicates run in memory through `applyFilters`/`sortResults` in `@cvip/types` — the *same
 * functions* the server path would use, already covered by 27 unit tests. That is the whole reason
 * this screen could be rebuilt in an afternoon: none of its logic is new.
 *
 * ## It filters as you type
 *
 * The retired Expo screen searched on submit, because every keystroke would have been a round trip.
 * An island is about twenty listings held in memory, so waiting for a return key here buys nothing
 * and costs the guest the feedback that makes a search box feel like one. When a server is behind
 * this, submit-on-enter comes back with it.
 */

/** The broad cut, matching the chip row the design draws. Sort lives inside Filters, not here. */
const QUICK_FILTERS: { label: string; categories: ExperienceCategory[] }[] = [
  { label: 'All', categories: [] },
  { label: 'Adventure', categories: ['adventure', 'waterfalls', 'water_sports'] },
  { label: 'Food', categories: ['food'] },
  { label: 'Beach', categories: ['beaches'] },
  { label: 'Culture', categories: ['culture', 'day_trips'] },
  { label: 'Family', categories: ['family'] },
];

const PRICE_BANDS: { label: string; min?: number; max?: number }[] = [
  { label: 'Any price' },
  { label: 'Under US$50', max: 5000 },
  { label: 'US$50–100', min: 5000, max: 10000 },
  { label: 'US$100+', min: 10000 },
];

const DURATIONS: { label: string; max?: number }[] = [
  { label: 'Any length' },
  { label: 'Under 2 hours', max: 120 },
  { label: 'Half day', max: 300 },
  { label: 'Full day', max: 600 },
];

export function Search() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const island = islandById(state.islandId);
  const destination = destinationBySlug(state.destinationSlug);

  const [query, setQuery] = useState(params.get('q') ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(() => ({
    ...EMPTY_FILTERS,
    categories: (params.get('category') ? [params.get('category')] : []) as ExperienceCategory[],
  }));

  // A search screen that opens without focus makes the guest tap twice to do the one thing it is
  // for. Skipped when a category arrived in the URL, because then the screen already has an answer
  // on it and raising the keyboard would hide the results.
  useEffect(() => {
    if (!params.get('category')) inputRef.current?.focus();
  }, [params]);

  const origin = destination ? simulatedPosition(destination) : null;

  /** Distance is a real measurement here, so "nearest first" is offered rather than hidden. */
  const distances = useMemo(() => {
    if (!origin) return new Map<string, number>();
    return new Map(
      byDistanceFrom(origin, experiencesFor(state.islandId)).map((r) => [r.experience.id, r.metres]),
    );
  }, [origin?.lat, origin?.lng, state.islandId]);

  // `searchCandidates` is shared with `search.test.ts` on purpose — see the note on that function.
  const results = useMemo(
    () => searchAndSort(searchCandidates(state.islandId), { ...filters, query }),
    [state.islandId, filters, query],
  );

  const byId = useMemo(
    () => new Map(experiencesFor(state.islandId).map((e) => [e.id, e])),
    [state.islandId],
  );

  const filterCount = activeFilterCount(filters);
  const clearAll = () => {
    setFilters({ ...EMPTY_FILTERS, sort: filters.sort });
    setQuery('');
  };

  if (!island || !destination) return null;

  return (
    <main className="screen search">
      <header className="search__head">
        <button
          type="button"
          className="search__back"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <Icon name="chevron-left" size={18} strokeWidth={2.2} />
        </button>

        <div className="search__field">
          <Icon name="search" size={17} color="var(--green-900)" strokeWidth={2} />
          <input
            ref={inputRef}
            type="search"
            className="search__input t-caption"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search experiences, food, beaches"
            aria-label={`Search experiences in ${destination.name}`}
            enterKeyHint="search"
          />
          {query ? (
            <button
              type="button"
              className="search__clear"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Clear the search"
            >
              <Icon name="close" size={14} strokeWidth={2.4} />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className={`search__filter ${filterCount > 0 ? 'is-on' : ''}`}
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          aria-label={`Filters${filterCount > 0 ? `, ${filterCount} active` : ''}`}
        >
          <Icon
            name="filter"
            size={17}
            strokeWidth={2.2}
            color={filterCount > 0 ? 'var(--on-dark)' : undefined}
          />
          {filterCount > 0 ? <span className="search__filter-count t-micro-strong">{filterCount}</span> : null}
        </button>
      </header>

      <div className="rail search__chips">
        {QUICK_FILTERS.map((f) => {
          const selected =
            f.categories.length === 0
              ? filters.categories.length === 0
              : f.categories.length === filters.categories.length &&
                f.categories.every((c) => filters.categories.includes(c));
          return (
            <Chip
              key={f.label}
              selected={selected}
              onClick={() => setFilters({ ...filters, categories: f.categories })}
            >
              {f.label}
            </Chip>
          );
        })}
      </div>

      {filtersOpen ? (
        <FilterPanel filters={filters} onChange={setFilters} onClear={clearAll} />
      ) : null}

      {results.length > 0 ? (
        // The design names the place in the count, which is what makes the number mean something:
        // "14 results" is trivia, "14 results in Ocho Rios" is an answer.
        <p className="pad t-caption c-muted search__count" aria-live="polite">
          {results.length} {results.length === 1 ? 'result' : 'results'} in {destination.name}
          {filters.sort !== 'recommended' ? ` · ${SORT_LABELS[filters.sort].toLowerCase()}` : ''}
        </p>
      ) : null}

      {results.length === 0 ? (
        <EmptyState
          icon="search"
          title="No matches"
          body={
            filterCount > 0
              ? 'Nothing matches all of these filters at once. Try removing one.'
              : query
                ? `Nothing in ${destination.name} matched “${query}”. Try a broader word.`
                : `Nothing to show in ${destination.name} yet.`
          }
          {...(filterCount > 0 || query ? { action: 'Clear search', onAction: clearAll } : {})}
        />
      ) : (
        <section className="pad search__list">
          <div className="col" style={{ gap: 12 }}>
            {results.map((r) => {
              const experience = byId.get(r.id);
              if (!experience) return null;
              const metres = distances.get(experience.id);
              const travel = metres !== undefined ? travelFrom(metres) : null;
              return (
                <Card
                  key={experience.id}
                  className="result-row"
                  label={experience.title}
                  onClick={() => navigate(`/experience/${experience.id}`)}
                >
                  <div className="row result-row__inner">
                    <Photo
                      src={heroUrl(experience)}
                      mediaKey={experience.media[0]}
                      alt={experience.title}
                      ratio="1 / 1"
                      radius="var(--r-md)"
                      className="result-row__photo"
                    />
                    <div className="grow">
                      {/*
                        Distance is a tag here, not the headline it is on Nearby.
                        Leading the card with "167 MIN DRIVE" in the locator colour reads as a
                        promise that the list is ordered by distance — and it is ordered by whatever
                        the guest chose, which is recommendation by default. Same fact, correct
                        weight.
                      */}
                      <h3 className="t-caption-strong result-row__title">{experience.title}</h3>
                      <div className="result-row__tags">
                        <Badge tone="muted">{durationLabel(experience.durationMinutes)}</Badge>
                        {travel && metres !== undefined ? (
                          <span className="row result-row__dist t-micro c-locator">
                            <Icon
                              name={travel.mode === 'walk' ? 'walk' : 'car'}
                              size={12}
                              color="var(--teal-text)"
                              strokeWidth={2}
                            />
                            {formatKm(metres)}
                          </span>
                        ) : null}
                        <Rating average={experience.ratingAverage} compact />
                      </div>
                      <div className="row result-row__foot">
                        <Price minor={experience.fromAmountMinor} />
                        <span className="badge badge--brand result-row__cta">View</span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <DemoNote>Demo inventory · sample pricing</DemoNote>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * Sort lives in here rather than beside the chips.
 *
 * The design puts one row of chips under the field and that row is the category cut. A second row
 * competing with it for the same space is how a search screen starts to look like a settings page.
 */
function FilterPanel({
  filters,
  onChange,
  onClear,
}: {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  onClear: () => void;
}) {
  const setBand = (min?: number, max?: number) => {
    const next = { ...filters };
    if (min === undefined) delete next.minPriceMinor;
    else next.minPriceMinor = min;
    if (max === undefined) delete next.maxPriceMinor;
    else next.maxPriceMinor = max;
    onChange(next);
  };

  const setDuration = (max?: number) => {
    const next = { ...filters };
    if (max === undefined) delete next.maxDurationMinutes;
    else next.maxDurationMinutes = max;
    onChange(next);
  };

  return (
    <div className="pad">
      <section className="filters">
        <FilterGroup label="Sort by">
          {/* Distance is offered because the distances on these cards are real measurements from
              the destination centre — not a placeholder that would sort by nothing. */}
          {SORT_OPTIONS.map((option: SortOption) => (
            <button
              key={option}
              type="button"
              className={`filter-chip ${filters.sort === option ? 'is-on' : ''}`}
              aria-pressed={filters.sort === option}
              onClick={() => onChange({ ...filters, sort: option })}
            >
              {SORT_LABELS[option]}
            </button>
          ))}
        </FilterGroup>

        <FilterGroup label="Price">
          {PRICE_BANDS.map((b) => {
            const on = filters.minPriceMinor === b.min && filters.maxPriceMinor === b.max;
            return (
              <button
                key={b.label}
                type="button"
                className={`filter-chip ${on ? 'is-on' : ''}`}
                aria-pressed={on}
                onClick={() => setBand(b.min, b.max)}
              >
                {b.label}
              </button>
            );
          })}
        </FilterGroup>

        <FilterGroup label="Duration">
          {DURATIONS.map((d) => {
            const on = filters.maxDurationMinutes === d.max;
            return (
              <button
                key={d.label}
                type="button"
                className={`filter-chip ${on ? 'is-on' : ''}`}
                aria-pressed={on}
                onClick={() => setDuration(d.max)}
              >
                {d.label}
              </button>
            );
          })}
        </FilterGroup>

        <button type="button" className="t-micro-strong c-locator filters__clear" onClick={onClear}>
          Clear everything
        </button>
      </section>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="filter-group">
      <p className="t-micro c-faint filter-group__label">{label.toUpperCase()}</p>
      <div className="filter-group__row">{children}</div>
    </div>
  );
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h} hour${h === 1 ? '' : 's'}`;
}
