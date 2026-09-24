import { describe, expect, it } from 'vitest';
import { DEMO_ISLANDS } from '@cvip/demo';
import {
  byDistanceFrom,
  destinationsFor,
  experiencesFor,
  formatTravelMinutes,
  simulatedPosition,
} from './catalogue';

/**
 * The mood tiles must be answerable where the guest actually is.
 *
 * They promise four kinds of day. Tapping one used to *reorder* the feed rather than filter it, so
 * a mood changed exactly one card — and on Jamaica the card it changed named Negril, because
 * "Relax & Unwind" had nothing within 100 km of Ocho Rios to offer. The screen was not the whole
 * problem: the inventory was not there.
 */
const MOODS: Record<string, readonly string[]> = {
  adventure: ['adventure', 'water_sports', 'waterfalls', 'day_trips'],
  relax: ['beaches', 'wellness'],
  taste: ['food', 'nightlife'],
  explore: ['culture', 'family', 'shopping'],
};

/** Far enough to be a different day out. A mood answered only from here is not answered. */
const NEAR_METRES = 25_000;

describe('every mood is answerable from every default destination', () => {
  for (const island of DEMO_ISLANDS.filter((i) => i.is_active)) {
    const home = destinationsFor(island.id)[0]!;
    const origin = simulatedPosition(home);
    const everything = experiencesFor(island.id);

    for (const [mood, cats] of Object.entries(MOODS)) {
      it(`${island.name} · ${mood} has something within 25 km of ${home.name}`, () => {
        const hits = everything.filter((e) => cats.includes(e.category));
        const near = byDistanceFrom(origin, hits).filter((r) => r.metres <= NEAR_METRES);
        expect(near.length, `${island.name}/${mood}: ${hits.length} on the island, none near`)
          .toBeGreaterThan(0);
      });
    }
  }
});

describe('travel time reads like a person said it', () => {
  it('stays in minutes under an hour and a half', () => {
    expect(formatTravelMinutes(3)).toBe('3 min');
    expect(formatTravelMinutes(89)).toBe('89 min');
  });

  /** "289 min" is not a number anyone converts while choosing where to have lunch. */
  it('switches to hours beyond that', () => {
    expect(formatTravelMinutes(90)).toBe('1 hr 30 min');
    expect(formatTravelMinutes(120)).toBe('2 hr');
    expect(formatTravelMinutes(289)).toBe('4 hr 49 min');
  });
});
