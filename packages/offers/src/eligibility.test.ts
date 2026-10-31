import { describe, expect, it } from 'vitest';
import { findEligibleOffer, fenceBlocker, type EligibilityInput, type OfferFence, type OfferPromotion } from './eligibility.ts';
import { isScheduleActiveInZone, localDayAndMinute } from './geofence.ts';

const HERE = { lat: 18.4, lng: -77.1 };
// About 111 m north of HERE per 0.001 degree of latitude.
const at = (metresNorth: number) => ({ lat: HERE.lat + metresNorth / 111_195, lng: HERE.lng });

// Friday 2026-10-30 18:00 in Kingston (UTC-5) is 23:00 UTC.
const NOW = new Date('2026-10-30T23:00:00Z');

function fence(over: Partial<OfferFence> = {}): OfferFence {
  return { geofenceId: 'f1', centre: HERE, radiusMetres: 250, isActive: true, schedule: {}, cooldownMinutes: 1440, ...over };
}

function promo(over: Partial<OfferPromotion> = {}): OfferPromotion {
  return {
    promotionId: 'p1',
    islandId: 'jm',
    timeZone: 'America/Jamaica',
    vendorStatus: 'approved',
    approvalState: 'approved',
    isDemo: false,
    title: 'Free rum punch',
    description: null,
    terms: 'One per guest.',
    valueKind: 'in_kind',
    valueRate: null,
    valueAmountMinor: null,
    currency: null,
    startsAt: '2026-10-01T00:00:00Z',
    endsAt: '2026-12-01T00:00:00Z',
    inventoryLimit: null,
    issuedCount: 0,
    fences: [fence()],
    ...over,
  };
}

function input(over: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    position: { coordinates: HERE },
    islandId: 'jm',
    now: NOW,
    consent: { osLocationGranted: true, offerOptIn: true },
    viewerIsAdmin: false,
    promotions: [promo()],
    claimedPromotionIds: new Set(),
    lastShownAtMs: new Map(),
    ...over,
  };
}

const blocker = (p: Partial<OfferPromotion>, f: Partial<OfferFence> = {}, i: Partial<EligibilityInput> = {}) =>
  fenceBlocker(promo({ ...p, fences: [fence(f)] }), fence(f), input(i));

describe('findEligibleOffer', () => {
  it('offers the promotion to a consenting guest standing in its fence', () => {
    const r = findEligibleOffer(input());
    expect(r.eligible && r.offer.promotion.promotionId).toBe('p1');
  });

  it('needs both consents, independently', () => {
    expect(findEligibleOffer(input({ consent: { osLocationGranted: true, offerOptIn: false } }))).toEqual({ eligible: false, reason: 'no-consent' });
    expect(findEligibleOffer(input({ consent: { osLocationGranted: false, offerOptIn: true } }))).toEqual({ eligible: false, reason: 'no-consent' });
  });

  it('says there is no offer when nothing qualifies', () => {
    expect(findEligibleOffer(input({ promotions: [] }))).toEqual({ eligible: false, reason: 'no-offer' });
    expect(findEligibleOffer(input({ position: { coordinates: at(5000) } }))).toEqual({ eligible: false, reason: 'no-offer' });
  });

  it('chooses the nearest of several qualifying fences, whatever the row order', () => {
    const near = promo({ promotionId: 'near', fences: [fence({ geofenceId: 'fn', centre: at(50) })] });
    const far = promo({ promotionId: 'far', fences: [fence({ geofenceId: 'ff', centre: at(200) })] });
    for (const promotions of [[near, far], [far, near]]) {
      const r = findEligibleOffer(input({ promotions }));
      expect(r.eligible && r.offer.promotion.promotionId).toBe('near');
    }
  });

  it('skips a nearer fence that is blocked and offers the next qualifying one', () => {
    const blocked = promo({ promotionId: 'blocked', approvalState: 'disabled', fences: [fence({ geofenceId: 'fb', centre: at(10) })] });
    const ok = promo({ promotionId: 'ok', fences: [fence({ geofenceId: 'fo', centre: at(200) })] });
    const r = findEligibleOffer(input({ promotions: [blocked, ok] }));
    expect(r.eligible && r.offer.promotion.promotionId).toBe('ok');
  });

  it('breaks an exact tie by fence id, so the answer is stable', () => {
    const a = promo({ promotionId: 'a', fences: [fence({ geofenceId: 'fa' })] });
    const b = promo({ promotionId: 'b', fences: [fence({ geofenceId: 'fb' })] });
    for (const promotions of [[a, b], [b, a]]) {
      const r = findEligibleOffer(input({ promotions }));
      expect(r.eligible && r.offer.fence.geofenceId).toBe('fa');
    }
  });
});

