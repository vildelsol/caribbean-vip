/**
 * Stripe behind the processor port (see `@cvip/types` processorPorts).
 *
 * Pure: the Stripe calls sit behind `StripeCustomerClient`, which an Edge Function binds to the
 * real SDK. Tests use a fake.
 *
 * What erasure can and cannot do here:
 * - Deletes Stripe Customer objects found by the guest's email. Stripe then stops holding that
 *   profile for us.
 * - Does not touch payments, charges or payment intents. Stripe and our `payments` table keep
 *   those for the 7-year legal-duty window (GDPR Art 17(3)(b)); the receipt says so.
 * - Finds customers by email only. A booking made with a different email than the guest's sign-in
 *   email is not found; the receipt says the match was by email.
 */

import type { ErasureReceipt, PortResult, ProcessorPort, SubjectRef } from '@cvip/types';

export interface StripeCustomerClient {
  /** Ids of Stripe customers whose email equals `email` (case-insensitive). Throws on API failure. */
  findCustomerIdsByEmail(email: string): Promise<string[]>;
  /** Deletes one customer. Must treat "already deleted" as success. Throws on any other failure. */
  deleteCustomer(customerId: string): Promise<void>;
  /** The data Stripe holds on these customers, for export. Never card numbers. */
  describeCustomers(customerIds: string[]): Promise<unknown>;
}

export function makeStripeErasurePort(client: StripeCustomerClient): ProcessorPort {
  const customersOf = async (subject: SubjectRef): Promise<string[] | null> => {
    const email = subject.email?.trim();
    if (!email) return null;
    return client.findCustomerIdsByEmail(email);
  };

  return {
    id: 'stripe',
    displayName: 'Stripe',
    kind: 'payments',
    categories: ['email', 'Stripe customer ids', 'payment ids', 'booking amounts'],
    region: 'Stripe-managed',

    async export(subject): Promise<PortResult<unknown>> {
      const ids = await customersOf(subject);
      if (ids === null || ids.length === 0) return { status: 'not_held' };
      return { status: 'done', value: await client.describeCustomers(ids) };
    },

    async erase(subject): Promise<PortResult<ErasureReceipt>> {
      const ids = await customersOf(subject);
      if (ids === null || ids.length === 0) return { status: 'not_held' };
      // Delete every customer even if one fails, so a single bad id cannot leave the rest behind.
      const settled = await Promise.allSettled(ids.map((id) => client.deleteCustomer(id)));
      if (settled.some((s) => s.status === 'rejected')) {
        return { status: 'incomplete', reason: 'failed', retry: true };
      }
      return {
        status: 'done',
        value: {
          summary: `Deleted ${ids.length} Stripe customer profile${ids.length === 1 ? '' : 's'} matched by email. Payment records stay with Stripe for the legal retention period.`,
        },
      };
    },
  };
}
