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
  /**
   * This fence's own entry radius (`geofences.radius_m`). Absent means the default 250 m. A vendor
   * with a beach-wide fence and one with a doorway fence must not share a radius.
   */
  radiusMetres?: number;
}

/** The exit radius for a fence of the given entry radius: the same 250 -> 400 ratio. */
export function exitRadiusFor(radiusMetres: number): number {
  return Math.round(radiusMetres * (GEOFENCE_EXIT_METRES / GEOFENCE_RADIUS_METRES));
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
  // Per-fence radii win; `opts` still overrides the defaults for a caller (or test) that wants one
  // radius for every fence.
  const enterFor = (f: Fence) => f.radiusMetres ?? opts.enterMetres ?? GEOFENCE_RADIUS_METRES;
  const exitFor = (f: Fence) =>
    f.radiusMetres !== undefined ? exitRadiusFor(f.radiusMetres) : (opts.exitMetres ?? GEOFENCE_EXIT_METRES);

  if (fences.length === 0) {
    return { state: { insideId: null }, entered: null, nearestMetres: null };
  }

  const ranked = fences
    .map((f) => ({ fence: f, metres: distanceMetres(origin, f.coordinates) }))
    .sort((a, b) => a.metres - b.metres);

  const nearest = ranked[0]!;

  // Still inside the one we were in? Hold it until the guest is clear of its wider exit radius, so
  // GPS jitter across the boundary cannot re-fire the offer.
  if (previous.insideId) {
    const held = ranked.find((r) => r.fence.id === previous.insideId);
    if (held && held.metres <= exitFor(held.fence)) {
      return { state: previous, entered: null, nearestMetres: nearest.metres };
    }
  }

  // The nearest fence the guest is actually within, by that fence's own radius.
  const within = ranked.find((r) => r.metres <= enterFor(r.fence));
  if (within) {
    const isNew = previous.insideId !== within.fence.id;
    return {
      state: { insideId: within.fence.id },
      entered: isNew ? within.fence.id : null,
      nearestMetres: nearest.metres,
    };
  }

  return { state: { insideId: null }, entered: null, nearestMetres: nearest.metres };
}

// ---------------------------------------------------------------------------
// When a fence may fire: schedule and cooldown (geofences.active_days / active_*_time /
// cooldown_minutes). Both are pure and separate from evaluateFences, so the caller filters the
// fences first and records the time an offer actually fired.
// ---------------------------------------------------------------------------

export interface FenceSchedule {
  /** 0 = Sunday .. 6 = Saturday, as in the database. Empty or absent means every day. */
  activeDays?: readonly number[];
  /** "HH:MM" or "HH:MM:SS", the device's local time. Both absent means all day. */
  activeFromTime?: string | null;
  activeToTime?: string | null;
}

function minutesOfDay(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

/**
 * Whether `now` falls inside the schedule. A window that ends before it starts (22:00 to 02:00)
 * runs past midnight, and the day it belongs to is the day it STARTED: Friday 22:00-02:00 is still
 * on at 01:00 Saturday. A malformed time makes the fence inactive, never always-on, since an offer
 * at the wrong hour is the failure to avoid.
 */
export function isScheduleActive(schedule: FenceSchedule | undefined, now: Date): boolean {
  if (!schedule) return true;
  const days = schedule.activeDays ?? [];
  const from = schedule.activeFromTime ? minutesOfDay(schedule.activeFromTime) : null;
  const to = schedule.activeToTime ? minutesOfDay(schedule.activeToTime) : null;
  if ((schedule.activeFromTime && from === null) || (schedule.activeToTime && to === null)) return false;

  const day = now.getDay();
  const minute = now.getHours() * 60 + now.getMinutes();
  const dayOk = (d: number) => days.length === 0 || days.includes(d);

  if (from === null && to === null) return dayOk(day);
  if (from !== null && to === null) return dayOk(day) && minute >= from;
  if (from === null && to !== null) return dayOk(day) && minute < to;

  if (from! <= to!) return dayOk(day) && minute >= from! && minute < to!;
  // Crosses midnight: the evening part belongs to today, the small hours to yesterday's window.
  if (minute >= from!) return dayOk(day);
  if (minute < to!) return dayOk((day + 6) % 7);
  return false;
}

/** Drop the fences whose schedule is not active at `now`. */
export function activeFences<T extends Fence & { schedule?: FenceSchedule }>(fences: readonly T[], now: Date): T[] {
  return fences.filter((f) => isScheduleActive(f.schedule, now));
}

/**
 * Whether an offer may fire again. `lastFiredAtMs` is when it last fired for this guest (null if
 * never); `cooldownMinutes` is `geofences.cooldown_minutes`. 0 means no cooldown.
 */
export function cooldownElapsed(lastFiredAtMs: number | null, nowMs: number, cooldownMinutes: number): boolean {
  if (lastFiredAtMs === null) return true;
  if (cooldownMinutes <= 0) return true;
  // A clock that went backwards must not lock the offer out for the whole gap.
  if (nowMs < lastFiredAtMs) return true;
  return nowMs - lastFiredAtMs >= cooldownMinutes * 60_000;
}
