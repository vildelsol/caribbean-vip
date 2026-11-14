/**
 * Dependency ports for the payment core — AD-02.
 *
 * Every interface here is something the core needs but must not know how to do: reach a database,
 * call Stripe, read the clock, generate randomness. The Edge Function supplies real
 * implementations; the tests supply fakes. Nothing in this package imports Supabase, Stripe or
 * Deno, which is what makes the money-critical logic testable in milliseconds.
 *
 * The clock and id generator are ports for the same reason as the rest: a test that cannot control
 * time or ids cannot assert on idempotency, expiry or "exactly once".
 */

import type { BookingStatus, Currency, PriceBreakdown, VoucherState } from '@cvip/types';

// ---------------------------------------------------------------------------
// Time and identity
// ---------------------------------------------------------------------------

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  /** Random voucher id — see AD-04. */
  voucherId(): string;
  /** Human-readable booking reference seed. */
  referenceSeed(): string;
}

// ---------------------------------------------------------------------------
// Booking store
// ---------------------------------------------------------------------------

export interface SlotSnapshot {
  id: string;
  experienceId: string;
  vendorOrgId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  status: 'open' | 'closed' | 'cancelled';
  /**
   * Whether the listing is publicly visible: approved, from an approved vendor. The store computes
   * it; checkout treats a slot where it is false exactly like a missing one.
   */
  listingBookable: boolean;
}

export interface OptionSnapshot {
  id: string;
  experienceId: string;
  label: string;
  unitAmountMinor: number;
  currency: Currency;
  occupiesCapacity: boolean;
  isActive: boolean;
}

export interface PromotionSnapshot {
  id: string;
  vendorOrgId: string;
  title: string;
  valueKind: 'percentage' | 'fixed' | 'in_kind';
  valueAmountMinor: number | null;
  valueRate: number | null;
  startsAt: string;
  endsAt: string;
  inventoryLimit: number | null;
  issuedCount: number;
  requiresBooking: boolean;
  approvalState: 'pending' | 'approved' | 'rejected' | 'disabled';
  appliesToExperienceIds: string[];
}

export interface BookingRecord {
  id: string;
  userId: string;
  vendorOrgId: string;
  experienceId: string;
  availabilitySlotId: string;
  promotionId: string | null;
  reference: string;
  status: BookingStatus;
  currency: Currency;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  serviceFeeMinor: number;
  totalMinor: number;
  commissionMinor: number;
  seats: number;
  idempotencyKey: string | null;
}

export interface PaymentRecord {
  id: string;
  bookingId: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
  amountMinor: number;
  currency: Currency;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeEventId: string | null;
}

/**
 * Everything the core needs from the database.
 *
 * `reserveCapacity` and `releaseCapacity` map onto the Postgres functions from M1 — the core never
 * increments a counter itself, because doing so outside the row lock would reintroduce the race
 * those functions exist to prevent.
 */
export interface BookingStore {
  getSlot(slotId: string): Promise<SlotSnapshot | null>;
  getOptions(experienceId: string): Promise<OptionSnapshot[]>;
  getPromotion(promotionId: string): Promise<PromotionSnapshot | null>;
  getPricingConfig(): Promise<{ taxRate: number; serviceFeeRate: number; commissionRate: number }>;
  /** Settlement currency from `platform_settings` — USD at MVP (OD-09). */
  getSettlementCurrency(): Promise<Currency>;

  /** The vendor's payout account, or null if it has none. Read server-side only. */
  getVendorPayout(vendorOrgId: string): Promise<VendorPayout | null>;

  /** Returns false when the slot is full, closed or missing. Wraps `reserve_availability()`. */
  reserveCapacity(slotId: string, seats: number): Promise<boolean>;
  releaseCapacity(slotId: string, seats: number): Promise<void>;

  /**
   * Bookings this guest has started but not paid for, created at or after `since`. The cap on these
   * is what stops one guest holding a departure's seats; `since` keeps a booking whose expiry event
   * never arrived from counting against them forever.
   */
  countOpenPendingBookings(userId: string, since: Date): Promise<number>;

  findBookingByIdempotencyKey(key: string): Promise<BookingRecord | null>;
  createBooking(input: Omit<BookingRecord, 'id'>): Promise<BookingRecord>;
  updateBookingStatus(bookingId: string, status: BookingStatus): Promise<void>;
  /**
   * Moves a booking `from` -> `to` only if it is still in `from`, and says whether THIS call did it.
   * This is what makes a webhook exactly-once: of any number of concurrent deliveries, one gets
   * `true` and runs the side effects (voucher, seat release); the rest get `false` and stop. A
   * read-then-write cannot do this, because both deliveries read the old status.
   */
  transitionBookingStatus(bookingId: string, from: BookingStatus, to: BookingStatus): Promise<boolean>;
  getBooking(bookingId: string): Promise<BookingRecord | null>;

  createGuestLines(
    bookingId: string,
    lines: { optionId: string; quantity: number; unitAmountMinor: number }[],
  ): Promise<void>;

  upsertPaymentForCheckout(input: {
    bookingId: string;
    amountMinor: number;
    currency: Currency;
    stripeCheckoutSessionId: string;
  }): Promise<PaymentRecord>;

