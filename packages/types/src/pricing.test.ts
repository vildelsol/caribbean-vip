import { describe, expect, it } from 'vitest';
import { calculateBookingTotal, type PriceInput } from './pricing';

const config = { taxRate: 0.15, serviceFeeRate: 0.05, commissionRate: 0.12 };

function input(over: Partial<PriceInput> = {}): PriceInput {
  return {
    currency: 'USD',
    lines: [
      {
        optionId: 'opt-adult',
        label: 'Adult',
        unitAmountMinor: 8900,
        quantity: 2,
        occupiesCapacity: true,
      },
    ],
    discounts: [],
    config,
    capacityRemaining: 10,
    ...over,
  };
}

function unwrap(r: ReturnType<typeof calculateBookingTotal>) {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.breakdown;
}

describe('calculateBookingTotal', () => {
  it('itemizes subtotal, tax, service fee and total separately (PRD §10)', () => {
    const b = unwrap(calculateBookingTotal(input()));
    expect(b.subtotal.amountMinor).toBe(17800);
    expect(b.tax.amountMinor).toBe(2670); // 15% of 17800
    expect(b.serviceFee.amountMinor).toBe(890); // 5% of 17800
    expect(b.total.amountMinor).toBe(21360);
  });

  it('counts seats from capacity-occupying lines only, not add-ons', () => {
    const b = unwrap(
      calculateBookingTotal(
        input({
          lines: [
            { optionId: 'a', label: 'Adult', unitAmountMinor: 5000, quantity: 2, occupiesCapacity: true },
            { optionId: 'c', label: 'Child', unitAmountMinor: 2500, quantity: 1, occupiesCapacity: true },
            { optionId: 'x', label: 'Photo package', unitAmountMinor: 1500, quantity: 4, occupiesCapacity: false },
          ],
        }),
      ),
    );
    expect(b.seats).toBe(3);
    expect(b.subtotal.amountMinor).toBe(5000 * 2 + 2500 + 1500 * 4);
  });

  it('applies tax AFTER the discount, not before', () => {
    const b = unwrap(
      calculateBookingTotal(
        input({
          discounts: [{ kind: 'percentage', promotionId: 'p1', label: '10% off', rate: 0.1 }],
        }),
      ),
    );
    expect(b.discountTotal.amountMinor).toBe(1780);
    expect(b.taxableBase.amountMinor).toBe(16020);
    expect(b.tax.amountMinor).toBe(2403); // 15% of 16020, not of 17800
  });

  it('never lets discounts push the total below zero', () => {
    const b = unwrap(
      calculateBookingTotal(
        input({
          discounts: [
            { kind: 'fixed', promotionId: 'p1', label: 'Huge', amountMinor: 999_999 },
            { kind: 'fixed', promotionId: 'p2', label: 'Also huge', amountMinor: 999_999 },
          ],
        }),
      ),
    );
    expect(b.discountTotal.amountMinor).toBe(17800);
    expect(b.total.amountMinor).toBe(0);
  });

  it('itemizes an in-kind offer at zero value (the rum punch case)', () => {
    const b = unwrap(
      calculateBookingTotal(
        input({
          discounts: [
            { kind: 'inKind', promotionId: 'rum-punch', label: 'Free rum punch included' },
          ],
        }),
      ),
    );
    expect(b.discountsApplied).toHaveLength(1);
    expect(b.discountTotal.amountMinor).toBe(0);
    expect(b.total.amountMinor).toBe(21360); // unchanged — fulfilled at redemption
  });

  it('reports commission and vendor net without adding commission to the guest total', () => {
    const b = unwrap(calculateBookingTotal(input()));
    expect(b.commission.amountMinor).toBe(2136); // 12% of 17800
    expect(b.vendorNet.amountMinor).toBe(17800 - 2136);
    expect(b.total.amountMinor).toBe(21360); // guest total untouched by commission
  });

  it('rejects a party larger than remaining capacity (V-03 at quote time)', () => {
    const r = calculateBookingTotal(input({ capacityRemaining: 1 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('EXCEEDS_CAPACITY');
  });

  it('rejects an add-on-only booking', () => {
    const r = calculateBookingTotal(
      input({
        lines: [
          { optionId: 'x', label: 'Photos', unitAmountMinor: 1500, quantity: 1, occupiesCapacity: false },
        ],
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('NO_SEATS_SELECTED');
  });

  it('is deterministic — same input, same total (T-04)', () => {
    const a = unwrap(calculateBookingTotal(input()));
    const b = unwrap(calculateBookingTotal(input()));
    expect(a.total).toEqual(b.total);
  });

  it('produces integer minor units at every rounding boundary', () => {
    for (let unit = 1; unit <= 400; unit++) {
      const b = unwrap(
        calculateBookingTotal(
          input({
            lines: [
              { optionId: 'a', label: 'Adult', unitAmountMinor: unit, quantity: 3, occupiesCapacity: true },
            ],
            discounts: [{ kind: 'percentage', promotionId: 'p', label: '33%', rate: 1 / 3 }],
          }),
        ),
      );
      for (const v of [b.subtotal, b.discountTotal, b.tax, b.serviceFee, b.total, b.commission]) {
        expect(Number.isInteger(v.amountMinor)).toBe(true);
      }
      expect(b.total.amountMinor).toBeGreaterThanOrEqual(0);
    }
  });
});
