import { describe, expect, it } from 'vitest';
import { describeDayFit, soonestDayFitting, weekdayOf } from './dayFit';
import { buildItinerary, shapeById, type BuildInput, type Itinerary } from './itinerary';
import { DEFAULT_PARTY, ISLANDS, destinationsFor, experiencesFor, type DemoDestination } from './catalogue';
import { isoDate } from './availability';

/**
 * The sentence the experience detail page leads its call to action with.
 *
 * What matters here is not the wording but that the wording can never say something the built day
 * does not hold: a headline reading "Fits Tuesday at 9:00 AM" beside a plan that could not seat
 * the party is worse than no headline at all. So every case asserts the claim against the
 * itinerary it was derived from, rather than against a fixture written by hand.
 */

const island = ISLANDS[0]!;
const destination = destinationsFor(island.id)[0]! as DemoDestination;

function futureDay(offsetDays = 3): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return isoDate(d);
}

function dayAround(anchorExperienceId: string, overrides: Partial<BuildInput> = {}): Itinerary {
  return buildItinerary({
    shape: shapeById('full-day')!,
    islandId: island.id,
    destination,
    dateISO: futureDay(),
    party: DEFAULT_PARTY,
    bookings: [],
    plannedExperienceIds: [],
    anchorExperienceId,
    ...overrides,
  });
}

const anchor = experiencesFor(island.id)[0]!;

describe('weekdayOf', () => {
  it('reads the date as local, not UTC', () => {
    // 2026-09-22 is a Tuesday everywhere west of the date line; parsed as UTC in a negative
    // offset it becomes Monday, which is the bug this guards.
    expect(weekdayOf('2026-09-22')).toBe('Tuesday');
    expect(weekdayOf('2026-09-20')).toBe('Sunday');
  });

  it('degrades rather than throwing on a malformed date', () => {
    expect(weekdayOf('not-a-date')).toBe('that day');
  });
});

describe('soonestDayFitting', () => {
  const base = {
    shape: shapeById('full-day')!,
    islandId: island.id,
    destination,
    party: DEFAULT_PARTY,
    bookings: [],
    plannedExperienceIds: [],
  };

  it('returns a day that holds the anchor, not merely a day that holds something', () => {
    const day = soonestDayFitting({ ...base, anchorExperienceId: anchor.id }, futureDay());
    expect(day.stops.some((s) => s.experience.id === anchor.id)).toBe(true);
  });

  it('looks past a day the guest has a booking on', () => {
    /*
     * The regression this exists for: `buildSoonestDay` returns the first day with any stop, and a
     * booking guarantees one — so a listing that did not fit *today* was reported as fitting
     * nowhere in the window. Here the anchor is blocked on the first day by a booking it overlaps,
     * and the answer must be a later day rather than a refusal.
     */
    const blocked = experiencesFor(island.id).find((e) => e.id !== anchor.id)!;
    const day = soonestDayFitting(
      {
        ...base,
        anchorExperienceId: anchor.id,
        bookings: [{ experienceId: blocked.id, dateISO: futureDay(), time: '09:00', totalMinor: 0 }],
      },
      futureDay(),
    );
    expect(day.stops.some((s) => s.experience.id === anchor.id)).toBe(true);
  });

  it('falls back to the first day when nothing in the window holds it', () => {
    const day = soonestDayFitting({ ...base, anchorExperienceId: 'no-such-listing' }, futureDay());
    expect(day.dateISO).toBe(futureDay());
  });
});

describe('describeDayFit', () => {
  it('names the time the built day actually placed the anchor at', () => {
    const day = dayAround(anchor.id);
    const stop = day.stops.find((s) => s.experience.id === anchor.id);
    expect(stop).toBeDefined();

    const fit = describeDayFit(day, anchor.id, futureDay());
    expect(fit.tone).toBe('fits');
    // The claim and the plan must agree to the minute.
    expect(fit.headline).toContain(
      `${((stop!.startMinutes / 60) | 0) % 12 || 12}:${String(stop!.startMinutes % 60).padStart(2, '0')}`,
    );
  });

  it('says "today" rather than naming the weekday when the day is today', () => {
    const today = isoDate(new Date());
    const day = dayAround(anchor.id, { dateISO: today });
    if (!day.stops.some((s) => s.experience.id === anchor.id)) return; // nothing left today; nothing to assert
    expect(describeDayFit(day, anchor.id, today).headline).toContain('today');
  });

  it('counts the remaining room against what the shape wanted', () => {
    const day = dayAround(anchor.id);
    const fit = describeDayFit(day, anchor.id, futureDay());
    const room = day.stopsWanted - day.stops.length;
    if (room > 0 && day.stops[0]?.experience.id === anchor.id) {
      expect(fit.detail).toContain(`${room} more`);
    }
  });

  it('never describes the anchor as following a stop the guest did not book', () => {
    const day = dayAround(anchor.id);
    const fit = describeDayFit(day, anchor.id, futureDay());
    // With no bookings every other stop on the day is one of Irie's own suggestions, so nothing
    // may be spoken of as the guest's. This is the overclaim the first version shipped with.
    expect(fit.detail).not.toContain('Straight after');
    for (const stop of day.stops) {
      if (stop.experience.id !== anchor.id) expect(fit.detail).not.toContain(stop.experience.title);
    }
  });

  it('never claims a fit for a listing the day did not place', () => {
    const day = dayAround(anchor.id);
    const absent = experiencesFor(island.id).find((e) => !day.stops.some((s) => s.experience.id === e.id));
    expect(absent).toBeDefined();

    const fit = describeDayFit(day, absent!.id, futureDay());
    expect(fit.tone).toBe('no-room');
    expect(fit.headline).not.toContain('Fits');
  });

  it('leads with the clash when the guest already holds something that blocks the day', () => {
    const day = dayAround(anchor.id);
    const clashing: Itinerary = {
      ...day,
      stops: day.stops.map((s, i) =>
        i === 0
          ? {
              ...s,
              clash: {
                kind: 'overlap',
                withTitle: 'Another booking',
                shortfallMinutes: 45,
                resolution: null,
              },
            }
          : s,
      ),
    };
    const fit = describeDayFit(clashing, 'not-in-this-day', futureDay());
    expect(fit.tone).toBe('no-room');
    expect(fit.headline).toBe('Your day is already full');
    expect(fit.detail).toContain(day.stops[0]!.experience.title);
  });
});