  /**
   * Records a webhook event against a payment.
   *
   * A record, not a gate. A replay writes the same event id onto the same row, which violates no
   * unique index, so the store cannot reliably say "seen before" and the handler does not rely on
   * it. Exactly-once comes from `transitionBookingStatus`.
   */
  recordPaymentEvent(input: {
    stripeEventId: string;
    stripePaymentIntentId: string | null;
    stripeCheckoutSessionId: string | null;
    status: PaymentRecord['status'];
    paidAt: Date | null;
  }): Promise<{ alreadyProcessed: boolean; payment: PaymentRecord | null }>;

  findBookingByCheckoutSession(sessionId: string): Promise<BookingRecord | null>;
  /**
   * The booking whose payment row carries this payment intent. A refund arrives as a charge, which
   * has no session id, so this is the only way to find the booking when no metadata was copied.
   */
  findBookingByPaymentIntent(paymentIntentId: string): Promise<BookingRecord | null>;
  /**
   * Cancels every voucher of the booking that is not already terminal. Idempotent. A redeemed
   * voucher stays redeemed: the guest already took the tour.
   */
  voidBookingVouchers(bookingId: string): Promise<void>;

  issueVoucher(input: {
    tokenHash: string;
    userId: string;
    bookingId: string | null;
    promotionId: string | null;
    vendorOrgId: string;
    state: VoucherState;
    validFrom: Date;
    validUntil: Date;
  }): Promise<{ id: string }>;

  addBookingToTrip(input: {
    userId: string;
    bookingId: string;
    islandId: string;
    destinationId: string | null;
    scheduledAt: string;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Payment provider
// ---------------------------------------------------------------------------

export interface CheckoutSessionRequest {
  bookingReference: string;
  amountMinor: number;
  currency: Currency;
  description: string;
  customerEmail: string | null;
  /** Passed back on the webhook so the event can be matched to a booking. */
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  /** Provider idempotency key — a retried create must not open a second session. */
  idempotencyKey: string;
  /**
   * Who is paid, when the vendor is the merchant of record: the vendor's account at this provider.
   * `null` means the platform collects the money itself (`PayoutModel` `platform_collects`).
   */
  payee: PayeeAccount | null;
  /**
   * What the platform keeps out of the payment (commission plus service fee). Meaningful only with a
   * payee: the provider routes the rest of the payment to that account. Zero without one.
   */
  platformFeeMinor: number;
  /**
   * When the session stops accepting payment. Without it Stripe leaves a session open for 24 hours,
   * and the seats reserved for it stay taken that long. See `checkoutExpiry`.
   */
  expiresAt: Date;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

/** The vendor's account at the payment provider. `accountRef` is the provider's own opaque id. */
export interface PayeeAccount {
  provider: string;
  accountRef: string;
}

/**
 * Who is the merchant of record, and so where a guest's money goes.
 *
 * - `vendor_is_merchant`: the vendor sells and is paid directly by the provider, which keeps the
 *   platform's fee out of the payment. A vendor with no ready payout account cannot be booked.
 * - `platform_collects`: every payment lands in the platform's own account. Used for the demo and
 *   staging, where no vendor has a real payout account. Never the production position while OD-01
 *   leans to the marketplace model (docs/open-decisions.md).
 */
export type PayoutModel = 'vendor_is_merchant' | 'platform_collects';

export const PAYOUT_MODELS: readonly PayoutModel[] = ['vendor_is_merchant', 'platform_collects'];

/** A vendor's payout account as stored: what the provider told us, never what the vendor typed. */
export interface VendorPayout {
  provider: string;
  accountRef: string;
  /** `ready` only once the provider says the account can take payments and receive payouts. */
  status: 'ready' | 'onboarding' | 'restricted';
}

/**
 * A payment event, in the platform's own words. Each provider adapter translates its webhook into
 * this, so the core never sees a provider's event names.
 */
export interface PaymentEvent {
  /** Unique per delivered event at the provider; replays carry the same id. */
  id: string;
  kind: 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
  /** From the metadata we attached at checkout, when the provider echoes it. */
  bookingId: string | null;
  checkoutSessionId: string | null;
  /** The provider's id for the payment itself (a Stripe payment intent). */
  paymentRef: string | null;
}

/** Events the adapter does not act on are still acknowledged, with their type for the log. */
export type ParsedWebhook =
  | { handled: true; event: PaymentEvent }
  | { handled: false; id: string; type: string };

export interface RefundRequest {
  paymentRef: string;
  amountMinor: number;
  idempotencyKey: string;
  /** The account the original payment went to; a refund must come back out of the same one. */
  payee: PayeeAccount | null;
}

/**
 * The seam for a payment partner (docs/payment-partners.md). Nothing here is Stripe's: a different
 * partner implements these three methods and a `PayoutAccountPort`, and the booking logic is
 * untouched.
 */
export interface PaymentProvider {
  readonly name: string;
  createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSession>;
  /**
   * Verifies the signature and translates the payload. Must throw on an invalid signature: the core
   * treats a throw as "reject without touching the database".
   */
  parseWebhook(rawBody: string, signature: string): Promise<ParsedWebhook>;
  refund(req: RefundRequest): Promise<void>;
}

export interface PaymentCoreDeps {
  store: BookingStore;
  payments: PaymentProvider;
  /** Where the money goes. Required, never defaulted: a silent default would pick who sells. */
  payoutModel: PayoutModel;
  clock: Clock;
  ids: IdGenerator;
  /** HMAC secret for voucher tokens (AD-04). Never leaves the server. */
  voucherSecret: string;
  /** How long a pending booking may hold capacity before reconciliation releases it. */
  pendingPaymentTtlMinutes: number;
  successUrl: string;
  cancelUrl: string;
}

export type { PriceBreakdown };
