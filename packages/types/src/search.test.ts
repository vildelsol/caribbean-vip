import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  activeFilterCount,
  applyFilters,
  hasActiveFilters,
  searchAndSort,
  searchFiltersSchema,
  sortResults,
  type SearchableExperience,
} from './search.ts';
import { boundsFor, distanceMetres, formatDistance, isWithinRadius } from './geo.ts';

const OCHO_RIOS = { lat: 18.4074, lng: -77.103 };
const MONTEGO_BAY = { lat: 18.4762, lng: -77.8939 };

function item(over: Partial<SearchableExperience> = {}): SearchableExperience {
  return {
    id: 'e1',
    title: 'Dunn\'s River Falls Climb',
    summary: 'Climb the terraced falls with a guide.',
    category: 'waterfalls',
    fromAmountMinor: 6500,
    durationMinutes: 180,
    destinationId: 'd1',
    islandId: 'i1',
    coordinates: OCHO_RIOS,
    ...over,
  };
}

describe('distance', () => {
  it('is zero for the same point', () => {
    expect(distanceMetres(OCHO_RIOS, OCHO_RIOS)).toBe(0);
  });

  it('matches the known Ocho Rios → Montego Bay great-circle distance', () => {
    // ~84 km along the north coast. Tolerance is generous; the point is to catch a broken
    // formula (degrees/radians, swapped lat/lng), not to validate geodesy to the metre.
    const d = distanceMetres(OCHO_RIOS, MONTEGO_BAY);
    expect(d).toBeGreaterThan(80_000);
    expect(d).toBeLessThan(88_000);
  });

  it('is symmetric', () => {
    expect(distanceMetres(OCHO_RIOS, MONTEGO_BAY)).toBeCloseTo(
      distanceMetres(MONTEGO_BAY, OCHO_RIOS),
      6,
    );
  });

  it('handles antipodal points without NaN from floating-point drift', () => {
    const d = distanceMetres({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(20_000_000);
  });

  it('decides radius membership at the boundary', () => {
    const centre = OCHO_RIOS;
    const d = distanceMetres(centre, MONTEGO_BAY);
    expect(isWithinRadius(MONTEGO_BAY, centre, d + 1)).toBe(true);
    expect(isWithinRadius(MONTEGO_BAY, centre, d - 1)).toBe(false);
    expect(isWithinRadius(centre, centre, 0)).toBe(true);
    expect(isWithinRadius(MONTEGO_BAY, centre, -100)).toBe(false);
  });
});

describe('formatDistance', () => {
  it('never implies more precision than a consumer GPS fix has', () => {
    expect(formatDistance(40)).toBe('right here');
    // Rounded to 50 m, not "487 m".
    expect(formatDistance(487)).toBe('500 m away');
    expect(formatDistance(1500)).toBe('1.5 km away');
    expect(formatDistance(42_000)).toBe('42 km away');
  });

  it('supports imperial', () => {
    expect(formatDistance(1609, 'imperial')).toBe('1.0 mi away');
    expect(formatDistance(100, 'imperial')).toBe('right here');
  });

  it('returns an empty string rather than NaN for bad input', () => {
    expect(formatDistance(Number.NaN)).toBe('');
    expect(formatDistance(-5)).toBe('');
  });
});

describe('boundsFor', () => {
  it('returns null for no points, so the caller falls back to a default view', () => {
    expect(boundsFor([])).toBeNull();
  });

  it('contains every point', () => {
    const b = boundsFor([OCHO_RIOS, MONTEGO_BAY]);
    expect(b).not.toBeNull();
    if (!b) return;
    for (const p of [OCHO_RIOS, MONTEGO_BAY]) {
      expect(p.lat).toBeLessThanOrEqual(b.north);
      expect(p.lat).toBeGreaterThanOrEqual(b.south);
      expect(p.lng).toBeLessThanOrEqual(b.east);
      expect(p.lng).toBeGreaterThanOrEqual(b.west);
    }
  });

  it('clamps to legal latitudes when padding a pole', () => {
    const b = boundsFor([{ lat: 89.999, lng: 0 }], 1);
    expect(b?.north).toBeLessThanOrEqual(90);
  });
});

describe('filters', () => {
  // Distinct summaries on purpose: the free-text test must distinguish a title match from a
  // summary match, which a shared default summary would hide.
  const items = [
    item({ id: 'a', title: 'Waterfall Climb', summary: 'Terraced falls with a guide.', category: 'waterfalls', fromAmountMinor: 6500, durationMinutes: 180 }),
    item({ id: 'b', title: 'Catamaran Cruise', summary: 'Sail the coast and snorkel.', category: 'water_sports', fromAmountMinor: 8900, durationMinutes: 210, coordinates: MONTEGO_BAY }),
    item({ id: 'c', title: 'Beach Yoga', summary: 'Vinyasa on the sand at sunrise.', category: 'wellness', fromAmountMinor: 3200, durationMinutes: 90 }),
  ];

  it('matches free text against title and summary', () => {
    expect(applyFilters(items, { ...EMPTY_FILTERS, query: 'catamaran' }).map((i) => i.id)).toEqual(['b']);
    expect(applyFilters(items, { ...EMPTY_FILTERS, query: 'CLIMB' }).map((i) => i.id)).toEqual(['a']);
  });

  it('matches text found only in the summary, not just the title', () => {
    expect(applyFilters(items, { ...EMPTY_FILTERS, query: 'snorkel' }).map((i) => i.id)).toEqual([
      'b',
    ]);
  });

  it('filters by category', () => {
    const r = applyFilters(items, { ...EMPTY_FILTERS, categories: ['wellness', 'waterfalls'] });
    expect(r.map((i) => i.id).sort()).toEqual(['a', 'c']);
  });

  it('filters by price band inclusively', () => {
    const r = applyFilters(items, { ...EMPTY_FILTERS, minPriceMinor: 3200, maxPriceMinor: 6500 });
    expect(r.map((i) => i.id).sort()).toEqual(['a', 'c']);
  });

  it('filters by maximum duration', () => {
    expect(
      applyFilters(items, { ...EMPTY_FILTERS, maxDurationMinutes: 120 }).map((i) => i.id),
    ).toEqual(['c']);
  });

  it('excludes items of unknown location from a distance filter rather than keeping them', () => {
    const withUnknown = [...items, item({ id: 'd', coordinates: null })];
    const r = applyFilters(
      withUnknown,
      { ...EMPTY_FILTERS, maxDistanceMetres: 5000 },
      OCHO_RIOS,
    );
    expect(r.map((i) => i.id)).not.toContain('d');
    expect(r.map((i) => i.id)).not.toContain('b'); // Montego Bay is ~84 km away
  });

  it('computes distance only when an origin is supplied', () => {
    expect(applyFilters(items, EMPTY_FILTERS)[0]?.distanceMetres).toBeUndefined();
    expect(applyFilters(items, EMPTY_FILTERS, OCHO_RIOS)[0]?.distanceMetres).toBeDefined();
  });

  it('counts active filters for the UI badge, ignoring free text', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, query: 'beach' })).toBe(0);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: 'beach' })).toBe(true);
    expect(
      activeFilterCount({ ...EMPTY_FILTERS, categories: ['food'], maxDurationMinutes: 90 }),
    ).toBe(2);
  });

  it('rejects an inverted price band at the schema level', () => {
    const r = searchFiltersSchema.safeParse({ minPriceMinor: 9000, maxPriceMinor: 100 });
    expect(r.success).toBe(false);
  });

  it('has no approval-status filter — that is RLS, not a client option (T-03)', () => {
    const parsed = searchFiltersSchema.parse({});
    expect(Object.keys(parsed)).not.toContain('status');
    expect(Object.keys(parsed)).not.toContain('includeDrafts');
  });
});

