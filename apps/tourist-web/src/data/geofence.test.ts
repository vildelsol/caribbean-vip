import { describe, expect, it } from 'vitest';
import { distanceMetres, type Coordinates } from '@cvip/types';
import {
  GEOFENCE_EXIT_METRES,
  GEOFENCE_RADIUS_METRES,
  activeFences,
  cooldownElapsed,
  evaluateFences,
  exitRadiusFor,
  isScheduleActive,
  type Fence,
  type FenceState,
} from './geofence';

/**
 * The geofence is the part of the product that has to be right: an offer that fires in the wrong
 * place teaches the guest that the notification means nothing. These tests pin the maths without
 * standing outside a vendor in Negril.
 *
 * Positions are built by walking due north from a vendor, so each test names a real distance
 * instead of a magic coordinate. `north` is checked against `distanceMetres` below, so a typo in
 * the helper cannot make every other test pass for the wrong reason.
 */

const VENDOR: Coordinates = { lat: 18.2911, lng: -78.3499 };
const OTHER: Coordinates = { lat: 18.4693, lng: -77.9189 };

function north(from: Coordinates, metres: number): Coordinates {
  return { lat: from.lat + metres / 111_195, lng: from.lng };
}

const fence = (id: string, coordinates: Coordinates = VENDOR): Fence => ({ id, coordinates });
const outside: FenceState = { insideId: null };

describe('the test helper', () => {
  it.each([0, 100, 249, 251, 399, 401, 5000])('north() puts a point %i m away', (m) => {
    expect(distanceMetres(VENDOR, north(VENDOR, m))).toBeCloseTo(m, -1);
  });
});

describe('entering a fence', () => {
  it('fires on the transition into the radius', () => {
    const r = evaluateFences(north(VENDOR, 200), [fence('a')], outside);
    expect(r.entered).toBe('a');
    expect(r.state).toEqual({ insideId: 'a' });
  });

  it('does not fire just outside the entry radius', () => {
    const r = evaluateFences(north(VENDOR, GEOFENCE_RADIUS_METRES + 20), [fence('a')], outside);
    expect(r.entered).toBeNull();
    expect(r.state).toEqual({ insideId: null });
  });

  it('fires on the boundary itself (inclusive)', () => {
    expect(evaluateFences(VENDOR, [fence('a')], outside).entered).toBe('a');
    const r = evaluateFences(north(VENDOR, GEOFENCE_RADIUS_METRES - 1), [fence('a')], outside);
    expect(r.entered).toBe('a');
  });

  it('fires only once for a visit: later fixes inside the same fence do not re-fire', () => {
    const first = evaluateFences(north(VENDOR, 200), [fence('a')], outside);
    const second = evaluateFences(north(VENDOR, 120), [fence('a')], first.state);
    const third = evaluateFences(VENDOR, [fence('a')], second.state);
    expect(first.entered).toBe('a');
    expect(second.entered).toBeNull();
    expect(third.entered).toBeNull();
    expect(third.state).toEqual({ insideId: 'a' });
  });
});

describe('hysteresis: leaving takes a wider radius than entering', () => {
  const inside: FenceState = { insideId: 'a' };

  it('stays inside between the entry and exit radii', () => {
    const r = evaluateFences(north(VENDOR, 320), [fence('a')], inside);
    expect(r.state).toEqual({ insideId: 'a' });
    expect(r.entered).toBeNull();
  });

  it('leaves once past the exit radius', () => {
    const r = evaluateFences(north(VENDOR, GEOFENCE_EXIT_METRES + 20), [fence('a')], inside);
    expect(r.state).toEqual({ insideId: null });
    expect(r.entered).toBeNull();
  });

  it('GPS jitter across the entry boundary does not re-fire', () => {
    let state = evaluateFences(north(VENDOR, 240), [fence('a')], outside).state;
    let fired = 0;
    for (const m of [260, 245, 270, 240, 255, 230, 280]) {
      const r = evaluateFences(north(VENDOR, m), [fence('a')], state);
      state = r.state;
      if (r.entered) fired += 1;
    }
    expect(fired).toBe(0);
    expect(state).toEqual({ insideId: 'a' });
  });

  it('positive control: the same jitter DOES re-fire when there is no hysteresis', () => {
    // Exit radius equal to the entry radius removes the hysteresis band.
    const opts = { exitMetres: GEOFENCE_RADIUS_METRES };
    let state = evaluateFences(north(VENDOR, 240), [fence('a')], outside, opts).state;
    let fired = 0;
    for (const m of [260, 245, 270, 240, 255, 230, 280]) {
      const r = evaluateFences(north(VENDOR, m), [fence('a')], state, opts);
      state = r.state;
      if (r.entered) fired += 1;
    }
    expect(fired).toBeGreaterThan(0);
  });

  it('can fire again after a real exit and a fresh entry', () => {
    const a = evaluateFences(north(VENDOR, 100), [fence('a')], outside);
    const b = evaluateFences(north(VENDOR, 900), [fence('a')], a.state);
    const c = evaluateFences(north(VENDOR, 100), [fence('a')], b.state);
    expect([a.entered, b.entered, c.entered]).toEqual(['a', null, 'a']);
  });
});

