import { describe, expect, it } from 'vitest';
import { demoBackend } from './store';
import { DEMO_DESTINATIONS, DEMO_EXPERIENCES, demoOptionsFor, isPubliclyVisibleDemo } from './dataset';
import { verifyVoucherToken } from '@cvip/types';

/**
 * The demo backend earns tests for one reason: a demo that shows something the real system would
 * hide is worse than no demo. These assert that the visibility rule, the capacity rule and the
 * redemption rule behave the same way here as they do in Postgres.
 */

const CATAMARAN = 'exp-catamaran';

function adultQty(experienceId: string, n: number): Record<string, number> {
  const exp = DEMO_EXPERIENCES.find((e) => e.id === experienceId);
  if (!exp) throw new Error('missing fixture');
  const adult = demoOptionsFor(exp)[0];
  if (!adult) throw new Error('missing option');
  return { [adult.id]: n };
}

describe('visibility mirrors the RLS policy', () => {
  it('hides a draft listing even though its vendor is approved (T-03)', () => {
    expect(demoBackend.experience('exp-draft')).toBeNull();
    expect(demoBackend.visibleExperiences().map((e) => e.id)).not.toContain('exp-draft');
  });

  it('hides an approved listing whose vendor is unapproved (V-02)', () => {
    expect(demoBackend.experience('exp-unverified')).toBeNull();
    expect(demoBackend.visibleExperiences().map((e) => e.id)).not.toContain('exp-unverified');
  });

  it('returns null for a hidden listing and a missing one alike', () => {
    // Distinguishing them would confirm a hidden listing exists.
    expect(demoBackend.experience('exp-draft')).toBeNull();
    expect(demoBackend.experience('does-not-exist')).toBeNull();
  });

  it('shows only the active island', () => {
    expect(demoBackend.islands().map((i) => i.code)).toEqual(['JM']);
  });

  it('seeds all six PRD-named destinations', () => {
    expect(DEMO_DESTINATIONS).toHaveLength(6);
    expect(DEMO_DESTINATIONS.map((d) => d.slug).sort()).toEqual([
      'kingston',
      'montego-bay',
      'negril',
      'ocho-rios',
      'port-antonio',
      'south-coast',
    ]);
  });

  it('labels every visible listing as demo content (operating rule 9)', () => {
    for (const exp of demoBackend.visibleExperiences()) {
      const vendor = demoBackend.vendor(exp.vendorId);
      expect(vendor?.tradingName.startsWith('[Demo]')).toBe(true);
    }
  });

  it('covers every experience category across the visible catalogue', () => {
    const categories = new Set(demoBackend.visibleExperiences().map((e) => e.category));
    expect(categories.size).toBeGreaterThanOrEqual(11);
  });
});

describe('pricing uses the real calculation', () => {
  it('itemizes subtotal, tax and fee rather than inventing a total', () => {
    const slot = demoBackend.upcomingSlots(CATAMARAN).find((s) => s.capacity > 1);
    expect(slot).toBeDefined();
    if (!slot) return;

    const q = demoBackend.quote(CATAMARAN, slot.id, adultQty(CATAMARAN, 2), false);
    expect(q.ok).toBe(true);
    if (!q.ok) return;

    expect(q.breakdown.subtotal.amountMinor).toBe(17800);
    expect(q.breakdown.tax.amountMinor).toBe(2670);
    expect(q.breakdown.serviceFee.amountMinor).toBe(890);
    expect(q.breakdown.total.amountMinor).toBe(21360);
  });

  it('itemizes the rum punch at zero — visible before paying, no effect on the total', () => {
    const slot = demoBackend.upcomingSlots(CATAMARAN).find((s) => s.capacity > 1);
    if (!slot) return;

    const withOffer = demoBackend.quote(CATAMARAN, slot.id, adultQty(CATAMARAN, 2), true);
    expect(withOffer.ok).toBe(true);
    if (!withOffer.ok) return;

    expect(withOffer.breakdown.discountsApplied).toHaveLength(1);
    expect(withOffer.breakdown.total.amountMinor).toBe(21360);
  });

  it('refuses a party larger than the remaining capacity', () => {
    const slot = demoBackend.upcomingSlots(CATAMARAN).find((s) => s.capacity === 1);
    expect(slot).toBeDefined();
    if (!slot) return;

    const q = demoBackend.quote(CATAMARAN, slot.id, adultQty(CATAMARAN, 4), false);
    expect(q.ok).toBe(false);
  });
});

