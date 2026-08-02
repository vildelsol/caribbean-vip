/**
 * @cvip/demo — in-memory backend for demonstrations and credential-free development.
 *
 * Runs the real domain logic (pricing, voucher signing, state machines) against in-memory storage,
 * so the whole user flow works with no Supabase, no Stripe and no keys.
 *
 * Not a substitute for the real backend: it proves the flows, not the integration.
 */
export * from './dataset';
export * from './store';
export * from './credits';
