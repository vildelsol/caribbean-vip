import { describe, expect, it } from 'vitest';
import { DEMO_ISLANDS, DEMO_PRICING_CONFIG } from '@cvip/demo';
import { allInFromMinor, experiencesFor, priceFor } from './catalogue';
import { pickupTime } from './availability';

/**
 * The advertised price and the charged price.
 *
 * These exist because the two used to disagree by 20% — every browse surface said "From US$98"
 * and checkout said US$117.60. The first test is the one that matters: it fails the moment a
 * screen goes back to showing a number the guest will not be charged.
 */
describe('advertised price', () => {
  const everyExperience = DEMO_ISLANDS.filter((i) => i.is_active).flatMap((i) => experiencesFor(i.id));

  it('has something to check', () => {
    expect(everyExperience.length).toBeGreaterThan(0);
  });

  it('is exactly what one adult is charged at checkout, on every listing', () => {
    for (const e of everyExperience) {
      const quote = priceFor(e, { adults: 1, children: 0, photoPackage: false }, 1);
      expect(quote.ok, e.id).toBe(true);
      if (!quote.ok) continue;
      expect(allInFromMinor(e), e.id).toBe(quote.breakdown.total.amountMinor);
    }
  });

  it('is never below the vendor rate it is derived from', () => {
    for (const e of everyExperience) {
      expect(allInFromMinor(e), e.id).toBeGreaterThanOrEqual(e.fromAmountMinor);
    }
  });

  /**
   * Pins the reveal itself rather than a rate: if tax or the service fee is ever re-added on top
   * of an already-inclusive browse price, this is what catches the double-charge.
   */
  it('carries tax and the service fee exactly once', () => {
    const { taxRate, serviceFeeRate } = DEMO_PRICING_CONFIG;
    for (const e of everyExperience) {
      const base = e.fromAmountMinor;
      const expected = base + Math.round(base * taxRate) + Math.round(base * serviceFeeRate);
      expect(allInFromMinor(e), e.id).toBe(expected);
    }
  });

  it('is a whole number of cents', () => {
    for (const e of everyExperience) {
      expect(Number.isInteger(allInFromMinor(e)), e.id).toBe(true);
    }
  });
});

describe('pickup time', () => {
  it('reads back as a clock time at every departure in the catalogue', () => {
    for (const time of ['07:00', '09:00', '10:30', '13:30', '15:00', '17:45']) {
      expect(pickupTime(time)).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
    }
  });

  /** The underflow: 00:20 minus a 35-minute lead is the previous evening, not a negative hour. */
  it('wraps into the previous day instead of going negative', () => {
    expect(pickupTime('00:20')).toBe('11:45 PM');
    expect(pickupTime('00:35')).toBe('12:00 AM');
  });

  it('subtracts exactly the 35-minute lead', () => {
    expect(pickupTime('09:00')).toBe('8:25 AM');
    expect(pickupTime('13:30')).toBe('12:55 PM');
  });
});