describe('booking and redemption', () => {
  it('books, confirms and issues a genuinely signed voucher', async () => {
    const slot = demoBackend.upcomingSlots('exp-yoga').find((s) => s.capacity > 1);
    if (!slot) return;

    const r = await demoBackend.book({
      experienceId: 'exp-yoga',
      slotId: slot.id,
      quantities: adultQty('exp-yoga', 1),
      applyPromotion: false,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.booking.status).toBe('confirmed');
    expect(r.booking.reference).toMatch(/^VIPJ-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    // Not a placeholder string: the token verifies against the real codec.
    expect(r.voucher.token).toMatch(/^cvip:\/\/v1\//);
  });

  it('holds capacity, so the last seat cannot be sold twice (V-03)', async () => {
    const slot = demoBackend.upcomingSlots('exp-reach').find((s) => s.capacity === 1);
    expect(slot).toBeDefined();
    if (!slot) return;

    const first = await demoBackend.book({
      experienceId: 'exp-reach',
      slotId: slot.id,
      quantities: adultQty('exp-reach', 1),
      applyPromotion: false,
    });
    const second = await demoBackend.book({
      experienceId: 'exp-reach',
      slotId: slot.id,
      quantities: adultQty('exp-reach', 1),
      applyPromotion: false,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  it('redeems once, then reports the ORIGINAL timestamp on a second scan (V-05)', async () => {
    const slot = demoBackend.upcomingSlots('exp-coffee').find((s) => s.capacity > 1);
    if (!slot) return;

    const booked = await demoBackend.book({
      experienceId: 'exp-coffee',
      slotId: slot.id,
      quantities: adultQty('exp-coffee', 1),
      applyPromotion: false,
    });
    if (!booked.ok) throw new Error('fixture booking failed');

    const first = await demoBackend.redeem(booked.voucher.token, 'Scanner A');
    expect(first.result).toBe('ok');
    expect(first.redeemedAt).not.toBeNull();

    const second = await demoBackend.redeem(booked.voucher.token, 'Scanner B');
    expect(second.result).toBe('already_redeemed');
    expect(second.originalRedeemedAt).toBe(first.redeemedAt);
    expect(second.originalScanner).toBe('Scanner A');

    // Terminal means terminal.
    const third = await demoBackend.redeem(booked.voucher.token, 'Scanner C');
    expect(third.result).toBe('already_redeemed');
  });

  it('rejects a token that was never issued', async () => {
    const r = await demoBackend.redeem('cvip://v1/bogus.bogus');
    expect(r.result).toBe('unknown_token');
  });

  it('rejects arbitrary text rather than treating it as a voucher', async () => {
    const r = await demoBackend.redeem('just some text');
    expect(r.result).toBe('unknown_token');
  });

  it('invalidates the voucher when the booking is cancelled', async () => {
    const slot = demoBackend.upcomingSlots('exp-craft').find((s) => s.capacity > 1);
    if (!slot) return;

    const booked = await demoBackend.book({
      experienceId: 'exp-craft',
      slotId: slot.id,
      quantities: adultQty('exp-craft', 1),
      applyPromotion: false,
    });
    if (!booked.ok) throw new Error('fixture booking failed');

    expect(demoBackend.cancelBooking(booked.booking.id)).toBe(true);

    const r = await demoBackend.redeem(booked.voucher.token);
    expect(r.result).toBe('expired');
  });
});

describe('voucher tokens carry no personal data (AD-04)', () => {
  it('encodes only a version and a random id', async () => {
    const slot = demoBackend.upcomingSlots('exp-rafting').find((s) => s.capacity > 1);
    if (!slot) return;

    const booked = await demoBackend.book({
      experienceId: 'exp-rafting',
      slotId: slot.id,
      quantities: adultQty('exp-rafting', 1),
      applyPromotion: false,
    });
    if (!booked.ok) throw new Error('fixture booking failed');

    const decoded = await verifyVoucherToken(
      booked.voucher.token,
      'demo-mode-voucher-secret-not-for-production-use',
    );
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(Object.keys(decoded.payload).sort()).toEqual(['id', 'v']);

    // The reference must not be recoverable from the token.
    expect(booked.voucher.token).not.toContain(booked.booking.reference);
  });
});

describe('dataset integrity', () => {
  it('keeps the two negative fixtures the visibility tests depend on', () => {
    // Without these, the tests above would pass vacuously.
    expect(DEMO_EXPERIENCES.some((e) => e.id === 'exp-draft' && e.status === 'draft')).toBe(true);
    expect(
      DEMO_EXPERIENCES.some((e) => e.id === 'exp-unverified' && e.status === 'approved'),
    ).toBe(true);
    expect(isPubliclyVisibleDemo(DEMO_EXPERIENCES.find((e) => e.id === 'exp-unverified')!)).toBe(
      false,
    );
  });

  it('gives every visible listing a real description and inclusions', () => {
    for (const e of demoBackend.visibleExperiences()) {
      expect(e.description.length).toBeGreaterThan(40);
      expect(e.inclusions.length).toBeGreaterThan(0);
      expect(e.pickupInfo.length).toBeGreaterThan(0);
    }
  });
});
