import { describe, expect, it } from 'vitest';
import type { LocationFix } from '@cvip/types';
import {
  ON_ISLAND_METRES,
  formatAccuracy,
  nearerDestination,
  resolvePosition,
} from './position';
import { ISLANDS, destinationsFor } from './catalogue';

/**
 * Which position the app is allowed to use.
 *
 * Proximity is one of the product's two differentiators, so it has to work on the ground — and the
 * same build gets opened from a desk on another continent, where a real fix would make every
 * distance on the screen wrong while looking perfectly fine. Both halves are pinned here.
 */

const jamaica = ISLANDS[0]!;
const jmDestinations = destinationsFor(jamaica.id);
const ochoRios = jmDestinations.find((d) => d.slug === 'ocho-rios') ?? jmDestinations[0]!;

function fixAt(lat: number, lng: number, accuracyMetres = 20): LocationFix {
  return { coordinates: { lat, lng }, accuracyMetres, timestamp: Date.now() };
}

const base = { destination: ochoRios, islandDestinations: jmDestinations };

describe('consent gates everything', () => {
  it('never uses a fix the guest has not consented to, even when one is present', () => {
    const r = resolvePosition({ ...base, consented: false, fix: fixAt(18.4074, -77.103) });
    expect(r.kind).toBe('simulated');
    expect(r.kind === 'simulated' && r.reason).toBe('no-consent');
    // And the coordinates handed back are the destination centre, not the withheld fix.
    expect(r.coordinates).toEqual({ lat: ochoRios.centre_lat, lng: ochoRios.centre_lng });
  });

  it('falls back when consent is given but no fix is available', () => {
    const r = resolvePosition({ ...base, consented: true, fix: null });
    expect(r.kind).toBe('simulated');
    expect(r.kind === 'simulated' && r.reason).toBe('no-fix');
  });
});

describe('a real fix on the island is used', () => {
  it('uses a fix at the selected destination', () => {
    const r = resolvePosition({
      ...base,
      consented: true,
      fix: fixAt(ochoRios.centre_lat, ochoRios.centre_lng, 18),
    });
    expect(r.kind).toBe('real');
    expect(r.kind === 'real' && r.accuracyMetres).toBe(18);
  });

  it('uses a fix elsewhere on the same island', () => {
    // Kingston, with Ocho Rios selected — genuinely on-island, ~55 km away.
    const kingston = jmDestinations.find((d) => d.slug === 'kingston');
    if (!kingston) return;
    const r = resolvePosition({
      ...base,
      consented: true,
      fix: fixAt(kingston.centre_lat, kingston.centre_lng),
    });
    expect(r.kind).toBe('real');
  });

  it('uses a real fix anywhere on any island, for that island', () => {
    for (const island of ISLANDS) {
      const dests = destinationsFor(island.id);
      for (const d of dests) {
        const r = resolvePosition({
          destination: dests[0]!,
          islandDestinations: dests,
          consented: true,
          fix: fixAt(d.centre_lat, d.centre_lng),
        });
        expect(r.kind).toBe('real');
      }
    }
  });
});

describe('a real fix somewhere else is refused', () => {
  const elsewhere: [string, number, number][] = [
    ['London', 51.5072, -0.1276],
    ['New York', 40.7128, -74.006],
    ['Lagos', 6.5244, 3.3792],
    ['Sydney', -33.8688, 151.2093],
  ];

  it.each(elsewhere)('falls back when the device says %s', (_name, lat, lng) => {
    const r = resolvePosition({ ...base, consented: true, fix: fixAt(lat, lng) });
    expect(r.kind).toBe('simulated');
    expect(r.kind === 'simulated' && r.reason).toBe('off-island');
    // The distance is reported so the screen can say something true rather than something vague.
    expect(r.kind === 'simulated' && (r.metresAway ?? 0)).toBeGreaterThan(ON_ISLAND_METRES);
  });

  it('refuses a fix on a different island in the catalogue', () => {
    // Cayman is ~600 km from Jamaica: on-island for Cayman, off-island for a Jamaica selection.
    const cayman = ISLANDS.find((i) => i.id !== jamaica.id);
    if (!cayman) return;
    const cd = destinationsFor(cayman.id)[0];
    if (!cd) return;
    const r = resolvePosition({
      ...base,
      consented: true,
      fix: fixAt(cd.centre_lat, cd.centre_lng),
    });
    expect(r.kind).toBe('simulated');
    expect(r.kind === 'simulated' && r.reason).toBe('off-island');
  });

  it('always returns the destination centre when it falls back', () => {
    for (const [, lat, lng] of elsewhere) {
      const r = resolvePosition({ ...base, consented: true, fix: fixAt(lat, lng) });
      expect(r.coordinates).toEqual({ lat: ochoRios.centre_lat, lng: ochoRios.centre_lng });
    }
  });
});

describe('nearerDestination', () => {
  it('returns null when the guest is already at the selected destination', () => {
    expect(
      nearerDestination(
        { lat: ochoRios.centre_lat, lng: ochoRios.centre_lng },
        ochoRios,
        jmDestinations,
      ),
    ).toBeNull();
  });

  it('names the closer destination when the guest is on the other side of the island', () => {
    const other = jmDestinations.find((d) => d.slug !== ochoRios.slug);
    if (!other) return;
    const found = nearerDestination(
      { lat: other.centre_lat, lng: other.centre_lng },
      ochoRios,
      jmDestinations,
    );
    expect(found?.slug).toBe(other.slug);
  });

  it('never proposes the destination already selected', () => {
    for (const d of jmDestinations) {
      const found = nearerDestination({ lat: d.centre_lat, lng: d.centre_lng }, d, jmDestinations);
      expect(found?.slug).not.toBe(d.slug);
    }
  });
});

describe('accuracy is never overstated', () => {
  it('rounds to a floor of five metres — no device is better than that in a street', () => {
    expect(formatAccuracy(1)).toBe('±5 m');
    expect(formatAccuracy(12)).toBe('±10 m');
    expect(formatAccuracy(23)).toBe('±25 m');
  });

  it('switches to kilometres above a kilometre, which is what a desktop reports', () => {
    expect(formatAccuracy(1200)).toBe('±1.2 km');
    expect(formatAccuracy(25000)).toBe('±25.0 km');
  });
});
