/**
 * Stripe SDK bound to `StripeCustomerClient` (the erasure port's narrow view of Stripe).
 * Customers only: payments and charges are never touched here.
 */

import Stripe from 'npm:stripe@^17';
import type { StripeCustomerClient } from '@cvip/payments';

export function makeStripeCustomerClient(secretKey: string): StripeCustomerClient {
  const stripe = new Stripe(secretKey, { apiVersion: '2025-06-30.basil' });

  return {
    async findCustomerIdsByEmail(email) {
      // Stripe matches email exactly and is case-sensitive, so ask for both spellings.
      const spellings = [...new Set([email, email.toLowerCase()])];
      const ids = new Set<string>();
      for (const e of spellings) {
        const found = await stripe.customers.list({ email: e, limit: 100 }).autoPagingToArray({ limit: 1000 });
        for (const c of found) ids.add(c.id);
      }
      return [...ids];
    },

    async deleteCustomer(customerId) {
      try {
        await stripe.customers.del(customerId);
      } catch (e) {
        // Already gone counts as done, so a retry after a partial run succeeds.
        if ((e as { code?: string }).code === 'resource_missing') return;
        throw e;
      }
    },

    async describeCustomers(customerIds) {
      const out: unknown[] = [];
      for (const id of customerIds) {
        const c = await stripe.customers.retrieve(id);
        if (c.deleted) continue;
        out.push({ id: c.id, email: c.email, name: c.name, phone: c.phone, created: c.created });
      }
      return out;
    },
  };
}
