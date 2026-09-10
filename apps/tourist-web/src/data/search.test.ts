import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, searchAndSort, type SearchableExperience } from '@cvip/types';
import { DEMO_EXPERIENCES, isPubliclyVisibleDemo } from '@cvip/demo';
import { experiencesFor, visibleExperiences, ISLANDS } from './catalogue';
import { searchCandidates } from './search';

/**
 * What the Search screen may return — T-03.
 *
 * `search.test.sql` proves the rule in the database and `search.test.ts` in `@cvip/types` proves
 * the filter and sort logic. Neither covers the join between them: that the *screen* feeds
 * `searchAndSort` from `visibleExperiences()` and not from the raw dataset. That join is one line
 * in `Search.tsx`, it is exactly the line a later refactor would "simplify", and getting it wrong
 * publishes a draft listing to every guest.
 *
 * So this tests the screen's own query construction, without rendering it — the same candidate set
 * the screen builds, put through the same function the screen calls.
 */

/**
 * The screen's own candidate set — imported, not re-implemented.
 *
 * A test that rebuilt this mapping would keep passing while `Search.tsx` searched something else,
 * which is the one failure this file exists to prevent.
 */
const candidatesFor = (islandId: string): SearchableExperience[] => searchCandidates(islandId);

function search(islandId: string, query: string) {
  return searchAndSort(candidatesFor(islandId), { ...EMPTY_FILTERS, query });
}

const hidden = DEMO_EXPERIENCES.filter((e) => !isPubliclyVisibleDemo(e));

describe('the negative fixtures still exist', () => {
  /**
   * Deleting one of these makes every test below pass vacuously, which is worse than deleting the
   * test. The dataset carries a draft listing and an approved listing under an unapproved vendor
   * precisely so this file has a subject.
   */
  it('carries a draft listing and one under an unapproved vendor', () => {
    expect(hidden.length).toBeGreaterThanOrEqual(2);
    expect(hidden.some((e) => e.status === 'draft')).toBe(true);
    // The other is approved but its vendor is not, which is the case AD-10 exists for.
    expect(hidden.some((e) => e.status === 'approved')).toBe(true);
  });
});

describe('search cannot surface a hidden listing', () => {
  it('finds nothing for a hidden listing searched by its exact title', () => {
    expect(hidden.length).toBeGreaterThan(0);
    for (const e of hidden) {
      const results = search(e.islandId, e.title);
      expect(results.map((r) => r.id)).not.toContain(e.id);
      // Not merely absent from the ranking — absent from the candidate set entirely.
      expect(candidatesFor(e.islandId).some((c) => c.id === e.id)).toBe(false);
    }
  });

  it('finds nothing for a distinctive fragment of a hidden title', () => {
    for (const e of hidden) {
      // The longest word in the title, which is the fragment most likely to match only this row.
      const fragment = [...e.title.split(/[^A-Za-z]+/)].sort((a, b) => b.length - a.length)[0] ?? '';
      if (fragment.length < 4) continue;
      expect(search(e.islandId, fragment).map((r) => r.id)).not.toContain(e.id);
    }
  });

  it('never returns one under any island, on an empty query', () => {
    for (const island of ISLANDS) {
      const ids = search(island.id, '').map((r) => r.id);
      for (const e of hidden) expect(ids).not.toContain(e.id);
    }
  });

  it('draws its candidates from the same set the visibility rule governs', () => {
    // If these ever diverge, the screen has grown its own source of listings.
    for (const island of ISLANDS) {
      const fromScreen = candidatesFor(island.id).map((c) => c.id).sort();
      const fromRule = visibleExperiences()
        .filter((e) => e.islandId === island.id)
        .map((e) => e.id)
        .sort();
      expect(fromScreen).toEqual(fromRule);
    }
  });
});

describe('search returns what it should', () => {
  it('finds a visible listing by its exact title, on its own island', () => {
    for (const island of ISLANDS) {
      const first = experiencesFor(island.id)[0];
      if (!first) continue;
      expect(search(island.id, first.title).map((r) => r.id)).toContain(first.id);
    }
  });

  it('never returns a listing from another island', () => {
    for (const island of ISLANDS) {
      for (const r of search(island.id, '')) {
        expect(candidatesFor(island.id).find((c) => c.id === r.id)?.islandId).toBe(island.id);
      }
    }
  });

  it('resolves every candidate to a real destination', () => {
    // `destinationId` falls back to '' when a slug does not resolve, and an empty id would make the
    // destination filter silently match nothing rather than fail.
    for (const island of ISLANDS) {
      for (const c of candidatesFor(island.id)) {
        expect(c.destinationId).not.toBe('');
      }
    }
  });
});
