/**
 * Booking price calculation.
 *
 * AD-06: this is a pure function. It is the single definition of what a booking costs, used
 * both by the quote endpoint (display) and by the checkout endpoint (charge). PRD §10 requires
 * that totals are calculated server-side and that taxes, service fees and promotional discounts
 * are individually itemized before payment — hence a breakdown, not a scalar.
 *
 * Rates arrive from `platform_settings`, never from constants (PRD §10: configuration-driven).
 */

import { z } from 'zod';
import {
  addMoney,
  applyRate,
  money,
  multiplyMoney,
  type Currency,
  type Money,
  currencySchema,
} from './money.ts';

export const priceLineSchema = z.object({
  /** `experience_options.id` — the priced variant (adult, child, add-on, ticket type). */
  optionId: z.string().min(1),
  label: z.string().min(1),
  unitAmountMinor: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  /** Add-ons do not count toward the capacity/seat total; guest tickets do. */
  occupiesCapacity: z.boolean(),
});
export type PriceLine = z.infer<typeof priceLineSchema>;

export const discountSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('percentage'),
    promotionId: z.string().min(1),
    label: z.string().min(1),
    /** 0.15 = 15% off the subtotal. */
    rate: z.number().min(0).max(1),
  }),
  z.object({
    kind: z.literal('fixed'),
    promotionId: z.string().min(1),
    label: z.string().min(1),
    amountMinor: z.number().int().nonnegative(),
  }),
  z.object({
    /**
     * "Free rum punch with a qualifying booking" — the offer has no monetary effect on the
     * total; it is fulfilled at redemption. Itemized so the guest sees it before paying.
     */
    kind: z.literal('inKind'),
    promotionId: z.string().min(1),
    label: z.string().min(1),
  }),
]);
export type Discount = z.infer<typeof discountSchema>;

export const pricingConfigSchema = z.object({
  /** Government/tourism tax applied to the discounted subtotal. */
  taxRate: z.number().min(0).max(1),
  /** Platform service fee charged to the guest. */
  serviceFeeRate: z.number().min(0).max(1),
  /** Platform commission, taken out of the vendor's share — not added to the guest total. */
  commissionRate: z.number().min(0).max(1),
});
export type PricingConfig = z.infer<typeof pricingConfigSchema>;

export const priceInputSchema = z.object({
  currency: currencySchema,
  lines: z.array(priceLineSchema).min(1),
  discounts: z.array(discountSchema).default([]),
  config: pricingConfigSchema,
  /** Remaining seats on the slot. Guards T-04's total against an impossible party size. */
  capacityRemaining: z.number().int().nonnegative(),
});
export type PriceInput = z.infer<typeof priceInputSchema>;

export interface PriceBreakdown {
  readonly currency: Currency;
  readonly lines: ReadonlyArray<PriceLine & { readonly lineTotal: Money }>;
  readonly seats: number;
  readonly subtotal: Money;
  readonly discountTotal: Money;
  readonly discountsApplied: ReadonlyArray<{ promotionId: string; label: string; amount: Money }>;
  readonly taxableBase: Money;
  readonly tax: Money;
  readonly serviceFee: Money;
  /** What the guest pays. */
  readonly total: Money;
  /** Platform commission, informational — already inside `total`, not added to it. */
  readonly commission: Money;
  /** Vendor's estimated share. Drives the V-07 gross/fee/net dashboard. */
  readonly vendorNet: Money;
}

export type PricingError =
  | { code: 'EMPTY_BOOKING'; message: string }
  | { code: 'NO_SEATS_SELECTED'; message: string }
  | { code: 'EXCEEDS_CAPACITY'; message: string; seats: number; capacityRemaining: number }
  | { code: 'NEGATIVE_TOTAL'; message: string };

export type PricingResult =
  | { ok: true; breakdown: PriceBreakdown }
  | { ok: false; error: PricingError };

/**
 * Calculate the full itemized total for a booking.
 *
 * Order of operations matters and is fixed: subtotal → discounts → tax on the discounted base →
 * service fee on the discounted base → total. Taxing before discounting would overcharge; taxing
 * the service fee would be double-charging a platform fee.
 */
export function calculateBookingTotal(input: PriceInput): PricingResult {
  const { currency, lines, discounts, config, capacityRemaining } = input;

  if (lines.length === 0) {
    return { ok: false, error: { code: 'EMPTY_BOOKING', message: 'Booking has no line items.' } };
  }

  const seats = lines.reduce((n, l) => (l.occupiesCapacity ? n + l.quantity : n), 0);
  if (seats === 0) {
    return {
      ok: false,
      error: { code: 'NO_SEATS_SELECTED', message: 'At least one guest ticket is required.' },
    };
  }
  if (seats > capacityRemaining) {
    return {
      ok: false,
      error: {
        code: 'EXCEEDS_CAPACITY',
        message: `Requested ${seats} seats but only ${capacityRemaining} remain.`,
        seats,
        capacityRemaining,
      },
    };
  }

  const pricedLines = lines.map((l) => ({
    ...l,
    lineTotal: multiplyMoney(money(l.unitAmountMinor, currency), l.quantity),
  }));

  const subtotal = pricedLines.reduce(
    (acc, l) => addMoney(acc, l.lineTotal),
    money(0, currency),
  );

  const discountsApplied: Array<{ promotionId: string; label: string; amount: Money }> = [];
  let discountTotal = money(0, currency);

  for (const d of discounts) {
    let amount: Money;
    switch (d.kind) {
      case 'percentage':
        amount = applyRate(subtotal, d.rate);
        break;
      case 'fixed':
        amount = money(d.amountMinor, currency);
        break;
      case 'inKind':
        amount = money(0, currency);
        break;
    }
    // A discount can never exceed what is left of the subtotal.
    const remaining = subtotal.amountMinor - discountTotal.amountMinor;
    const capped = money(Math.min(amount.amountMinor, Math.max(remaining, 0)), currency);
    discountsApplied.push({ promotionId: d.promotionId, label: d.label, amount: capped });
    discountTotal = addMoney(discountTotal, capped);
  }

  const taxableBase = money(subtotal.amountMinor - discountTotal.amountMinor, currency);
  const tax = applyRate(taxableBase, config.taxRate);
  const serviceFee = applyRate(taxableBase, config.serviceFeeRate);
  const total = addMoney(addMoney(taxableBase, tax), serviceFee);

  if (total.amountMinor < 0) {
    return {
      ok: false,
      error: { code: 'NEGATIVE_TOTAL', message: 'Calculated total is negative.' },
    };
  }

  const commission = applyRate(taxableBase, config.commissionRate);
  const vendorNet = money(taxableBase.amountMinor - commission.amountMinor, currency);

  return {
    ok: true,
    breakdown: {
      currency,
      lines: pricedLines,
      seats,
      subtotal,
      discountTotal,
      discountsApplied,
      taxableBase,
      tax,
      serviceFee,
      total,
      commission,
      vendorNet,
    },
  };
}
