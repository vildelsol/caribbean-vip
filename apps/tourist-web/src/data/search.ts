import type { SearchableExperience } from '@cvip/types';
import { destinationBySlug, experiencesFor } from './catalogue';

/**
 * What Search is allowed to look at — T-03.
 *
 * One function, used by the screen and by its test, so the two cannot disagree about which listings
 * exist. That matters more than it looks: the whole of T-03's security property reduces to which
 * set gets handed to `searchAndSort`, and a test that *re-implemented* this mapping would keep
 * passing while the screen searched something else entirely.
 *
 * `experiencesFor` goes through `visibleExperiences()`, which mirrors the `experiences_public_read`
 * policy — an approved listing under an unapproved vendor is not public (AD-10), and neither is a
 * draft. **Do not add a `status === 'approved'` filter here.** It would look like belt and braces
 * and would in fact be the opposite: it hides the fact that visibility is one rule in one place,
 * and it would keep this screen looking correct if that rule were ever dropped.
 */
export function searchCandidates(islandId: string): SearchableExperience[] {
  return experiencesFor(islandId).map((e) => ({
    id: e.id,
    title: e.title,
    summary: e.summary,
    category: e.category,
    fromAmountMinor: e.fromAmountMinor,
    durationMinutes: e.durationMinutes,
    // Empty when a slug does not resolve. A destination filter would then match nothing rather than
    // everything, which is the safe direction — and `search.test.ts` asserts it never happens.
    destinationId: destinationBySlug(e.destinationSlug)?.id ?? '',
    islandId: e.islandId,
    coordinates: null,
    rating: e.ratingAverage,
    reviewCount: e.ratingCount,
  }));
}
