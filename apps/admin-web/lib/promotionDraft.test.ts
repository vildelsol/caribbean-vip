import { describe, expect, it } from 'vitest';
import { buildPromotion, emptyDraft, type PromotionDraft } from './promotionDraft';

const NOW = new Date('2026-10-31T12:00:00Z');

function valid(over: Partial<PromotionDraft> = {}): PromotionDraft {
  return {
    ...emptyDraft(),
    vendorId: 'v1',
    title: 'Free rum punch',
    terms: 'One per booking.',
    startsAt: '2026-11-01T09:00',
    endsAt: '2026-12-01T09:00',
    centreLat: '18.4',
    centreLng: '-77.1',
    ...over,
  };
}

const problemsOf = (d: PromotionDraft, island: string | null = 'i1') => {
  const r = buildPromotion(d, island, NOW);
  return r.ok ? [] : r.problems;
};

describe('buildPromotion', () => {
  it('builds both rows from a valid in-kind draft, with database defaults filled in', () => {
    const r = buildPromotion(valid(), 'i1', NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.promotion).toMatchObject({
      vendor_org_id: 'v1',
      island_id: 'i1',
      value_kind: 'in_kind',
      value_rate: null,
      value_amount_minor: null,
      currency: null,
      inventory_limit: null,
      requires_booking: false,
      is_demo: false,
    });
    expect(r.geofence).toMatchObject({ radius_m: 250, active_days: [], active_from_time: null, active_to_time: null, cooldown_minutes: 1440 });
  });

  it('takes the island from the vendor, and refuses without one', () => {
    expect(problemsOf(valid(), null)).toContain('Choose a vendor.');
    expect(problemsOf(valid({ vendorId: '' }))).toContain('Choose a vendor.');
  });

  it('requires a title and terms', () => {
    expect(problemsOf(valid({ title: '  ' }))).toContain('Give the offer a title.');
    expect(problemsOf(valid({ terms: ' ' }))).toEqual(['Terms are required: the tourist sees them before claiming.']);
  });

  it('converts a percentage to a rate and refuses out-of-range values', () => {
    const r = buildPromotion(valid({ valueKind: 'percentage', percent: '12.5' }), 'i1', NOW);
    expect(r.ok && r.promotion.value_rate).toBe(0.125);
    for (const bad of ['', '0', '-5', '101', 'ten']) {
      expect(problemsOf(valid({ valueKind: 'percentage', percent: bad }))).toHaveLength(1);
    }
  });

  it('converts a fixed amount to minor units with a currency', () => {
    const r = buildPromotion(valid({ valueKind: 'fixed', amount: '15.50', currency: 'JMD' }), 'i1', NOW);
    expect(r.ok && [r.promotion.value_amount_minor, r.promotion.currency]).toEqual([1550, 'JMD']);
    expect(problemsOf(valid({ valueKind: 'fixed', amount: '0' }))).toHaveLength(1);
    expect(problemsOf(valid({ valueKind: 'fixed', amount: '5', currency: 'EUR' }))).toHaveLength(1);
  });

  it('does not carry a stale value across kinds', () => {
    const r = buildPromotion(valid({ valueKind: 'in_kind', percent: '50', amount: '10' }), 'i1', NOW);
    expect(r.ok && [r.promotion.value_rate, r.promotion.value_amount_minor, r.promotion.currency]).toEqual([null, null, null]);
  });

  it('checks the window', () => {
    expect(problemsOf(valid({ startsAt: '', endsAt: '' }))).toContain('Set both a start and an end date.');
    expect(problemsOf(valid({ endsAt: '2026-11-01T09:00' }))).toContain('The end must come after the start.');
    expect(problemsOf(valid({ startsAt: '2026-09-01T09:00', endsAt: '2026-10-01T09:00' }))).toEqual([
      'The end is already in the past, so nobody could ever see this offer.',
    ]);
  });

  it('allows a blank inventory limit, and refuses a fractional or negative one', () => {
    expect(problemsOf(valid({ inventoryLimit: '' }))).toEqual([]);
    expect(problemsOf(valid({ inventoryLimit: '0' }))).toEqual([]);
    expect(problemsOf(valid({ inventoryLimit: '2.5' }))).toHaveLength(1);
    expect(problemsOf(valid({ inventoryLimit: '-1' }))).toHaveLength(1);
  });

  it('bounds the coordinates', () => {
    expect(problemsOf(valid({ centreLat: '91' }))).toEqual(['Latitude must be between -90 and 90.']);
    expect(problemsOf(valid({ centreLng: '-181' }))).toEqual(['Longitude must be between -180 and 180.']);
    expect(problemsOf(valid({ centreLat: '' }))).toHaveLength(1);
  });

  it('bounds the radius at the database limits', () => {
    expect(problemsOf(valid({ radiusMetres: '49' }))).toHaveLength(1);
    expect(problemsOf(valid({ radiusMetres: '50' }))).toEqual([]);
    expect(problemsOf(valid({ radiusMetres: '20000' }))).toEqual([]);
    expect(problemsOf(valid({ radiusMetres: '20001' }))).toHaveLength(1);
    expect(problemsOf(valid({ radiusMetres: '250.5' }))).toHaveLength(1);
  });

  it('checks the schedule: days, time format, and a window of no length', () => {
    const r = buildPromotion(valid({ days: [5, 1, 5], fromTime: '22:00', toTime: '02:00' }), 'i1', NOW);
    expect(r.ok && r.geofence).toMatchObject({ active_days: [1, 5], active_from_time: '22:00', active_to_time: '02:00' });
    expect(problemsOf(valid({ days: [7] }))).toHaveLength(1);
    expect(problemsOf(valid({ fromTime: '9am' }))).toHaveLength(1);
    expect(problemsOf(valid({ fromTime: '24:00' }))).toHaveLength(1);
    expect(problemsOf(valid({ fromTime: '09:00', toTime: '09:00' }))).toHaveLength(1);
    expect(problemsOf(valid({ fromTime: '09:00', toTime: '' }))).toEqual([]);
  });

  it('allows a zero cooldown and refuses a negative or fractional one', () => {
    expect(problemsOf(valid({ cooldownMinutes: '0' }))).toEqual([]);
    expect(problemsOf(valid({ cooldownMinutes: '-1' }))).toHaveLength(1);
    expect(problemsOf(valid({ cooldownMinutes: '1.5' }))).toHaveLength(1);
  });

  it('flags a test offer as demo so it can be found and removed', () => {
    const r = buildPromotion(valid({ isTest: true }), 'i1', NOW);
    expect(r.ok && r.promotion.is_demo).toBe(true);
  });

  it('reports every problem at once, not just the first', () => {
    expect(problemsOf(valid({ title: '', terms: '', centreLat: '' })).length).toBe(3);
  });
});
