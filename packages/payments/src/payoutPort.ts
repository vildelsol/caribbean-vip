/**
 * The vendor's payout account at the payment partner: the second seam, beside `PaymentProvider`.
 *
 * With the vendor as merchant of record (OD-01, docs/open-decisions.md) a vendor must hold an
 * account with the partner before a guest can pay them. Onboarding, identity checks and the
 * partner's own terms happen on the partner's pages; this port only asks for the link and reads
 * back the status. A different partner implements this file's interface and nothing else changes
 * (docs/payment-partners.md).
 *
 * Privacy: the platform never sees or stores the vendor's bank or identity details. It holds an
 * opaque account reference and a status the partner reported, and nothing else.
 */

import type { PayeeAccount, VendorPayout } from './ports.ts';

export interface OnboardingLink {
  /** Where to send the vendor. Short-lived and single use at most providers. */
  url: string;
  /** When the link stops working, if the partner says. */
  expiresAt: Date | null;
}

export interface PayoutAccountPort {
  readonly provider: string;
  /**
   * Opens an account at the partner for this vendor, or returns the one they already have. Must be
   * safe to repeat: pressing "set up payouts" twice cannot create two accounts.
   */
  ensureAccount(input: { vendorOrgId: string; email: string | null }): Promise<PayeeAccount>;
  /** A fresh link into the partner's onboarding for this account. */
  onboardingLink(input: { account: PayeeAccount; returnUrl: string; refreshUrl: string }): Promise<OnboardingLink>;
  /** What the partner says now. The only thing allowed to make a vendor `ready`. */
  status(account: PayeeAccount): Promise<VendorPayout['status']>;
}

/**
 * The adapter used until a partner is chosen. It reports every account as not ready, so no vendor
 * can be booked by accident under `vendor_is_merchant`, and it never invents an account.
 */
export function createNullPayoutPort(): PayoutAccountPort {
  return {
    provider: 'none',
    async ensureAccount() {
      throw new Error('No payout partner is configured.');
    },
    async onboardingLink() {
      throw new Error('No payout partner is configured.');
    },
    async status() {
      return 'restricted';
    },
  };
}

/** Whether a stored payout account can take a booking, given the provider that will charge it. */
export function canTakeBookings(payout: VendorPayout | null, providerName: string): boolean {
  return payout !== null && payout.provider === providerName && payout.status === 'ready';
}
