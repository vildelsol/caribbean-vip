/**
 * Which outside tools have a registered erasure port, and which are still owed one.
 *
 * `docs/privacy/processor-record.md` lists every processor. Each row must appear here, either as
 * a built port id or as `pending` with the reason. `processorCoverage.test.ts` fails when a row is
 * missing, when an entry names no row, or when a pending entry already has a port. Shrink `PENDING`
 * as adapters land; never grow it silently.
 */

/** Port ids with a built adapter. Stripe: `@cvip/payments` stripeErasurePort (customer profiles only; payments kept for the legal period). */
export const BUILT_PORT_IDS: readonly string[] = ['stripe'];

/** Record-row name (first table column, as written) mapped to why it has no port yet. */
export const PENDING: Readonly<Record<string, string>> = {
  Supabase: 'erase_my_data() erases the tables; Auth user removal is switched off pending counsel; no port wrapper yet',
  Vercel: 'request logs only; no per-person delete API wired',
  'Email sender for sign-in codes': 'provider not chosen',
};