describe('sorting', () => {
  const items = [
    item({ id: 'a', title: 'B title', fromAmountMinor: 5000, durationMinutes: 200, rating: 4.5, reviewCount: 10 }),
    item({ id: 'b', title: 'A title', fromAmountMinor: 5000, durationMinutes: 100, rating: 4.5, reviewCount: 50 }),
    item({ id: 'c', title: 'C title', fromAmountMinor: 1000, durationMinutes: 300, rating: 3.0, reviewCount: 5 }),
  ];

  it('sorts by price ascending and descending', () => {
    expect(sortResults(items, 'price_low_high')[0]?.id).toBe('c');
    expect(sortResults(items, 'price_high_low')[0]?.fromAmountMinor).toBe(5000);
  });

  it('breaks ties by title so the order is stable across renders', () => {
    const r = sortResults(items, 'price_low_high').map((i) => i.id);
    // a and b are both 5000; 'A title' must come before 'B title' every time.
    expect(r).toEqual(['c', 'b', 'a']);
    expect(sortResults(items, 'price_low_high').map((i) => i.id)).toEqual(r);
  });

  it('sorts unknown distances last instead of treating them as zero', () => {
    const mixed = [
      { ...item({ id: 'far' }), distanceMetres: 9000 },
      { ...item({ id: 'unknown' }) },
      { ...item({ id: 'near' }), distanceMetres: 100 },
    ];
    expect(sortResults(mixed, 'distance').map((i) => i.id)).toEqual(['near', 'far', 'unknown']);
  });

  it('ranks "recommended" by rating, then review count, then price', () => {
    // b and a share a rating; b has more reviews, so it wins.
    expect(sortResults(items, 'recommended').map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate the input array', () => {
    const original = [...items];
    sortResults(items, 'price_high_low');
    expect(items).toEqual(original);
  });
});

describe('searchAndSort', () => {
  it('filters then sorts, in that order', () => {
    const items = [
      item({ id: 'a', title: 'Beach Yoga', category: 'wellness', fromAmountMinor: 9000 }),
      item({ id: 'b', title: 'Beach Day Pass', category: 'beaches', fromAmountMinor: 3000 }),
      item({ id: 'c', title: 'Coffee Tour', category: 'food', fromAmountMinor: 1000 }),
    ];
    const r = searchAndSort(items, { ...EMPTY_FILTERS, query: 'beach', sort: 'price_low_high' });
    expect(r.map((i) => i.id)).toEqual(['b', 'a']);
  });
});
