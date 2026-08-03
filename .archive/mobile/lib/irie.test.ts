import { describe, expect, it } from 'vitest';
import { INTENTS, applyIntent, matchIntent } from './irie';
import type { CatalogueItem } from './catalogue';

function item(over: Partial<CatalogueItem> & { id: string }): CatalogueItem {
  return {
    vendorOrgId: 'v1',
    islandId: 'jm',
    destinationId: 'd1',
    category: 'adventure',
    title: over.id,
    summary: null,
    durationMinutes: 60,
    fromAmountMinor: 5000,
    currency: 'USD',
    isDemo: true,
    heroMediaKey: null,
    ratingAverage: 4,
    ratingCount: 10,
    ...over,
  } as CatalogueItem;
}

describe('Irie intent matching', () => {
  it('matches a chip by its own label', () => {
    expect(matchIntent('Under $50')?.label).toBe('Under $50');
    expect(matchIntent('Hidden Gems')?.label).toBe('Hidden Gems');
  });

  it('matches natural phrasings', () => {
    expect(matchIntent('anything cheap to do?')?.label).toBe('Under $50');
    expect(matchIntent('what can we do with the kids')?.label).toBe('Family Activities');
    expect(matchIntent('somewhere to eat lunch')?.label).toBe('Breakfast Near Me');
    expect(matchIntent("it's raining today")).not.toBeNull();
  });

  /**
   * The behaviour that keeps this honest. There is no model here, so a miss must read as a miss —
   * a confident irrelevant answer is worse than "I can't answer that yet", and it is also what the
   * fallback path has to do when the real model is unavailable.
   */
  it('returns null rather than guessing', () => {
    expect(matchIntent('what is the vendor commission rate')).toBeNull();
    expect(matchIntent('zzzzz')).toBeNull();
  });
});

describe('Irie answers are grounded in the catalogue', () => {
  const catalogue = [
    item({ id: 'cheap-beach', category: 'beaches', fromAmountMinor: 3000, ratingAverage: 4.2 }),
    item({ id: 'pricey-dive', category: 'water_sports', fromAmountMinor: 20000, ratingAverage: 4.9 }),
    item({ id: 'family-boat', category: 'family', fromAmountMinor: 4000, ratingAverage: 4.5 }),
  ];

  it('only ever returns items it was given — it cannot invent a listing', () => {
    const ids = new Set(catalogue.map((i) => i.id));
    for (const intent of INTENTS) {
      for (const result of applyIntent(intent, catalogue)) {
        expect(ids.has(result.id)).toBe(true);
      }
    }
  });

  it('respects a price ceiling', () => {
    const under50 = INTENTS.find((i) => i.label === 'Under $50')!;
    const out = applyIntent(under50, catalogue);
    expect(out.every((i) => i.fromAmountMinor <= 5000)).toBe(true);
    expect(out.map((i) => i.id)).not.toContain('pricey-dive');
  });

  it('prefers the requested categories', () => {
    const family = INTENTS.find((i) => i.label === 'Family Activities')!;
    expect(applyIntent(family, catalogue).map((i) => i.id)).toContain('family-boat');
  });

  /**
   * A chip the app itself offered must never produce an empty answer — that is a dead end the
   * guest cannot get out of, and it looks like the app is broken rather than the catalogue thin.
   */
  it('never returns nothing for a chip it offers', () => {
    for (const intent of INTENTS) {
      expect(applyIntent(intent, catalogue).length, intent.label).toBeGreaterThan(0);
    }
  });

  it('returns nothing only when there is genuinely nothing', () => {
    expect(applyIntent(INTENTS[0]!, [])).toEqual([]);
  });

  it('sorts by rating and caps the answer so a reply stays scannable', () => {
    const many = Array.from({ length: 20 }, (_, n) =>
      item({ id: `x${n}`, ratingAverage: n / 10, fromAmountMinor: 1000 }),
    );
    const out = applyIntent(INTENTS[1]!, many);
    expect(out.length).toBeLessThanOrEqual(6);
    expect(out[0]!.ratingAverage).toBeGreaterThanOrEqual(out[out.length - 1]!.ratingAverage);
  });

  /**
   * "Never invents vendors, prices, hours or availability."
   *
   * The rule is about claims, not about digits: "under $50" restates the guest's own budget and is
   * fine, while "$89 per person" or "departs at 10:00" would be a fact about a listing that Irie is
   * not entitled to state. So a money figure is allowed only when it is the intent's own declared
   * ceiling, and clock times and vendor names are never allowed at all. An earlier version of this
   * test banned every dollar sign and failed on the legitimate case.
   */
  it('states no vendor, clock time, or price it is not entitled to', () => {
    for (const intent of INTENTS) {
      expect(intent.reply, `${intent.label} names a time`).not.toMatch(/\b\d{1,2}:\d{2}\b/);

      const money = intent.reply.match(/\$(\d+)/g) ?? [];
      for (const found of money) {
        const stated = Number(found.slice(1)) * 100;
        expect(stated, `${intent.label} quotes a price it did not declare`).toBe(
          intent.maxPriceMinor,
        );
      }

      // Tips are general advice; they may never carry a figure at all.
      expect(intent.tip ?? '', `${intent.label} tip quotes a number`).not.toMatch(/\$\d|\d{1,2}:\d{2}/);
    }
  });

  it('reply text is static — no catalogue value is ever interpolated into it', () => {
    for (const intent of INTENTS) {
      const answers = applyIntent(intent, catalogue);
      for (const listing of answers) {
        expect(intent.reply, intent.label).not.toContain(listing.title);
      }
    }
  });
});
