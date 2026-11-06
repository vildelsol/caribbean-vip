import { afterEach, describe, expect, it } from 'vitest';
import { ISLANDS } from '../data/catalogue';
import { demoSnapshot, installCatalogue, resetCatalogue } from '../data/catalogueSource';
import { reconcilePlace, resolvePlace } from './place';

afterEach(resetCatalogue);

/**
 * The staging failure of 2026-11-05, as data.
 *
 * A device held `islandId: 'island-jm'` in LocalStorage — demo mode's hand-written id — while the
 * installed snapshot was staging's, whose islands are database UUIDs. Explore could resolve
 * neither island nor destination and rendered nothing at all: the app frame and the bottom nav
 * with no `<main>` between them, no console error and no failed request, on every visit, because
 * nothing ever rewrote the stored id.
 *
 * `reconcilePlace` must rewrite a stored id the catalogue does not hold, and `resolvePlace` must
 * then hand the screen real rows — or say plainly that there are none, which is a different thing
 * and the only case the screen is allowed to have nothing to draw.
 */
const demo = demoSnapshot();

/** Staging's shape: the same markets, under database UUIDs rather than `island-jm`. */
const LIVE_JM = '80309a71-8c8d-48e5-b4fc-11bc705df1ab';
const LIVE_KY = '805e969b-8e9f-4281-add0-d364cd15cfed';

const liveId: Record<string, string> = { 'island-jm': LIVE_JM, 'island-ky': LIVE_KY };

/** The demo dataset re-keyed the way the database keys it. Slugs are unchanged, as they are in staging. */
function installStagingShapedCatalogue(): void {
  const islands = demo.islands
    .filter((i) => i.is_active && liveId[i.id])
    .map((i) => ({ ...i, id: liveId[i.id]! }));
  const destinations = demo.destinations
    .filter((d) => liveId[d.island_id])
    .map((d) => ({ ...d, id: `live-${d.slug}`, island_id: liveId[d.island_id]! }));
  installCatalogue({ ...demo, islands, destinations });
}

describe('a stored place the catalogue no longer holds', () => {
  it('is rewritten to a live island, keeping the town when that island has it', () => {
    installStagingShapedCatalogue();
    expect(reconcilePlace({ islandId: 'island-jm', destinationSlug: 'ocho-rios' })).toEqual({
      islandId: LIVE_JM,
      destinationSlug: 'ocho-rios',
    });
  });

  it('resolves to real island and destination rows, which is what Explore needs to render', () => {
    installStagingShapedCatalogue();
    const resolved = resolvePlace({ islandId: 'island-jm', destinationSlug: 'ocho-rios' });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.island.id).toBe(LIVE_JM);
    expect(resolved.island.code).toBe('JM');
    expect(resolved.destination.slug).toBe('ocho-rios');
    expect(resolved.destination.island_id).toBe(LIVE_JM);
  });

  it('moves a town that belongs to another island onto the island it settled on', () => {
    installStagingShapedCatalogue();
    const first = ISLANDS[0]!;
    const reconciled = reconcilePlace({ islandId: 'no-such-island', destinationSlug: 'george-town' });
    expect(reconciled.islandId).toBe(first.id);
    const resolved = resolvePlace(reconciled);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.destination.island_id).toBe(first.id);
  });

  it('is rewritten when the island it names has been deactivated since', () => {
    installCatalogue({
      ...demo,
      islands: demo.islands.map((i) => (i.id === 'island-jm' ? { ...i, is_active: false } : i)),
    });
    const reconciled = reconcilePlace({ islandId: 'island-jm', destinationSlug: 'ocho-rios' });
    expect(reconciled.islandId).not.toBe('island-jm');
    expect(ISLANDS.map((i) => i.id)).toContain(reconciled.islandId);
    expect(resolvePlace(reconciled).ok).toBe(true);
  });
});

describe('a stored place the catalogue does hold', () => {
  it('is left exactly as it is, so demo mode reconciles to itself (positive control)', () => {
    const stored = { islandId: 'island-ky', destinationSlug: 'rum-point' };
    expect(reconcilePlace(stored)).toEqual(stored);
    expect(resolvePlace(stored).ok).toBe(true);
  });
});

describe('a catalogue with nothing in it', () => {
  it('reports that no place can be resolved, so the screen says so rather than rendering nothing', () => {
    installCatalogue({ ...demo, islands: [], destinations: [] });
    expect(resolvePlace({ islandId: 'island-jm', destinationSlug: 'ocho-rios' })).toEqual({ ok: false });
  });

  it('reports the same when an island exists but has no destination', () => {
    installCatalogue({ ...demo, destinations: [] });
    expect(resolvePlace({ islandId: 'island-jm', destinationSlug: 'ocho-rios' })).toEqual({ ok: false });
  });
});
