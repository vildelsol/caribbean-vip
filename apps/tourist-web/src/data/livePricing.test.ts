import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_ISLANDS } from '@cvip/demo';
import { mapPricing } from './catalogueMapping';
import { allInFromMinor, experiencesFor, priceFor, promotedExperiencesOn, pricingConfig } from './catalogue';
import { demoSnapshot, installCatalogue, resetCatalogue } from './catalogueSource';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

afterEach(resetCatalogue);

describe('mapPricing', () => {
  it('reads the two rates and keeps the demo commission, which guests never pay or see', () => {
    expect(mapPricing({ tax_rate: 0.2, service_fee_rate: '0.07' })).toEqual({ taxRate: 0.2, serviceFeeRate: 0.07, commissionRate: 0.12 });
  });
  it('falls back to the checkout function\'s own defaults when a rate is not set', () => {
    expect(mapPricing(null)).toMatchObject({ taxRate: 0.15, serviceFeeRate: 0.05 });
    expect(mapPricing({})).toMatchObject({ taxRate: 0.15, serviceFeeRate: 0.05 });
  });
  it('accepts a legitimate zero rate (tax-free is a real configuration)', () => {
    expect(mapPricing({ tax_rate: 0, service_fee_rate: 0 })).toMatchObject({ taxRate: 0, serviceFeeRate: 0 });
  });
  it.each([[{ tax_rate: 15 }], [{ tax_rate: -0.1 }], [{ tax_rate: 'abc' }], [{ service_fee_rate: 1.5 }], [{ service_fee_rate: {} }]])(
    'throws on the impossible rate %j rather than quoting a wrong total',
    (row) => expect(() => mapPricing(row)).toThrow(/pricing:/),
  );
});

describe('quotes follow the installed rates', () => {
  const listing = DEMO_ISLANDS.filter((i) => i.is_active).flatMap((i) => experiencesFor(i.id))[0]!;
  const party = { adults: 1, children: 0, photoPackage: false };

  it('changes the total when the server rates change, and agrees with the browse price', () => {
    const before = allInFromMinor(listing);
    installCatalogue({ ...demoSnapshot(), pricing: { taxRate: 0.3, serviceFeeRate: 0.1, commissionRate: 0.12 } });
    const quote = priceFor(listing, party, 1);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    const base = listing.fromAmountMinor;
    expect(quote.breakdown.total.amountMinor).toBe(base + Math.round(base * 0.3) + Math.round(base * 0.1));
    expect(allInFromMinor(listing)).toBe(quote.breakdown.total.amountMinor);
    expect(allInFromMinor(listing)).toBeGreaterThan(before);
  });

  it('uses the demo rates when nothing is installed (positive control)', () => {
    expect(pricingConfig()).toMatchObject({ taxRate: 0.15, serviceFeeRate: 0.05 });
  });
});

describe('the demo promotion in live mode', () => {
  it('matches no listing, so the made-up rum punch cannot appear against real ones', () => {
    installCatalogue({ ...demoSnapshot(), experiences: [], vendors: [] });
    for (const i of DEMO_ISLANDS) expect(promotedExperiencesOn(i.id)).toEqual([]);
  });
});

describe('the app has no second source of rates', () => {
  it('no screen or helper hard-codes a tax or service fee rate', () => {
    const dir = join(__dirname, '..');
    const files = ['screens/Checkout.tsx', 'screens/ExperienceDetail.tsx', 'data/catalogue.ts'];
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/\b0\.15\b|\b0\.05\b|\btaxRate:\s*[0-9]/);
    }
  });
});
