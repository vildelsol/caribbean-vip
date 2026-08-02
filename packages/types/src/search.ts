/**
 * Search filters and sorting — T-03.
 *
 * The filter shape is defined once and shared: the mobile UI builds it, the database query
 * consumes it, and the pure `applyFilters`/`sortResults` below let both be tested without a
 * database. Approval status is deliberately NOT a filter here — that is enforced by RLS (AD-10),
 * and offering it as a client-supplied option would invite someone to pass `includeDrafts`.
 */

import { z } from 'zod';
import { EXPERIENCE_CATEGORIES, type ExperienceCategory } from './domain';
import { distanceMetres, type Coordinates } from './geo';

export const SORT_OPTIONS = [
  'recommended',
  'price_low_high',
  'price_high_low',
  'duration_short_long',
  'distance',
  'rating',
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];
export const sortOptionSchema = z.enum(SORT_OPTIONS);

export const SORT_LABELS: Record<SortOption, string> = {
  recommended: 'Recommended',
  price_low_high: 'Price: low to high',
  price_high_low: 'Price: high to low',
  duration_short_long: 'Duration: shortest first',
  distance: 'Distance: nearest first',
  rating: 'Rating: highest first',
};

export const searchFiltersSchema = z
  .object({
    /** Free text. Matched server-side against title, summary and description. */
    query: z.string().trim().max(200).default(''),
    islandId: z.string().uuid().optional(),
    destinationId: z.string().uuid().optional(),
    categories: z.array(z.enum(EXPERIENCE_CATEGORIES)).default([]),
    /** Inclusive bounds in minor units, against the listing's "from" price. */
    minPriceMinor: z.number().int().nonnegative().optional(),
    maxPriceMinor: z.number().int().nonnegative().optional(),
    maxDurationMinutes: z.number().int().positive().optional(),
    /** Only meaningful when the user has shared a location; ignored otherwise. */
    maxDistanceMetres: z.number().positive().optional(),
    sort: sortOptionSchema.default('recommended'),
  })
  .refine(
    (f) => f.minPriceMinor === undefined || f.maxPriceMinor === undefined || f.minPriceMinor <= f.maxPriceMinor,
    { message: 'Minimum price cannot exceed maximum price', path: ['minPriceMinor'] },
  );

export type SearchFilters = z.infer<typeof searchFiltersSchema>;

export const EMPTY_FILTERS: SearchFilters = {
  query: '',
  categories: [],
  sort: 'recommended',
};

/** The subset of an experience the filter and sort logic needs. */
export interface SearchableExperience {
  id: string;
  title: string;
  summary: string | null;
  category: ExperienceCategory;
  fromAmountMinor: number;
  durationMinutes: number;
  destinationId: string;
  islandId: string;
  coordinates?: Coordinates | null;
  rating?: number | null;
  reviewCount?: number;
}

export interface RankedExperience extends SearchableExperience {
  /** Present only when an origin was supplied. */
  distanceMetres?: number;
}

/** How many filters the user has actively applied — drives the "Filters (3)" badge. */
export function activeFilterCount(filters: SearchFilters): number {
  let n = 0;
  if (filters.categories.length > 0) n += 1;
  if (filters.minPriceMinor !== undefined || filters.maxPriceMinor !== undefined) n += 1;
  if (filters.maxDurationMinutes !== undefined) n += 1;
  if (filters.maxDistanceMetres !== undefined) n += 1;
  if (filters.destinationId) n += 1;
  return n;
}

export function hasActiveFilters(filters: SearchFilters): boolean {
  return activeFilterCount(filters) > 0 || filters.query.length > 0;
}

/**
 * Apply filters in memory.
 *
 * The server applies the same predicates for the initial query; this exists so the UI can refine
 * an already-fetched list without a round trip, and so the semantics are unit-testable. The two
 * must agree — a mismatch shows up as results that flicker when a filter is toggled.
 */
export function applyFilters(
  items: readonly SearchableExperience[],
  filters: SearchFilters,
  origin?: Coordinates | null,
): RankedExperience[] {
  const q = filters.query.trim().toLowerCase();

  return items
    .map((item) => {
      const withDistance: RankedExperience = { ...item };
      if (origin && item.coordinates) {
        withDistance.distanceMetres = distanceMetres(origin, item.coordinates);
      }
      return withDistance;
    })
    .filter((item) => {
      if (q) {
        const haystack = `${item.title} ${item.summary ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.islandId && item.islandId !== filters.islandId) return false;
      if (filters.destinationId && item.destinationId !== filters.destinationId) return false;
      if (filters.categories.length > 0 && !filters.categories.includes(item.category)) return false;
      if (filters.minPriceMinor !== undefined && item.fromAmountMinor < filters.minPriceMinor) {
        return false;
      }
      if (filters.maxPriceMinor !== undefined && item.fromAmountMinor > filters.maxPriceMinor) {
        return false;
      }
      if (
        filters.maxDurationMinutes !== undefined &&
        item.durationMinutes > filters.maxDurationMinutes
      ) {
        return false;
      }
      if (filters.maxDistanceMetres !== undefined) {
        // A distance filter with no known distance excludes the item rather than silently
        // keeping it — otherwise "within 2 km" would return things of unknown location.
        if (item.distanceMetres === undefined) return false;
        if (item.distanceMetres > filters.maxDistanceMetres) return false;
      }
      return true;
    });
}

/**
 * Sort results.
 *
 * Every comparator falls back to title, so the order is total and stable: two listings at the same
 * price must not swap places between renders.
 *
 * PRD §2 defers machine-learned ranking, so `recommended` is a transparent, explainable heuristic
 * — rating first, then reviews, then price — not a model.
 */
export function sortResults(
  items: readonly RankedExperience[],
  sort: SortOption,
): RankedExperience[] {
  const byTitle = (a: RankedExperience, b: RankedExperience) => a.title.localeCompare(b.title);

  const copy = [...items];

  switch (sort) {
    case 'price_low_high':
      return copy.sort((a, b) => a.fromAmountMinor - b.fromAmountMinor || byTitle(a, b));
    case 'price_high_low':
      return copy.sort((a, b) => b.fromAmountMinor - a.fromAmountMinor || byTitle(a, b));
    case 'duration_short_long':
      return copy.sort((a, b) => a.durationMinutes - b.durationMinutes || byTitle(a, b));
    case 'distance':
      // Items with no known distance sort last rather than being treated as distance 0.
      return copy.sort((a, b) => {
        const da = a.distanceMetres ?? Number.POSITIVE_INFINITY;
        const db = b.distanceMetres ?? Number.POSITIVE_INFINITY;
        return da - db || byTitle(a, b);
      });
    case 'rating':
      return copy.sort(
        (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0) || byTitle(a, b),
      );
    case 'recommended':
      return copy.sort(
        (a, b) =>
          (b.rating ?? 0) - (a.rating ?? 0) ||
          (b.reviewCount ?? 0) - (a.reviewCount ?? 0) ||
          a.fromAmountMinor - b.fromAmountMinor ||
          byTitle(a, b),
      );
  }
}

export function searchAndSort(
  items: readonly SearchableExperience[],
  filters: SearchFilters,
  origin?: Coordinates | null,
): RankedExperience[] {
  return sortResults(applyFilters(items, filters, origin), filters.sort);
}
