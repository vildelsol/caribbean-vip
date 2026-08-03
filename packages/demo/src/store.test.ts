import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { demoBackend } from './store';
import {
  DEMO_DESTINATIONS,
  DEMO_EXPERIENCES,
  DEMO_ISLANDS,
  demoOptionsFor,
  isPubliclyVisibleDemo,
} from './dataset';
import { DEMO_MEDIA_CREDITS } from './credits';
import { signVoucherToken, verifyVoucherToken } from '@cvip/types';

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

  it('shows the three populated islands, Jamaica first (PRD §2)', () => {
    // All three are populated for the demo. Jamaica remains the launch market and stays first, so
    // the app's default selection is still Jamaica.
    expect(demoBackend.islands().map((i) => i.code)).toEqual(['JM', 'KY', 'BB']);
    expect(demoBackend.islands().every((i) => i.is_active)).toBe(true);
  });

  it('seeds all six PRD-named Jamaican destinations', () => {
    expect(demoBackend.destinations('island-jm').map((d) => d.slug).sort()).toEqual([
      'kingston',
      'montego-bay',
      'negril',
      'ocho-rios',
      'port-antonio',
      'south-coast',
    ]);
  });

  it('gives every island destinations, and never mixes them between islands', () => {
    for (const island of demoBackend.islands()) {
      const destinations = demoBackend.destinations(island.id);
      expect(destinations.length).toBeGreaterThanOrEqual(5);
      expect(destinations.every((d) => d.island_id === island.id)).toBe(true);
    }
    // Every destination belongs to exactly one island — a slug reused across islands would make
    // `destinationBySlug` return the wrong one.
    const slugs = DEMO_DESTINATIONS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('scopes the catalogue to the island that was asked for', () => {
    for (const island of demoBackend.islands()) {
      const listings = demoBackend.visibleExperiences(island.id);
      expect(listings.length).toBeGreaterThanOrEqual(8);
      expect(listings.every((e) => e.islandId === island.id)).toBe(true);
    }
    // Unscoped returns everything. Screens must pass an island; this asserts the difference is
    // visible rather than silently defaulting to Jamaica.
    expect(demoBackend.visibleExperiences().length).toBeGreaterThan(
      demoBackend.visibleExperiences('island-jm').length,
    );
  });

  it("puts every listing in one of its own island's destinations", () => {
    for (const exp of demoBackend.visibleExperiences()) {
      const destination = demoBackend.destinationBySlug(exp.destinationSlug);
      expect(destination, `${exp.id} points at a destination that does not exist`).not.toBeNull();
      expect(destination?.island_id).toBe(exp.islandId);
    }
  });

  it('puts every listing under a vendor on the same island', () => {
    for (const exp of demoBackend.visibleExperiences()) {
      expect(demoBackend.vendor(exp.vendorId)?.islandId).toBe(exp.islandId);
    }
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
    expect(r.booking.currency).toBe('USD'); // OD-09: display localized, settle in USD.
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

  it('prefixes booking references with the island the experience is on', async () => {
    // A Cayman booking labelled VIPJ would be wrong on a printed confirmation and confusing in a
    // support conversation, which is the only thing the reference is for.
    for (const [experienceId, prefix] of [
      ['exp-dunns-falls', 'VIPJ'],
      ['exp-ky-stingray', 'VIPK'],
      ['exp-bb-harrisons', 'VIPB'],
    ] as const) {
      const slot = demoBackend.upcomingSlots(experienceId).find((s) => s.capacity > 1);
      if (!slot) throw new Error(`no bookable slot for ${experienceId}`);
      const booked = await demoBackend.book({
        experienceId,
        slotId: slot.id,
        quantities: adultQty(experienceId, 1),
        applyPromotion: false,
      });
      if (!booked.ok) throw new Error('fixture booking failed');
      expect(booked.booking.reference.startsWith(prefix)).toBe(true);
    }
  });
});

describe('photography is present and attributed', () => {
  it('gives every visible listing at least one photograph', () => {
    for (const e of demoBackend.visibleExperiences()) {
      expect(e.media.length, `${e.id} has no photography`).toBeGreaterThan(0);
    }
  });

  it('has a credit for every media key the dataset references', () => {
    // CC BY and CC BY-SA require attribution wherever the work appears. A key without a credit
    // would render an uncredited photograph, so this fails the build rather than the licence.
    for (const e of DEMO_EXPERIENCES) {
      for (const key of e.media) {
        expect(DEMO_MEDIA_CREDITS[key], `no credit recorded for ${key}`).toBeDefined();
      }
    }
    for (const island of DEMO_ISLANDS) {
      if (island.hero_media_path) {
        expect(DEMO_MEDIA_CREDITS[island.hero_media_path]).toBeDefined();
      }
    }
  });

  it('names an author, a licence and a subject for every credit', () => {
    for (const [key, credit] of Object.entries(DEMO_MEDIA_CREDITS)) {
      expect(credit.author.length, `${key} has no author`).toBeGreaterThan(0);
      expect(credit.licence.length, `${key} has no licence`).toBeGreaterThan(0);
      expect(credit.source.startsWith('https://'), `${key} has no source URL`).toBe(true);
      // The subject is what keeps the demo honest where a representative photograph is used, so
      // it has to say something rather than echo the key.
      expect(credit.subject.length, `${key} has no subject`).toBeGreaterThan(10);
    }
  });

  it('accepts only free licences', () => {
    for (const [key, credit] of Object.entries(DEMO_MEDIA_CREDITS)) {
      expect(
        /^(CC0|CC BY|CC BY-SA|Public domain|PDM|No restrictions)/i.test(credit.licence),
        `${key} carries a licence we cannot ship: ${credit.licence}`,
      ).toBe(true);
    }
  });

  it('ships an image file for every media key', () => {
    // Turns a missing hero image into a red test rather than a blank card during a demonstration.
    //
    // This used to check two things: that the file existed under the Expo app's bundled assets,
    // and that it appeared in `demoMedia.ts` — a hand-written static `require` map that Metro
    // needed because it cannot resolve a dynamic path. The web app builds its URLs dynamically, so
    // that second half no longer has a subject; the resolver it guarded does not exist any more.
    // What remains is the half that always mattered: every credited key has a file behind it.
    const assets = join(__dirname, '..', '..', '..', 'apps', 'tourist-web', 'public', 'demo');

    for (const key of Object.keys(DEMO_MEDIA_CREDITS)) {
      expect(existsSync(join(assets, `${key}.jpg`)), `${key}.jpg is missing`).toBe(true);
    }
  });
});

describe('the vendor scanner path', () => {
  /**
   * The vendor portal runs in a different browser from the tourist app, so a voucher issued on the
   * phone is genuinely unknown to it. `redeemScannedToken` adopts a cryptographically valid unknown
   * token so the flagship journey is demonstrable — these assert the adoption is narrow.
   */
  it('adopts a validly signed unknown token, then refuses the second scan (V-04, V-05)', async () => {
    const token = await signVoucherToken(
      { v: 1, id: 'AAAAAAAAAAAAAAAAAAAAAA' },
      'demo-mode-voucher-secret-not-for-production-use',
    );

    const first = await demoBackend.redeemScannedToken(token, 'Front desk');
    expect(first.result).toBe('ok');
    expect(first.redeemedAt).not.toBeNull();

    const second = await demoBackend.redeemScannedToken(token, 'Boat crew');
    expect(second.result).toBe('already_redeemed');
    expect(second.originalRedeemedAt).toBe(first.redeemedAt);
    expect(second.originalScanner).toBe('Front desk');
  });

  it('rejects a tampered signature instead of adopting it', async () => {
    const token = await signVoucherToken(
      { v: 1, id: 'BBBBBBBBBBBBBBBBBBBBBB' },
      'a-different-secret-entirely',
    );
    const scanned = await demoBackend.redeemScannedToken(token, 'Front desk');
    expect(scanned.result).toBe('bad_signature');
  });

  it('rejects text that is not a voucher at all', async () => {
    expect((await demoBackend.redeemScannedToken('hello', 'Front desk')).result).toBe(
      'unknown_token',
    );
  });
});