describe('more than one fence', () => {
  it('enters the nearest when two overlap', () => {
    const near = fence('near', VENDOR);
    const far = fence('far', north(VENDOR, 150));
    const r = evaluateFences(north(VENDOR, 20), [far, near], outside);
    expect(r.entered).toBe('near');
  });

  it('holds the fence it is in even when another becomes nearer, until it exits', () => {
    const a = fence('a', VENDOR);
    const b = fence('b', north(VENDOR, 300));
    const inA: FenceState = { insideId: 'a' };
    const r = evaluateFences(north(VENDOR, 200), [a, b], inA);
    expect(r.state).toEqual({ insideId: 'a' });
    expect(r.entered).toBeNull();
  });

  it('moves to the next fence after leaving the first', () => {
    const a = fence('a', VENDOR);
    const b = fence('b', north(VENDOR, 1000));
    const r = evaluateFences(north(VENDOR, 1000), [a, b], { insideId: 'a' });
    expect(r.entered).toBe('b');
    expect(r.state).toEqual({ insideId: 'b' });
  });

  it('reports the distance to the nearest fence', () => {
    const r = evaluateFences(north(VENDOR, 700), [fence('a'), fence('b', OTHER)], outside);
    expect(r.nearestMetres).toBeCloseTo(700, -1);
  });
});

describe('degenerate input', () => {
  it('no fences: nothing fires, nothing is inside, no distance', () => {
    expect(evaluateFences(VENDOR, [], { insideId: 'gone' })).toEqual({
      state: { insideId: null },
      entered: null,
      nearestMetres: null,
    });
  });

  it('a stale insideId that is no longer in the list does not hold the guest in', () => {
    const r = evaluateFences(north(VENDOR, 2000), [fence('a')], { insideId: 'removed' });
    expect(r.state).toEqual({ insideId: null });
    expect(r.entered).toBeNull();
  });

  it('a fence on another island does not fire', () => {
    expect(evaluateFences(VENDOR, [fence('far', OTHER)], outside).entered).toBeNull();
  });
});

describe('per-fence radius', () => {
  it('a wide fence fires where the default would not', () => {
    const wide: Fence = { id: 'beach', coordinates: VENDOR, radiusMetres: 800 };
    expect(evaluateFences(north(VENDOR, 700), [wide], outside).entered).toBe('beach');
    expect(evaluateFences(north(VENDOR, 700), [fence('beach')], outside).entered).toBeNull();
  });

  it('a narrow fence does not fire at the default distance', () => {
    const door: Fence = { id: 'door', coordinates: VENDOR, radiusMetres: 50 };
    expect(evaluateFences(north(VENDOR, 40), [door], outside).entered).toBe('door');
    expect(evaluateFences(north(VENDOR, 120), [door], outside).entered).toBeNull();
  });

  it('exit scales with the fence: 50 m enters, holds to 80 m, leaves past it', () => {
    const door: Fence = { id: 'door', coordinates: VENDOR, radiusMetres: 50 };
    expect(exitRadiusFor(50)).toBe(80);
    expect(evaluateFences(north(VENDOR, 70), [door], { insideId: 'door' }).state).toEqual({ insideId: 'door' });
    expect(evaluateFences(north(VENDOR, 95), [door], { insideId: 'door' }).state).toEqual({ insideId: null });
  });

  it('the default exit radius is unchanged for a fence without its own radius', () => {
    expect(exitRadiusFor(GEOFENCE_RADIUS_METRES)).toBe(GEOFENCE_EXIT_METRES);
  });

  it('with two fences, enters the nearest one the guest is actually within', () => {
    const wideFar: Fence = { id: 'wide', coordinates: north(VENDOR, 600), radiusMetres: 800 };
    const narrowNear: Fence = { id: 'narrow', coordinates: VENDOR, radiusMetres: 50 };
    // 300 m from `narrow` (outside its 50 m), 300 m from `wide` (inside its 800 m).
    const r = evaluateFences(north(VENDOR, 300), [narrowNear, wideFar], outside);
    expect(r.entered).toBe('wide');
  });
});

