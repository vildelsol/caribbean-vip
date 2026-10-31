import { describe, expect, it } from 'vitest';
import { findEligibleOffer } from '../../../packages/offers/src/index.ts';
import {
  claimedPromotionIds,
  lastShownAtMs,
  parseOfferRequest,
  toOfferPromotions,
  toOfferResponse,
  type GeofenceRow,
  type PromotionRow,
} from './offerQuery';

describe('what eligible-offer accepts', () => {
  const ok = { lat: 18.4, lng: -77.1, islandCode: 'jm' };

  it('takes a position and an island, upper-casing the code', () => {
    expect(parseOfferRequest(ok)).toEqual({ ok: true, lat: 18.4, lng: -77.1, accuracyMetres: undefined, islandCode: 'JM' });
    expect(parseOfferRequest({ ...ok, accuracyMetres: 12 })).toMatchObject({ ok: true, accuracyMetres: 12 });
    expect(parseOfferRequest({ ...ok, accuracyMetres: null })).toMatchObject({ ok: true, accuracyMetres: undefined });
  });

  it.each([
    ['no body', null],
    ['a string body', 'hello'],
    ['a string latitude', { ...ok, lat: '18.4' }],
    ['latitude out of range', { ...ok, lat: 91 }],
    ['longitude out of range', { ...ok, lng: -181 }],
    ['NaN', { ...ok, lat: NaN }],
    ['Infinity', { ...ok, lng: Infinity }],
    ['negative accuracy', { ...ok, accuracyMetres: -1 }],
    ['text accuracy', { ...ok, accuracyMetres: 'low' }],
    ['no island', { lat: 18.4, lng: -77.1 }],
    ['a long island code', { ...ok, islandCode: 'JAM' }],
    ['a numeric island code', { ...ok, islandCode: 12 }],
  ])('refuses %s', (_name, body) => {
    expect(parseOfferRequest(body).ok).toBe(false);
  });

  it('does not read a user id from the body', () => {
    const r = parseOfferRequest({ ...ok, userId: 'someone-else' });
    expect(r).toEqual({ ok: true, lat: 18.4, lng: -77.1, accuracyMetres: undefined, islandCode: 'JM' });
  });
});

describe('what the guest already holds, and when they last saw an offer', () => {
  it('counts held and used vouchers, not cancelled, invalidated, expired or promotion-less ones', () => {
    const ids = claimedPromotionIds([
      { promotion_id: 'a', state: 'issued' },
      { promotion_id: 'b', state: 'redeemed' },
      { promotion_id: 'c', state: 'cancelled' },
      { promotion_id: 'd', state: 'invalidated' },
      { promotion_id: 'e', state: 'expired' },
      { promotion_id: null, state: 'issued' },
    ]);
    expect([...ids].sort()).toEqual(['a', 'b']);
  });

  it('keeps the latest impression per promotion and ignores unreadable timestamps', () => {
    const m = lastShownAtMs([
      { promotion_id: 'a', shown_at: '2026-10-30T10:00:00Z' },
      { promotion_id: 'a', shown_at: '2026-10-30T12:00:00Z' },
      { promotion_id: 'a', shown_at: '2026-10-30T11:00:00Z' },
      { promotion_id: 'b', shown_at: 'not a date' },
    ]);
    expect(m.get('a')).toBe(Date.parse('2026-10-30T12:00:00Z'));
    expect(m.has('b')).toBe(false);
  });
});

const promo: PromotionRow = {
  id: 'p1',
  vendor_org_id: 'v1',
  island_id: 'jm',
  title: 'Free rum punch',
  description: null,
  terms: 'One per guest.',
  value_kind: 'percentage',
  value_rate: '0.1000',
  value_amount_minor: null,
  currency: null,
  starts_at: '2026-10-01T00:00:00Z',
  ends_at: '2026-12-01T00:00:00Z',
  inventory_limit: 5,
  issued_count: 1,
  approval_state: 'approved',
  is_demo: false,
};
const fence: GeofenceRow = {
  id: 'f1',
  promotion_id: 'p1',
  centre_lat: 18.4,
  centre_lng: -77.1,
  radius_m: 250,
  active_days: null,
  active_from_time: null,
  active_to_time: null,
  cooldown_minutes: 1440,
  is_active: true,
};
const island = { id: 'jm', timeZone: 'America/Jamaica' };

describe('rows to offer promotions', () => {
  it('joins fences and vendor status, and reads numeric strings as numbers', () => {
    const [p] = toOfferPromotions([promo], [fence], new Map([['v1', 'approved']]), island);
    expect(p).toMatchObject({ promotionId: 'p1', vendorStatus: 'approved', valueRate: 0.1, timeZone: 'America/Jamaica', inventoryLimit: 5 });
    expect(p!.fences).toHaveLength(1);
    expect(p!.fences[0]).toMatchObject({ geofenceId: 'f1', radiusMetres: 250, cooldownMinutes: 1440 });
  });

  it('only takes the fences of its own promotion', () => {
    const [p] = toOfferPromotions([promo], [fence, { ...fence, id: 'f2', promotion_id: 'other' }], new Map([['v1', 'approved']]), island);
    expect(p!.fences.map((f) => f.geofenceId)).toEqual(['f1']);
  });

  it('fails closed when the vendor row is missing: the offer is not eligible', () => {
    const promotions = toOfferPromotions([promo], [fence], new Map(), island);
    const r = findEligibleOffer({
      position: { coordinates: { lat: 18.4, lng: -77.1 } },
      islandId: 'jm',
      now: new Date('2026-10-30T23:00:00Z'),
      consent: { osLocationGranted: true, offerOptIn: true },
      viewerIsAdmin: false,
      promotions,
      claimedPromotionIds: new Set(),
      lastShownAtMs: new Map(),
    });
    expect(r).toEqual({ eligible: false, reason: 'no-offer' });
  });

  it('is eligible end to end when the vendor is approved (positive control for the case above)', () => {
    const promotions = toOfferPromotions([promo], [fence], new Map([['v1', 'approved']]), island);
    const r = findEligibleOffer({
      position: { coordinates: { lat: 18.4, lng: -77.1 } },
      islandId: 'jm',
      now: new Date('2026-10-30T23:00:00Z'),
      consent: { osLocationGranted: true, offerOptIn: true },
      viewerIsAdmin: false,
      promotions,
      claimedPromotionIds: new Set(),
      lastShownAtMs: new Map(),
    });
    expect(r.eligible).toBe(true);
  });
});

describe('what the guest is told', () => {
  it('never includes the fence centre or radius', () => {
    const [p] = toOfferPromotions([promo], [fence], new Map([['v1', 'approved']]), island);
    const body = toOfferResponse({ promotion: p!, fence: p!.fences[0]!, distanceMetres: 123.6 });
    expect(body.distanceMetres).toBe(124);
    const text = JSON.stringify(body);
    for (const leak of ['centre', 'radius', 'lat', 'lng', '18.4', '-77.1', '250']) expect(text).not.toContain(leak);
    expect(body).toMatchObject({ promotionId: 'p1', geofenceId: 'f1', title: 'Free rum punch', valueRate: 0.1 });
  });
});
