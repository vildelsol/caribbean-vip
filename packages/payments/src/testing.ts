/**
 * In-memory fakes for the payment core.
 *
 * Deliberately faithful about the two behaviours the real implementations guarantee, because a
 * fake that is laxer than production turns these tests into decoration:
 *
 *   - `reserveCapacity` refuses to oversell, mirroring `reserve_availability()`'s row lock.
 *   - `recordPaymentEvent` reports `alreadyProcessed` on a repeated event id, mirroring the
 *     unique index on `payments.stripe_event_id`.
 *
 * Exported from the package so the Edge Function adapters can reuse them in their own smoke tests.
 */

import type { BookingStatus, Currency } from '@cvip/types';
import type {
  BookingRecord,
  BookingStore,
  CheckoutSession,
  CheckoutSessionRequest,
  Clock,
  IdGenerator,
  OptionSnapshot,
  PaymentProvider,
  PaymentRecord,
  PromotionSnapshot,
  SlotSnapshot,
  StripeLikeEvent,
} from './ports.ts';

export class FakeClock implements Clock {
  constructor(private current: Date = new Date('2026-08-02T12:00:00Z')) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
  set(d: Date): void {
    this.current = new Date(d);
  }
}

export class SequentialIds implements IdGenerator {
  private n = 0;
  voucherId(): string {
    this.n += 1;
    return `voucher${String(this.n).padStart(16, '0')}aa`.slice(0, 22);
  }
  referenceSeed(): string {
    this.n += 1;
    return `seed${this.n}abcdefgh`;
  }
}

export interface FakeStoreSeed {
  slots?: SlotSnapshot[];
  options?: OptionSnapshot[];
  promotions?: PromotionSnapshot[];
  settlementCurrency?: Currency;
  pricingConfig?: { taxRate: number; serviceFeeRate: number; commissionRate: number };
}

export class FakeBookingStore implements BookingStore {
  slots = new Map<string, SlotSnapshot>();
  options: OptionSnapshot[] = [];
  promotions = new Map<string, PromotionSnapshot>();
  bookings = new Map<string, BookingRecord>();
  payments = new Map<string, PaymentRecord>();
  seenEventIds = new Set<string>();
  vouchers: { tokenHash: string; bookingId: string | null; state: string }[] = [];
  tripItems: { bookingId: string }[] = [];
  releases: { slotId: string; seats: number }[] = [];

  settlementCurrency: Currency;
  pricingConfig: { taxRate: number; serviceFeeRate: number; commissionRate: number };

  /** Set to make the next createCheckoutSession-adjacent write blow up, for rollback tests. */
  failNextGuestLines = false;

  private seq = 0;

