import type { ExperienceCategory } from '@cvip/types';

/**
 * The onboarding interest picker's state — mockup screen 2.
 *
 * In memory, deliberately, exactly as `onboarding.ts` is and for the same two reasons: a
 * demonstration needs the onboarding flow back on every reload, and a real "my interests" is a
 * profile preference that belongs on the account in M4, not in device storage where it survives a
 * sign-out.
 *
 * Interests are a *ranking* signal, never a filter. Explore still shows everything the RLS-governed
 * catalogue returns; picking "Beaches" must not hide the waterfalls, or a guest who taps one tile
 * on their first screen silently loses half the catalogue and has no idea why.
 */
let chosen: ExperienceCategory[] = [];

export function getInterests(): ExperienceCategory[] {
  return chosen;
}

export function setInterests(next: ExperienceCategory[]): void {
  chosen = next;
}

export function hasInterests(): boolean {
  return chosen.length > 0;
}

/**
 * Ranks a list so that anything matching a chosen interest floats up, preserving the existing
 * order within each group. A stable partition rather than a sort, so two experiences with no
 * chosen interest never swap places for no reason.
 */
export function rankByInterest<T extends { category: string }>(items: T[]): T[] {
  if (chosen.length === 0) return items;
  const wanted = new Set<string>(chosen);
  const hits = items.filter((i) => wanted.has(i.category));
  const rest = items.filter((i) => !wanted.has(i.category));
  return [...hits, ...rest];
}
