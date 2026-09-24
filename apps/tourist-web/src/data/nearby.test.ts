import { describe, expect, it } from 'vitest';
import { DEMO_ISLANDS, DEMO_VENDORS } from '@cvip/demo';
import { byDistanceFrom, destinationsFor, experienceCoords, experiencesFor, simulatedPosition } from './catalogue';

const live = DEMO_ISLANDS.filter((i) => i.is_active);

/**
 * "Nearest first" has to be able to tell two listings apart.
 *
 * Distance was measured from the **vendor**, and the catalogue shares about five operators per
 * island, so Dunn's River Falls and Mystic Mountain — 2 km apart — both read "8 MIN DRIVE · 3.6 KM".
 * The sort was ranking on a number that could not discriminate, under a heading that promised it
 * had.
 */
describe('distances can discriminate', () => {
  for (const island of live) {
    const destination = destinationsFor(island.id)[0]!;
    const origin = simulatedPosition(destination);
    const ranked = byDistanceFrom(origin, experiencesFor(island.id));

    it(`${island.name}: the ten nearest listings are not all standing on the same spot`, () => {
      const nearest = ranked.slice(0, 10);
      const distinct = new Set(nearest.map((r) => Math.round(r.metres)));
      // Not "all distinct" — some listings genuinely share a start, and pretending otherwise would
      // be inventing precision. The bar is that the sort carries real information.
      expect(distinct.size, island.name).toBeGreaterThan(Math.floor(nearest.length / 2));
    });
  }

  it('Ocho Rios can tell Dunn\'s River from Mystic Mountain', () => {
    const jm = live.find((i) => i.id === 'island-jm')!;
    const origin = simulatedPosition(destinationsFor(jm.id)[0]!);
    const ranked = byDistanceFrom(origin, experiencesFor(jm.id));
    const falls = ranked.find((r) => r.experience.id === 'exp-dunns-falls');
    const mystic = ranked.find((r) => r.experience.id === 'exp-mystic-mountain');
    expect(falls).toBeDefined();
    expect(mystic).toBeDefined();
    expect(Math.round(falls!.metres)).not.toBe(Math.round(mystic!.metres));
  });
});

/**
 * George Town is where every Cayman guest opens the app, and it had no operator based in it.
 * The rule is general because the next island added will have the same trap.
 */
describe('every default destination has local inventory', () => {
  for (const island of live) {
    const destination = destinationsFor(island.id)[0]!;
    it(`${island.name}: ${destination.name} has a listing that starts there`, () => {
      const local = experiencesFor(island.id).filter(
        (e) => experienceCoords(e)?.destinationSlug === destination.slug,
      );
      expect(local.length, `${destination.name} has no local listing`).toBeGreaterThan(0);
    });

    it(`${island.name}: ${destination.name} has an approved operator based in it`, () => {
      const based = DEMO_VENDORS.filter(
        (v) =>
          v.islandId === island.id &&
          v.status === 'approved' &&
          v.location.destinationSlug === destination.slug,
      );
      expect(based.length, `${destination.name} has no operator`).toBeGreaterThan(0);
    });
  }
});

describe('meeting points are real coordinates', () => {
  it('sits on the right island, never at null island', () => {
    for (const island of live) {
      for (const e of experiencesFor(island.id)) {
        const mp = e.meetingPoint;
        if (!mp) continue;
        expect(mp.lat, e.id).not.toBe(0);
        expect(mp.lng, e.id).not.toBe(0);
        // Every island in the catalogue is north of the equator and west of Greenwich.
        expect(mp.lat, e.id).toBeGreaterThan(10);
        expect(mp.lat, e.id).toBeLessThan(26);
        expect(mp.lng, e.id).toBeLessThan(-58);
        expect(mp.lng, e.id).toBeGreaterThan(-82);
      }
    }
  });
});
