import { afterEach, describe, expect, it } from 'vitest';
import { buildSnapshot, cancellationHours, mediaKeyFor, type CatalogueRows } from './catalogueMapping';
import { installCatalogue, resetCatalogue } from './catalogueSource';
import { experienceById, mediaUrl, visibleExperiences } from './catalogue';

afterEach(resetCatalogue);

const BASE = 'https://x.supabase.co/storage/v1/object/public/experience-media';

function rows(over: Partial<CatalogueRows> = {}): CatalogueRows {
  return {
    islands: [{ id: 'i1', code: 'JM', name: 'Jamaica', in_app_brand: null, greeting: null, currency: 'USD', timezone: 'America/Jamaica', hero_media_path: null, is_active: true }],
    destinations: [{ id: 'd1', island_id: 'i1', name: 'Negril', slug: 'negril', centre_lat: 18.27, centre_lng: -78.35, editorial_content: null, sort_order: 0, is_active: true }],
    vendors: [{ id: 'v1', island_id: 'i1', trading_name: 'Reef Co', status: 'approved', description: null }],
    locations: [{ vendor_org_id: 'v1', destination_id: 'd1', name: 'Dock', lat: 18.28, lng: -78.34, is_primary: true }],
    experiences: [{
      id: 'e1', vendor_org_id: 'v1', island_id: 'i1', destination_id: 'd1', category: 'beaches', title: 'Reef Snorkel',
      summary: null, description: null, duration_minutes: 120, inclusions: null, pickup_info: null,
      cancellation_policy: {}, from_amount_minor: '7800', status: 'approved',
    }],
    media: [
      { experience_id: 'e1', storage_path: 'v1/e1/b.jpg', sort_order: 1 },
      { experience_id: 'e1', storage_path: 'jm-dunns-1', sort_order: 0 },
    ],
    options: [
      { id: 'o-ad', experience_id: 'e1', kind: 'adult', label: 'Adult', unit_amount_minor: 7800, occupies_capacity: true, sort_order: 0, is_active: true },
      { id: 'o-inf', experience_id: 'e1', kind: 'infant', label: 'Infant', unit_amount_minor: 0, occupies_capacity: true, sort_order: 1, is_active: true },
      { id: 'o-off', experience_id: 'e1', kind: 'addon', label: 'Old add-on', unit_amount_minor: 500, occupies_capacity: false, sort_order: 2, is_active: false },
    ],
    ...over,
  };
}

describe('buildSnapshot', () => {
  const snap = buildSnapshot(rows(), BASE);

  it('maps a listing, coercing the string amount a bigint column arrives as', () => {
    const e = snap.experiences[0]!;
    expect(e).toMatchObject({ id: 'e1', destinationSlug: 'negril', fromAmountMinor: 7800, inclusions: [], status: 'approved', vendorId: 'v1' });
  });

  it('never invents a rating or a refund window', () => {
    const e = snap.experiences[0]!;
    expect([e.ratingAverage, e.ratingCount, e.cancellationHours]).toEqual([0, 0, 0]);
  });

  it('orders media by sort_order and turns a Storage path into its public URL', () => {
    expect(snap.experiences[0]!.media).toEqual(['jm-dunns-1', `${BASE}/v1/e1/b.jpg`]);
  });

  it('keeps only active options of kinds the booking UI understands', () => {
    expect(snap.optionsFor(snap.experiences[0]!).map((o) => o.id)).toEqual(['o-ad']);
    expect(snap.optionsFor({ id: 'nope' } as never)).toEqual([]);
  });

  it('places a vendor at its primary location, falling back to any', () => {
    expect(snap.vendors[0]!.location).toMatchObject({ name: 'Dock', destinationSlug: 'negril' });
    const two = buildSnapshot(rows({ locations: [
      { vendor_org_id: 'v1', destination_id: 'd1', name: 'Branch', lat: 1, lng: 1, is_primary: false },
      { vendor_org_id: 'v1', destination_id: 'd1', name: 'Main', lat: 2, lng: 2, is_primary: true },
    ] }), BASE);
    expect(two.vendors[0]!.location.name).toBe('Main');
  });

  it('drops what it cannot place or price instead of guessing', () => {
    const bad = rows();
    bad.vendors.push({ id: 'v2', island_id: 'i1', trading_name: 'No Location', status: 'approved', description: null });
    bad.experiences.push(
      { ...bad.experiences[0]!, id: 'no-dest', destination_id: 'zzz' },
      { ...bad.experiences[0]!, id: 'no-price', from_amount_minor: 'NaN' },
      { ...bad.experiences[0]!, id: 'bad-cat', category: 'skydiving' },
      { ...bad.experiences[0]!, id: 'no-loc', vendor_org_id: 'v2' },
    );
    const s = buildSnapshot(bad, BASE);
    expect(s.experiences.map((e) => e.id)).toEqual(['e1', 'no-loc']);
    expect(s.vendors.map((v) => v.id)).toEqual(['v1']);
    installCatalogue(s);
    expect(visibleExperiences().map((e) => e.id)).toEqual(['e1']); // 'no-loc' has no vendor, so it is hidden
  });

  it('treats any vendor status other than approved as unapproved', () => {
    const s = buildSnapshot(rows({ vendors: [{ id: 'v1', island_id: 'i1', trading_name: 'X', status: 'suspended', description: null }] }), BASE);
    expect(s.vendors[0]!.status).toBe('pending_review');
    installCatalogue(s);
    expect(visibleExperiences()).toEqual([]);
  });

  it('serves an installed live listing end to end through catalogue.ts', () => {
    installCatalogue(snap);
    expect(experienceById('e1')?.title).toBe('Reef Snorkel');
    expect(mediaUrl(`${BASE}/v1/e1/b.jpg`)).toBe(`${BASE}/v1/e1/b.jpg`);
  });
});

describe('mediaKeyFor', () => {
  it.each([
    ['jm-dunns-1', 'jm-dunns-1'],
    ['org/exp/photo.jpg', `${BASE}/org/exp/photo.jpg`],
  ])('accepts %s', (path, key) => expect(mediaKeyFor(path, BASE)).toBe(key));

  it.each(['../secret/x.jpg', 'a/../b.jpg', '/abs/x.jpg', 'a/b c.jpg', 'a/b?x=1.jpg', 'https://evil.test/x.jpg', 'a\\b.jpg', ''])(
    'rejects the hostile or malformed path %j',
    (path) => expect(mediaKeyFor(path, BASE)).toBeNull(),
  );
});

describe('cancellationHours', () => {
  it.each([
    [{ free_until_hours: 24 }, 24], [{ free_until_hours: 24.9 }, 24], [{ free_until_hours: '48' }, 48],
    [{}, 0], [null, 0], ['x', 0], [{ free_until_hours: -5 }, 0], [{ free_until_hours: 'soon' }, 0],
  ])('%j -> %i', (policy, hours) => expect(cancellationHours(policy)).toBe(hours));
});
