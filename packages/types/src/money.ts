/**
 * Money primitives.
 *
 * AD-05: all amounts are integer minor units (cents) paired with an explicit ISO-4217 code.
 * No floating point ever touches a monetary value — that is the single largest source of
 * rounding defects in booking systems, and PRD §10 requires itemized, deterministic totals.
 */

import { z } from 'zod';

/** ISO-4217 codes the platform can quote in. Settlement currency is USD at MVP (OD-09). */
export const CURRENCIES = ['USD', 'JMD', 'KYD', 'BBD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const currencySchema = z.enum(CURRENCIES);

/** Amount in minor units. Negative values are legal (discounts) but never for a total. */
export const minorAmountSchema = z.number().int().finite();

export interface Money {
  readonly amountMinor: number;
  readonly currency: Currency;
}

export const moneySchema = z.object({
  amountMinor: minorAmountSchema,
  currency: currencySchema,
});

export function money(amountMinor: number, currency: Currency): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new TypeError(`Money must be integer minor units, received ${amountMinor}`);
  }
  return { amountMinor, currency };
}

export class CurrencyMismatchError extends Error {
  constructor(a: Currency, b: Currency) {
    super(`Cannot combine ${a} with ${b}`);
    this.name = 'CurrencyMismatchError';
  }
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function multiplyMoney(a: Money, quantity: number): Money {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new RangeError(`Quantity must be a non-negative integer, received ${quantity}`);
  }
  return money(a.amountMinor * quantity, a.currency);
}

/**
 * Apply a rate (e.g. 0.125 tax) to an amount.
 *
 * Rounds half-up on the absolute value so a discount of -0.5 rounds to -1 rather than 0 —
 * i.e. rounding always favours the customer by a cent at most, and is symmetric, so a
 * discount followed by its inverse returns the original amount.
 */
export function applyRate(a: Money, rate: number): Money {
  if (!Number.isFinite(rate)) throw new RangeError(`Rate must be finite, received ${rate}`);
  const raw = a.amountMinor * rate;
  const rounded = Math.sign(raw) * Math.round(Math.abs(raw));
  return money(rounded === 0 ? 0 : rounded, a.currency);
}

/** Display only. Never use the formatted string for arithmetic or transport. */
export function formatMoney(a: Money, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: a.currency,
  }).format(a.amountMinor / 100);
}
