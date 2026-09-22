import { distanceMetres, type Coordinates } from '@cvip/types';

/**
 * The proximity rule behind the offer.
 *
 * Kept as a pure function, separate from the effect that watches the device, for two reasons. It is
 * the part that has to be *correct* — an offer that fires in the wrong place is worse than one that
 * never fires, because it teaches the guest the notification means nothing — and it is the only part
 * that can be tested without standing outside a vendor in Negril.
 */

/**
 * How close counts as "here".
 *
 * 250m is about three minutes' walk. Tighter than that and ordinary GPS error on a phone between
 * buildings will bounce a guest in and out of the fence; much wider and the offer arrives while they
 * are still somewhere else, which is the failure that makes people turn notifications off.
 */
export const GEOFENCE_RADIUS_METRES = 250;

/**
 * Hysteresis: once inside, a guest stays inside until they are this far out.
 *
 * Without it a fix that jitters either side of the boundary re-triggers repeatedly. The exit radius
 * is deliberately wider than the entry radius, which is the standard way to stop that flapping.
 */
export const GEOFENCE_EXIT_METRES = 400;

export interface Fence {
  id: string;
  coordinates: Coordinates;
}

export interface FenceState {
  /** The fence the guest is currently inside, if any. */
  insideId: string | null;
}

export interface FenceEvaluation {
  state: FenceState;
  /** Set on the transition into a fence, and only on that transition. */
  entered: string | null;
  /** Metres to the nearest fence, for display and for tests. */
  nearestMetres: number | null;
}

/**
 * Decide whether the guest has just entered a fence.
 *
 * `entered` is non-null only on the *transition*, never on subsequent evaluations inside the same
 * fence — so a caller can fire an offer straight from it without keeping its own "have I already
 * shown this" flag for the duration of the visit.
 */
export function evaluateFences(
  origin: Coordinates,
  fences: Fence[],
  previous: FenceState,
  opts: { enterMetres?: number; exitMetres?: number } = {},
): FenceEvaluation {
  const enterMetres = opts.enterMetres ?? GEOFENCE_RADIUS_METRES;
  const exitMetres = opts.exitMetres ?? GEOFENCE_EXIT_METRES;

  if (fences.length === 0) {
    return { state: { insideId: null }, entered: null, nearestMetres: null };
  }

  const ranked = fences
    .map((f) => ({ fence: f, metres: distanceMetres(origin, f.coordinates) }))
    .sort((a, b) => a.metres - b.metres);

  const nearest = ranked[0]!;

  // Still inside the one we were in? Hold it until the guest is clear of the wider exit radius, so
  // GPS jitter across the boundary cannot re-fire the offer.
  if (previous.insideId) {
    const held = ranked.find((r) => r.fence.id === previous.insideId);
    if (held && held.metres <= exitMetres) {
      return { state: previous, entered: null, nearestMetres: nearest.metres };
    }
  }

  if (nearest.metres <= enterMetres) {
    const isNew = previous.insideId !== nearest.fence.id;
    return {
      state: { insideId: nearest.fence.id },
      entered: isNew ? nearest.fence.id : null,
      nearestMetres: nearest.metres,
    };
  }

  return { state: { insideId: null }, entered: null, nearestMetres: nearest.metres };
}
