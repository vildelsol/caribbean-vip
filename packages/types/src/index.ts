/**
 * @cvip/types — shared domain vocabulary and pure domain logic.
 *
 * This package performs no I/O. Everything here is testable in milliseconds without a database,
 * a network or a running app, which is why the money-critical rules live here.
 */

export * from './money.ts';
export * from './pricing.ts';
export * from './voucher.ts';
export * from './states.ts';
export * from './domain.ts';
export * from './geo.ts';
export * from './search.ts';
export * from './providers.ts';
export * from './env.ts';
