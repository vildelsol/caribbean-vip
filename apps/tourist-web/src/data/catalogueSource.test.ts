import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_EXPERIENCES, DEMO_VENDORS, isPubliclyVisibleDemo } from '@cvip/demo';
import { ISLANDS, destinationsFor, experienceById, experiencesFor, visibleExperiences } from './catalogue';
import { currentCatalogue, demoSnapshot, installCatalogue, resetCatalogue } from './catalogueSource';

afterEach(resetCatalogue);

const base = demoSnapshot();
const vendor = { ...DEMO_VENDORS[0]!, id: 'live-vendor', status: 'approved' as const };
const pendingVendor = { ...DEMO_VENDORS[0]!, id: 'live-pending', status: 'pending' as never };
const exp = (id: string, vendorId: string, status: 'approved' | 'draft' = 'approved') => ({
  ...DEMO_EXPERIENCES[0]!, id, vendorId, status, islandId: base.islands[0]!.id,
});

describe('demo snapshot', () => {
  it('serves exactly what the bundled dataset serves, so demo mode is unchanged', () => {
    expect(visibleExperiences().map((e) => e.id)).toEqual(DEMO_EXPERIENCES.filter(isPubliclyVisibleDemo).map((e) => e.id));
    expect(ISLANDS.map((i) => i.id)).toEqual(base.islands.filter((i) => i.is_active).map((i) => i.id));
  });
});

describe('an installed live snapshot', () => {
  it('replaces what every read returns, including ISLANDS, which keeps the same array', () => {
    const islandsRef = ISLANDS;
    installCatalogue({ ...base, vendors: [vendor], experiences: [exp('live-1', 'live-vendor')] });
    expect(visibleExperiences().map((e) => e.id)).toEqual(['live-1']);
    expect(experienceById('live-1')?.id).toBe('live-1');
    expect(experienceById(DEMO_EXPERIENCES[0]!.id)).toBeUndefined();
    expect(experiencesFor(base.islands[0]!.id)).toHaveLength(1);
    expect(ISLANDS).toBe(islandsRef);
  });

  it('finds a live listing\'s vendor in the snapshot, not the bundled vendors (positive control)', () => {
    installCatalogue({ ...base, vendors: [vendor], experiences: [exp('live-1', 'live-vendor')] });
    expect(visibleExperiences()).toHaveLength(1);
  });

  it('still hides a draft listing and a listing under an unapproved vendor', () => {
    installCatalogue({
      ...base,
      vendors: [vendor, pendingVendor],
      experiences: [exp('draft', 'live-vendor', 'draft'), exp('unvetted', 'live-pending'), exp('orphan', 'no-such-vendor'), exp('ok', 'live-vendor')],
    });
    expect(visibleExperiences().map((e) => e.id)).toEqual(['ok']);
  });

  it('an empty live catalogue shows nothing rather than falling back to demo listings', () => {
    installCatalogue({ ...base, vendors: [], experiences: [], destinations: [], islands: [] });
    expect(visibleExperiences()).toEqual([]);
    expect(ISLANDS).toEqual([]);
    expect(destinationsFor('anything')).toEqual([]);
  });

  it('resetCatalogue restores the bundled dataset', () => {
    installCatalogue({ ...base, vendors: [], experiences: [], islands: [] });
    resetCatalogue();
    expect(currentCatalogue().experiences).toBe(DEMO_EXPERIENCES);
    expect(ISLANDS.length).toBeGreaterThan(0);
  });
});

describe('nothing bypasses the seam', () => {
  const root = join(__dirname, '..');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
    });
  it('only catalogueSource.ts reads the bundled listing, island, vendor, destination or credit data', () => {
    const offenders = files(root).filter((f) => {
      if (f.endsWith('catalogueSource.ts')) return false;
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      return /\bDEMO_(EXPERIENCES|ISLANDS|VENDORS|DESTINATIONS|MEDIA_CREDITS)\b|\bdemoOptionsFor\b|\bisPubliclyVisibleDemo\b/.test(src);
    });
    expect(offenders.map((f) => f.slice(root.length))).toEqual([]);
  });
});