  constructor(seed: FakeStoreSeed = {}) {
    for (const s of seed.slots ?? []) this.slots.set(s.id, { ...s });
    this.options = (seed.options ?? []).map((o) => ({ ...o }));
    for (const p of seed.promotions ?? []) this.promotions.set(p.id, { ...p });
    this.settlementCurrency = seed.settlementCurrency ?? 'USD';
    this.pricingConfig = seed.pricingConfig ?? {
      taxRate: 0.15,
      serviceFeeRate: 0.05,
      commissionRate: 0.12,
    };
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${String(this.seq).padStart(8, '0')}`;
  }

  async getSlot(slotId: string): Promise<SlotSnapshot | null> {
    return this.slots.get(slotId) ?? null;
  }

  async getOptions(experienceId: string): Promise<OptionSnapshot[]> {
    return this.options.filter((o) => o.experienceId === experienceId);
  }

  async getPromotion(promotionId: string): Promise<PromotionSnapshot | null> {
    return this.promotions.get(promotionId) ?? null;
  }

  async getPricingConfig() {
    return this.pricingConfig;
  }

  async getSettlementCurrency(): Promise<Currency> {
    return this.settlementCurrency;
  }

  /** Mirrors `reserve_availability()`: refuses rather than oversells. */
  async reserveCapacity(slotId: string, seats: number): Promise<boolean> {
    const slot = this.slots.get(slotId);
    if (!slot || slot.status !== 'open') return false;
    if (slot.bookedCount + seats > slot.capacity) return false;
    slot.bookedCount += seats;
    return true;
  }

  async releaseCapacity(slotId: string, seats: number): Promise<void> {
    this.releases.push({ slotId, seats });
    const slot = this.slots.get(slotId);
    if (slot) slot.bookedCount = Math.max(slot.bookedCount - seats, 0);
  }

  async findBookingByIdempotencyKey(key: string): Promise<BookingRecord | null> {
    for (const b of this.bookings.values()) if (b.idempotencyKey === key) return b;
    return null;
  }

  async createBooking(input: Omit<BookingRecord, 'id'>): Promise<BookingRecord> {
    const record: BookingRecord = { ...input, id: this.nextId('booking') };
    this.bookings.set(record.id, record);
    return record;
  }

  async updateBookingStatus(bookingId: string, status: BookingStatus): Promise<void> {
    const b = this.bookings.get(bookingId);
    if (b) b.status = status;
  }

  async getBooking(bookingId: string): Promise<BookingRecord | null> {
    return this.bookings.get(bookingId) ?? null;
  }

  async createGuestLines(): Promise<void> {
    if (this.failNextGuestLines) {
      this.failNextGuestLines = false;
      throw new Error('simulated write failure');
    }
  }

  async upsertPaymentForCheckout(input: {
    bookingId: string;
    amountMinor: number;
    currency: Currency;
    stripeCheckoutSessionId: string;
  }): Promise<PaymentRecord> {
    const record: PaymentRecord = {
      id: this.nextId('payment'),
      bookingId: input.bookingId,
      status: 'pending',
      amountMinor: input.amountMinor,
      currency: input.currency,
      stripeCheckoutSessionId: input.stripeCheckoutSessionId,
      stripePaymentIntentId: null,
      stripeEventId: null,
    };
    this.payments.set(record.id, record);
    return record;
  }

  /** Mirrors the unique index on `payments.stripe_event_id`. */
  async recordPaymentEvent(input: {
    stripeEventId: string;
    stripePaymentIntentId: string | null;
    stripeCheckoutSessionId: string | null;
    status: PaymentRecord['status'];
    paidAt: Date | null;
  }): Promise<{ alreadyProcessed: boolean; payment: PaymentRecord | null }> {
    if (this.seenEventIds.has(input.stripeEventId)) {
      return { alreadyProcessed: true, payment: null };
    }
    this.seenEventIds.add(input.stripeEventId);

    let payment: PaymentRecord | null = null;
    for (const p of this.payments.values()) {
      if (
        (input.stripeCheckoutSessionId && p.stripeCheckoutSessionId === input.stripeCheckoutSessionId) ||
        (input.stripePaymentIntentId && p.stripePaymentIntentId === input.stripePaymentIntentId)
      ) {
        payment = p;
        break;
      }
    }
    if (payment) {
      payment.status = input.status;
      payment.stripeEventId = input.stripeEventId;
      if (input.stripePaymentIntentId) payment.stripePaymentIntentId = input.stripePaymentIntentId;
    }
    return { alreadyProcessed: false, payment };
  }

  async findBookingByCheckoutSession(sessionId: string): Promise<BookingRecord | null> {
    for (const p of this.payments.values()) {
      if (p.stripeCheckoutSessionId === sessionId) {
        return this.bookings.get(p.bookingId) ?? null;
      }
    }
    return null;
  }

  async issueVoucher(input: {
    tokenHash: string;
    bookingId: string | null;
    state: string;
  }): Promise<{ id: string }> {
    this.vouchers.push({
      tokenHash: input.tokenHash,
      bookingId: input.bookingId,
      state: input.state,
    });
    return { id: this.nextId('voucher') };
  }

  async addBookingToTrip(input: { bookingId: string }): Promise<void> {
    this.tripItems.push({ bookingId: input.bookingId });
  }
}

export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';
  sessions: CheckoutSessionRequest[] = [];
  /** Set to make session creation throw, for the capacity-rollback test. */
  failNextSession = false;
  /** Signatures not in this set are rejected. */
  validSignature = 'valid-signature';

  private seq = 0;

  async createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSession> {
    if (this.failNextSession) {
      this.failNextSession = false;
      throw new Error('stripe unavailable');
    }
    // Stripe returns the SAME session for a repeated idempotency key.
    const existing = this.sessions.find((s) => s.idempotencyKey === req.idempotencyKey);
    this.sessions.push(req);
    if (existing) {
      const idx = this.sessions.indexOf(existing);
      return { id: `cs_test_${idx}`, url: `https://checkout.test/cs_test_${idx}` };
    }
    this.seq += 1;
    return { id: `cs_test_${this.seq}`, url: `https://checkout.test/cs_test_${this.seq}` };
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<StripeLikeEvent> {
    if (signature !== this.validSignature) throw new Error('invalid signature');
    return JSON.parse(rawBody) as StripeLikeEvent;
  }

  async refund(): Promise<void> {
    // no-op
  }
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

export function slotFixture(over: Partial<SlotSnapshot> = {}): SlotSnapshot {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    experienceId: '22222222-2222-4222-8222-222222222222',
    vendorOrgId: '33333333-3333-4333-8333-333333333333',
    startsAt: '2026-08-10T14:00:00Z',
    endsAt: '2026-08-10T17:00:00Z',
    capacity: 10,
    bookedCount: 0,
    status: 'open',
    ...over,
  };
}

export function optionFixture(over: Partial<OptionSnapshot> = {}): OptionSnapshot {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    experienceId: '22222222-2222-4222-8222-222222222222',
    label: 'Adult',
    unitAmountMinor: 8900,
    currency: 'USD',
    occupiesCapacity: true,
    isActive: true,
    ...over,
  };
}

/** A Stripe-shaped event. Only the fields the core reads are populated. */
export function stripeEvent(over: {
  id?: string;
  type?: string;
  objectType?: string;
  objectId?: string;
  paymentStatus?: string | null;
  paymentIntent?: string | null;
  bookingId?: string | null;
}): string {
  const event: StripeLikeEvent = {
    id: over.id ?? 'evt_test_1',
    type: over.type ?? 'checkout.session.completed',
    data: {
      object: {
        id: over.objectId ?? 'cs_test_1',
        object: over.objectType ?? 'checkout.session',
        payment_status: over.paymentStatus === undefined ? 'paid' : over.paymentStatus,
        payment_intent: over.paymentIntent ?? 'pi_test_1',
        metadata: over.bookingId ? { booking_id: over.bookingId } : {},
      },
    },
  };
  return JSON.stringify(event);
}
