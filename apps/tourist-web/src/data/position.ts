import { distanceMetres, type Coordinates, type LocationFix } from '@cvip/types';
import type { DemoDestination } from './catalogue';

/**
 * Where the guest is, and how much of that the app is entitled to claim.
 *
 * Proximity is one of the two things this product is actually differentiated by, so it has to work
 * on the ground in Jamaica — a demonstration that only ever shows a simulated position is showing a
 * mock-up of the feature rather than the feature. But a real fix cannot be trusted unconditionally
 * either: the same build gets opened on a laptop in another country, and a browser that helpfully
 * answers "London" turns every distance on the screen into nonsense without anything looking broken.
 *
 * So the rule is: **use the real fix when it is plausibly on the selected island, and say which one
 * is in use either way.** That is what makes the feature genuinely functional where it matters and
 * still safe to open anywhere, and it is why this resolution is a pure function with tests rather
 * than a branch buried in a screen.
 */

/**
 * How far from a destination a fix may be and still count as "on this island".
 *
 * Jamaica is about 235 km end to end and its seeded destinations are spread along the coast, so a
 * guest in Kingston with Ocho Rios selected is genuinely on-island and must keep their real
 * position. 150 km from the *nearest* destination covers any of the three islands comfortably while
 * still rejecting a fix from another country by a wide margin — the nearest non-Caribbean landmass
 * is over 500 km away.
 */
export const ON_ISLAND_METRES = 150_000;

/** Why the app fell back to a simulated position. Each renders a different line in the UI. */
export type SimulatedReason =
  /** The guest has not been asked, or said no. */
  | 'no-consent'
  /** Consented, but the device could not produce a fix — indoors, no GPS, timed out. */
  | 'no-fix'
  /** A real fix exists and is nowhere near the selected island. */
  | 'off-island';

export type ResolvedPosition =
  | {
      kind: 'real';
      coordinates: Coordinates;
      /** Metres of uncertainty, straight from the device. Never presented as more precise. */
      accuracyMetres: number;
    }
  | {
      kind: 'simulated';
      coordinates: Coordinates;
      reason: SimulatedReason;
      /** Present for `off-island`: how far the real fix actually was, for an honest message. */
      metresAway?: number;
    };

export interface ResolveInput {
  /** The device's fix, or null when there is none. */
  fix: LocationFix | null;
  /** Whether the guest has agreed to the app using their location at all. */
  consented: boolean;
  /** The destination the guest has selected — the simulated position, and the on-island anchor. */
  destination: DemoDestination;
  /** Every destination on the selected island, so "on-island" is not judged from one point. */
  islandDestinations: DemoDestination[];
}

const centreOf = (d: DemoDestination): Coordinates => ({ lat: d.centre_lat, lng: d.centre_lng });

/**
 * Resolve the position to use for every distance the app shows.
 *
 * Consent is checked before the fix is even looked at. A fix that arrived before consent was
 * withdrawn must not keep being used, and ordering the check this way means that cannot happen by
 * accident.
 */
export function resolvePosition(input: ResolveInput): ResolvedPosition {
  const simulated = centreOf(input.destination);

  if (!input.consented) {
    return { kind: 'simulated', coordinates: simulated, reason: 'no-consent' };
  }
  if (!input.fix) {
    return { kind: 'simulated', coordinates: simulated, reason: 'no-fix' };
  }

  const anchors = input.islandDestinations.length > 0 ? input.islandDestinations : [input.destination];
  const nearest = Math.min(
    ...anchors.map((d) => distanceMetres(input.fix!.coordinates, centreOf(d))),
  );

  if (nearest > ON_ISLAND_METRES) {
    // Not a failure and not an error — the guest is simply somewhere else today, which is the
    // normal case for anyone opening this outside the Caribbean. The screen says so.
    return {
      kind: 'simulated',
      coordinates: simulated,
      reason: 'off-island',
      metresAway: Math.round(nearest),
    };
  }

  return {
    kind: 'real',
    coordinates: input.fix.coordinates,
    accuracyMetres: input.fix.accuracyMetres,
  };
}

/**
 * The destination a real fix is actually closest to.
 *
 * A guest who lands in Montego Bay with Ocho Rios still selected is on-island, so their distances
 * are real — but every one of them is measured to the wrong side of the country. This is what lets
 * a screen offer to move them, and it returns `null` when they are already in the right place so
 * the offer only appears when it is worth making.
 */
export function nearerDestination(
  coordinates: Coordinates,
  current: DemoDestination,
  islandDestinations: DemoDestination[],
): DemoDestination | null {
  let best: DemoDestination | null = null;
  let bestMetres = distanceMetres(coordinates, centreOf(current));

  for (const d of islandDestinations) {
    if (d.slug === current.slug) continue;
    const metres = distanceMetres(coordinates, centreOf(d));
    if (metres < bestMetres) {
      best = d;
      bestMetres = metres;
    }
  }
  return best;
}

/**
 * "±25 m" / "±1.2 km" — accuracy, rounded so it never implies more precision than it has.
 *
 * A phone indoors reports hundreds of metres and a desktop on wifi reports tens of kilometres.
 * Showing that honestly is what stops "4 min walk" being read as a promise.
 */
export function formatAccuracy(metres: number): string {
  if (metres < 1000) return `±${Math.max(5, Math.round(metres / 5) * 5)} m`;
  return `±${(metres / 1000).toFixed(1)} km`;
}
