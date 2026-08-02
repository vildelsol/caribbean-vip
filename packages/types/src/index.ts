/**
 * @cvip/types — shared domain vocabulary and pure domain logic.
 *
 * This package performs no I/O. Everything here is testable in milliseconds without a database,
 * a network or a running app, which is why the money-critical rules live here.
 */

export * from './money';
export * from './pricing';
export * from './voucher';
export * from './states';
export * from './domain';
export * from './env';
