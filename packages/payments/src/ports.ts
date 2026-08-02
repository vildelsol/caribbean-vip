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

  /** Returns false when the slot is full, closed or missing. Wraps `reserve_availability()`. */
  reserveCapacity(slotId: string, seats: number): Promise<boolean>;
  releaseCapacity(slotId: string, seats: number): Promise<void>;

  findBookingByIdempotencyKey(key: string): Promise<BookingRecord | null>;
  createBooking(input: Omit<BookingRecord, 'id'>): Promise<BookingRecord>;
  updateBookingStatus(bookingId: string, status: BookingStatus): Promise<void>;
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
   * MUST be backed by the unique index on `payments.stripe_event_id` and MUST return
   * `alreadyProcessed: true` rather than throwing when the event has been seen before. That
   * constraint — not handler care — is what makes T-05's "exactly once" true.
   */
  recordPaymentEvent(input: {
    stripeEventId: string;
    stripePaymentIntentId: string | null;
    stripeCheckoutSessionId: string | null;
    status: PaymentRecord['status'];
    paidAt: Date | null;
  }): Promise<{ alreadyProcessed: boolean; payment: PaymentRecord | null }>;

  findBookingByCheckoutSession(sessionId: string): Promise<BookingRecord | null>;

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
  /** Stripe idempotency key — a retried create must not open a second session. */
  idempotencyKey: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

/**
 * AD-09: nothing here mentions a destination account, so adding Stripe Connect later means
 * changing the adapter, not the booking logic.
 */
export interface PaymentProvider {
  readonly name: string;
  createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSession>;
  /**
   * Verifies the signature and parses the payload. Must throw on an invalid signature — the core
   * treats a throw as "reject without touching the database".
   */
  verifyWebhook(rawBody: string, signature: string): Promise<StripeLikeEvent>;
  refund(paymentIntentId: string, amountMinor: number, idempotencyKey: string): Promise<void>;
}

/** The subset of a Stripe event the core reads. Deliberately not Stripe's own type. */
export interface StripeLikeEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      object: string;
      amount_total?: number | null;
      currency?: string | null;
      payment_intent?: string | null;
      payment_status?: string | null;
      status?: string | null;
      metadata?: Record<string, string> | null;
      last_payment_error?: { code?: string | null; message?: string | null } | null;
    };
  };
}

export interface PaymentCoreDeps {
  store: BookingStore;
  payments: PaymentProvider;
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
