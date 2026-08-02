/**
 * @cvip/payments — booking and payment orchestration.
 *
 * Pure functions over injected dependencies (AD-02). No Deno, no network, no Supabase import, so
 * the code that takes money is testable in milliseconds. The Edge Functions in supabase/functions
 * are thin adapters over this.
 */

export * from './ports';
export * from './checkout';
export * from './webhook';