describe('schedule', () => {
  // 2026-10-26 is a Monday. Local-time constructor, because the rule is the device's local time.
  const at = (day: number, h: number, m = 0) => new Date(2026, 9, 25 + day, h, m); // 25 Oct 2026 is a Sunday
  const FRI = 5;
  const SAT = 6;

  it('no schedule is always active', () => {
    expect(isScheduleActive(undefined, at(3, 3))).toBe(true);
    expect(isScheduleActive({}, at(3, 3))).toBe(true);
  });

  it('active days: a Tuesday-only fence is off on Wednesday', () => {
    const s = { activeDays: [2] };
    expect(isScheduleActive(s, at(2, 12))).toBe(true);
    expect(isScheduleActive(s, at(3, 12))).toBe(false);
  });

  it('a daytime window includes its start and excludes its end', () => {
    const s = { activeFromTime: '09:00', activeToTime: '17:00' };
    expect(isScheduleActive(s, at(1, 8, 59))).toBe(false);
    expect(isScheduleActive(s, at(1, 9, 0))).toBe(true);
    expect(isScheduleActive(s, at(1, 16, 59))).toBe(true);
    expect(isScheduleActive(s, at(1, 17, 0))).toBe(false);
  });

  it('accepts the database time format with seconds', () => {
    expect(isScheduleActive({ activeFromTime: '09:00:00', activeToTime: '17:00:00' }, at(1, 12))).toBe(true);
  });

  it('a window that crosses midnight belongs to the day it started', () => {
    const s = { activeDays: [FRI], activeFromTime: '22:00', activeToTime: '02:00' };
    expect(isScheduleActive(s, at(FRI, 23))).toBe(true);
    expect(isScheduleActive(s, at(SAT, 1))).toBe(true); // Friday's window, early Saturday
    expect(isScheduleActive(s, at(SAT, 23))).toBe(false); // Saturday evening is not a Friday
    expect(isScheduleActive(s, at(FRI, 1))).toBe(false); // early Friday belongs to Thursday's window
    expect(isScheduleActive(s, at(FRI, 12))).toBe(false);
  });

  it('only a start time means from then onwards; only an end time means until then', () => {
    expect(isScheduleActive({ activeFromTime: '18:00' }, at(1, 17, 59))).toBe(false);
    expect(isScheduleActive({ activeFromTime: '18:00' }, at(1, 18, 0))).toBe(true);
    expect(isScheduleActive({ activeToTime: '11:00' }, at(1, 10, 59))).toBe(true);
    expect(isScheduleActive({ activeToTime: '11:00' }, at(1, 11, 0))).toBe(false);
  });

  it.each(['25:00', '9am', '12:60', 'x'])('a malformed time %j turns the fence off, not on', (bad) => {
    expect(isScheduleActive({ activeFromTime: bad }, at(1, 12))).toBe(false);
    expect(isScheduleActive({ activeToTime: bad }, at(1, 12))).toBe(false);
  });

  it('activeFences drops the inactive ones and keeps the rest', () => {
    const on = { ...fence('on'), schedule: { activeDays: [1] } };
    const off = { ...fence('off'), schedule: { activeDays: [2] } };
    const free = fence('free');
    expect(activeFences([on, off, free], at(1, 12)).map((f) => f.id)).toEqual(['on', 'free']);
  });
});

describe('cooldown', () => {
  const T0 = 1_000_000_000_000;
  it('never fired: may fire', () => {
    expect(cooldownElapsed(null, T0, 1440)).toBe(true);
  });
  it('blocks inside the cooldown and releases exactly at it', () => {
    expect(cooldownElapsed(T0, T0 + 1439 * 60_000, 1440)).toBe(false);
    expect(cooldownElapsed(T0, T0 + 1440 * 60_000, 1440)).toBe(true);
  });
  it('zero cooldown never blocks', () => {
    expect(cooldownElapsed(T0, T0, 0)).toBe(true);
  });
  it('a clock that went backwards does not lock the offer out', () => {
    expect(cooldownElapsed(T0, T0 - 3_600_000, 1440)).toBe(true);
  });
});