describe('fenceBlocker', () => {
  it('is null for a qualifying fence (positive control for every refusal below)', () => {
    expect(blocker({})).toBeNull();
  });

  it('refuses another island', () => expect(blocker({ islandId: 'bb' })).toBe('wrong-island'));
  it.each(['pending', 'rejected', 'disabled'] as const)('refuses a %s promotion', (approvalState) =>
    expect(blocker({ approvalState })).toBe('not-approved'));
  it.each(['pending_review', 'suspended', 'rejected'] as const)('refuses a vendor that is %s', (vendorStatus) =>
    expect(blocker({ vendorStatus })).toBe('vendor-not-approved'));

  it('shows a test offer to an administrator only', () => {
    expect(blocker({ isDemo: true })).toBe('test-offer');
    expect(blocker({ isDemo: true }, {}, { viewerIsAdmin: true })).toBeNull();
  });

  it('respects the window, to the instant', () => {
    expect(blocker({ startsAt: '2026-10-30T23:00:01Z' })).toBe('not-started');
    expect(blocker({ startsAt: '2026-10-30T23:00:00Z' })).toBeNull();
    expect(blocker({ endsAt: '2026-10-30T22:59:59Z' })).toBe('ended');
    expect(blocker({ endsAt: '2026-10-30T23:00:00Z' })).toBeNull();
  });

  it('stops at the inventory limit, and not before', () => {
    expect(blocker({ inventoryLimit: 10, issuedCount: 10 })).toBe('sold-out');
    expect(blocker({ inventoryLimit: 10, issuedCount: 9 })).toBeNull();
    expect(blocker({ inventoryLimit: 0 })).toBe('sold-out');
    expect(blocker({ inventoryLimit: null, issuedCount: 9999 })).toBeNull();
  });

  it('does not offer what the guest already holds', () => {
    expect(blocker({}, {}, { claimedPromotionIds: new Set(['p1']) })).toBe('already-claimed');
    expect(blocker({}, {}, { claimedPromotionIds: new Set(['other']) })).toBeNull();
  });

  it('refuses an inactive fence', () => expect(blocker({}, { isActive: false })).toBe('fence-inactive'));

  it('holds an offer inside its cooldown, and releases it at the boundary', () => {
    const shown = (minutesAgo: number) => new Map([['p1', NOW.getTime() - minutesAgo * 60_000]]);
    expect(blocker({}, { cooldownMinutes: 60 }, { lastShownAtMs: shown(59) })).toBe('cooldown');
    expect(blocker({}, { cooldownMinutes: 60 }, { lastShownAtMs: shown(60) })).toBeNull();
    expect(blocker({}, { cooldownMinutes: 0 }, { lastShownAtMs: shown(1) })).toBeNull();
  });

  it('is per promotion: another offer being on cooldown does not block this one', () => {
    expect(blocker({}, {}, { lastShownAtMs: new Map([['other', NOW.getTime()]]) })).toBeNull();
  });

  it('uses the fence radius, with the 250 m default for a fence without one', () => {
    expect(blocker({}, { radiusMetres: 100 }, { position: { coordinates: at(120) } })).toBe('too-far');
    expect(blocker({}, { radiusMetres: 300 }, { position: { coordinates: at(280) } })).toBeNull();
    expect(blocker({}, { radiusMetres: 0 }, { position: { coordinates: at(240) } })).toBeNull();
    expect(blocker({}, { radiusMetres: 0 }, { position: { coordinates: at(260) } })).toBe('too-far');
  });

  it('refuses a fix whose accuracy is wider than the fence, and accepts one inside it', () => {
    expect(blocker({}, { radiusMetres: 100 }, { position: { coordinates: HERE, accuracyMetres: 150 } })).toBe('coarse-fix');
    expect(blocker({}, { radiusMetres: 100 }, { position: { coordinates: HERE, accuracyMetres: 100 } })).toBeNull();
    expect(blocker({}, { radiusMetres: 100 }, { position: { coordinates: HERE } })).toBeNull();
  });
});

describe('schedule on the island clock', () => {
  it('reads the wall clock of the zone, not of the machine', () => {
    // 23:00 UTC Friday is 18:00 Friday in Jamaica and 19:00 Friday in Barbados.
    expect(localDayAndMinute(NOW, 'America/Jamaica')).toEqual({ day: 5, minute: 18 * 60 });
    expect(localDayAndMinute(NOW, 'America/Barbados')).toEqual({ day: 5, minute: 19 * 60 });
    // 03:00 UTC Saturday is still Friday 22:00 in Jamaica.
    expect(localDayAndMinute(new Date('2026-10-31T03:00:00Z'), 'America/Jamaica')).toEqual({ day: 5, minute: 22 * 60 });
  });

  it('turns a fence on and off by island time', () => {
    const evening = { activeFromTime: '18:30', activeToTime: '23:00' };
    // 18:00 in Jamaica is before the window; the same instant is 19:00 in Barbados, inside it.
    expect(isScheduleActiveInZone(evening, NOW, 'America/Jamaica')).toBe(false);
    expect(isScheduleActiveInZone(evening, NOW, 'America/Barbados')).toBe(true);
  });

  it('keeps an overnight window with the day it started, in the zone', () => {
    const night = { activeDays: [5], activeFromTime: '22:00', activeToTime: '02:00' };
    expect(isScheduleActiveInZone(night, new Date('2026-10-31T03:00:00Z'), 'America/Jamaica')).toBe(true); // Fri 22:00
    expect(isScheduleActiveInZone(night, new Date('2026-10-31T06:30:00Z'), 'America/Jamaica')).toBe(true); // Sat 01:30, Friday's window
    expect(isScheduleActiveInZone(night, new Date('2026-11-01T06:30:00Z'), 'America/Jamaica')).toBe(false); // Sun 01:30
  });

  it('treats an unknown zone as inactive, never always-on', () => {
    expect(localDayAndMinute(NOW, 'Not/AZone')).toBeNull();
    expect(isScheduleActiveInZone({}, NOW, 'Not/AZone')).toBe(false);
    expect(blocker({ timeZone: 'Not/AZone' })).toBe('outside-schedule');
  });

  it('blocks a fence outside its schedule through the whole rule', () => {
    expect(blocker({}, { schedule: { activeFromTime: '19:00', activeToTime: '23:00' } })).toBe('outside-schedule');
    expect(blocker({}, { schedule: { activeFromTime: '17:00', activeToTime: '23:00' } })).toBeNull();
  });
});
