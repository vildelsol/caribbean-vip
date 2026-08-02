/**
 * Checkout orchestration — T-04, T-05, PRD §10.
 *
 * The two rules this file exists to enforce:
 *
 *   1. "Never trust totals submitted by the client." The request carries option ids and
 *      quantities; the price is recomputed here from database state and any client-supplied
 *      amount is ignored outright.
 *   2. Capacity is reserved BEFORE the Stripe session is created. Reserving afterwards would let
 *      two people pay for the same last seat, and refunding one of them is a worse outcome than
 *      refusing the second checkout.
 *
 * Nothing here talks to a database or to Stripe directly — see `ports.ts`.
 */

import { z } from 'zod';
import {
  calculateBookingTotal,
  formatBookingReference,
  hashVoucherToken,
  signVoucherToken,
  VOUCHER_TOKEN_VERSION,
  type Currency,
  type Discount,
  type PriceBreakdown,
  type PriceLine,
} from '@cvip/types';
import type { PaymentCoreDeps, PromotionSnapshot } from './ports';

export const checkoutRequestSchema = z.object({
  userId: z.string().uuid(),
  availabilitySlotId: z.string().uuid(),
  /** Option id → quantity. The ONLY pricing input the client controls. */
  lines: z
    .array(z.object({ optionId: z.string().uuid(), quantity: z.number().int().positive() }))
    .min(1),
  promotionId: z.string().uuid().nullable().default(null),
  customerEmail: z.string().email().nullable().default(null),
  /**
   * Client-supplied idempotency key. A double-tapped "Pay" must return the existing booking, not
   * create a second one.
   */
  idempotencyKey: z.string().min(8).max(200),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export type CheckoutError =
  | { code: 'SLOT_NOT_FOUND'; message: string }
  | { code: 'SLOT_CLOSED'; message: string }
  | { code: 'SLOT_IN_PAST'; message: string }
  | { code: 'INVALID_OPTIONS'; message: string }
  | { code: 'PRICING_FAILED'; message: string; detail: string }
  | { code: 'PROMOTION_INVALID'; message: string; detail: string }
  | { code: 'SOLD_OUT'; message: string }
  | { code: 'PROVIDER_FAILED'; message: string };

export type CheckoutResult =
  | {
      ok: true;
      /** True when an existing booking was returned rather than a new one created. */
      idempotentReplay: boolean;
      bookingId: string;
      reference: string;
      checkoutUrl: string;
      breakdown: PriceBreakdown;
    }
  | { ok: false; error: CheckoutError };

/**
 * Quote a booking without reserving anything — the total shown on the date/party screen (T-04).
 *
 * Deliberately separate from `startCheckout`, and deliberately reserving nothing: opening a
 * date picker must not consume a seat.
 */
export async function quoteBooking(
  deps: PaymentCoreDeps,
  input: Pick<CheckoutRequest, 'availabilitySlotId' | 'lines' | 'promotionId'>,
): Promise<{ ok: true; breakdown: PriceBreakdown } | { ok: false; error: CheckoutError }> {
  const priced = await priceFromDatabase(deps, input);
  if (!priced.ok) return priced;
  return { ok: true, breakdown: priced.breakdown };
}

export async function startCheckout(
  deps: PaymentCoreDeps,
  request: CheckoutRequest,
): Promise<CheckoutResult> {
  // The clock is used inside priceFromDatabase (slot-in-past check), not here.
  const { store, payments, ids } = deps;

  // Idempotency first. A retry must never reach the pricing or reservation path again.
  const existing = await store.findBookingByIdempotencyKey(request.idempotencyKey);
  if (existing) {
    const session = await payments.createCheckoutSession({
      bookingReference: existing.reference,
      amountMinor: existing.totalMinor,
      currency: existing.currency,
      description: `Caribbean VIP booking ${existing.reference}`,
      customerEmail: request.customerEmail,
      metadata: { booking_id: existing.id, booking_reference: existing.reference },
      successUrl: deps.successUrl,
      cancelUrl: deps.cancelUrl,
      idempotencyKey: request.idempotencyKey,
    });

    return {
      ok: true,
      idempotentReplay: true,
      bookingId: existing.id,
      reference: existing.reference,
      checkoutUrl: session.url,
      breakdown: breakdownFromBooking(existing),
    };
  }

  const priced = await priceFromDatabase(deps, request);
  if (!priced.ok) return priced;
  const { breakdown, slot, lineDetails } = priced;

  // Reserve BEFORE creating the payment session. If this fails the guest is told the slot is gone
  // and is never charged; the alternative order charges first and apologises afterwards.
  const reserved = await store.reserveCapacity(slot.id, breakdown.seats);
  if (!reserved) {
    return {
      ok: false,
      error: { code: 'SOLD_OUT', message: 'Those places have just been taken.' },
    };
  }

  const reference = formatBookingReference('J', ids.referenceSeed());

  try {
    const booking = await store.createBooking({
      userId: request.userId,
      vendorOrgId: slot.vendorOrgId,
      experienceId: slot.experienceId,
      availabilitySlotId: slot.id,
      promotionId: request.promotionId,
      reference,
      status: 'pending_payment',
      currency: breakdown.currency,
      subtotalMinor: breakdown.subtotal.amountMinor,
      discountMinor: breakdown.discountTotal.amountMinor,
      taxMinor: breakdown.tax.amountMinor,
      serviceFeeMinor: breakdown.serviceFee.amountMinor,
      totalMinor: breakdown.total.amountMinor,
      commissionMinor: breakdown.commission.amountMinor,
      seats: breakdown.seats,
      idempotencyKey: request.idempotencyKey,
    });

    await store.createGuestLines(booking.id, lineDetails);

    const session = await payments.createCheckoutSession({
      bookingReference: reference,
      amountMinor: breakdown.total.amountMinor,
      currency: breakdown.currency,
      description: `Caribbean VIP booking ${reference}`,
      customerEmail: request.customerEmail,
      metadata: { booking_id: booking.id, booking_reference: reference },
      successUrl: deps.successUrl,
      cancelUrl: deps.cancelUrl,
      idempotencyKey: request.idempotencyKey,
    });

    await store.upsertPaymentForCheckout({
      bookingId: booking.id,
      amountMinor: breakdown.total.amountMinor,
      currency: breakdown.currency,
      stripeCheckoutSessionId: session.id,
    });

    return {
      ok: true,
      idempotentReplay: false,
      bookingId: booking.id,
      reference,
      checkoutUrl: session.url,
      breakdown,
    };
  } catch {
    // Anything after a successful reservation must give the seat back, or a provider outage
    // silently shrinks inventory until the reconciliation job runs.
    await store.releaseCapacity(slot.id, breakdown.seats);
    return {
      ok: false,
      error: {
        code: 'PROVIDER_FAILED',
        message: 'We could not start the payment. Nothing has been charged.',
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Pricing from database state — the "never trust the client" boundary
// ---------------------------------------------------------------------------

async function priceFromDatabase(
  deps: PaymentCoreDeps,
  input: Pick<CheckoutRequest, 'availabilitySlotId' | 'lines' | 'promotionId'>,
):
  | Promise<
      | {
          ok: true;
          breakdown: PriceBreakdown;
          slot: NonNullable<Awaited<ReturnType<PaymentCoreDeps['store']['getSlot']>>>;
          lineDetails: { optionId: string; quantity: number; unitAmountMinor: number }[];
        }
      | { ok: false; error: CheckoutError }
    > {
  const { store, clock } = deps;

  const slot = await store.getSlot(input.availabilitySlotId);
  if (!slot) {
    return { ok: false, error: { code: 'SLOT_NOT_FOUND', message: 'That departure is no longer listed.' } };
  }
  if (slot.status !== 'open') {
    return { ok: false, error: { code: 'SLOT_CLOSED', message: 'That departure is closed.' } };
  }
  if (new Date(slot.startsAt).getTime() <= clock.now().getTime()) {
    return { ok: false, error: { code: 'SLOT_IN_PAST', message: 'That departure has already started.' } };
  }

  const options = await store.getOptions(slot.experienceId);
  const byId = new Map(options.filter((o) => o.isActive).map((o) => [o.id, o]));

  const lines: PriceLine[] = [];
  const lineDetails: { optionId: string; quantity: number; unitAmountMinor: number }[] = [];

  for (const requested of input.lines) {
    const option = byId.get(requested.optionId);
    // An option that belongs to a different experience, or is inactive, is rejected rather than
    // priced at zero — otherwise a crafted request could book a $200 tour using a $0 option id.
    if (!option) {
      return {
        ok: false,
        error: {
          code: 'INVALID_OPTIONS',
          message: 'One of the selected options is not available for this experience.',
        },
      };
    }
    lines.push({
      optionId: option.id,
      label: option.label,
      unitAmountMinor: option.unitAmountMinor, // from the database, never from the request
      quantity: requested.quantity,
      occupiesCapacity: option.occupiesCapacity,
    });
    lineDetails.push({
      optionId: option.id,
      quantity: requested.quantity,
      unitAmountMinor: option.unitAmountMinor,
    });
  }

  const settlementCurrency = await store.getSettlementCurrency();
  const mismatched = lines.find((l) => {
    const o = byId.get(l.optionId);
    return o && o.currency !== settlementCurrency;
  });
  if (mismatched) {
    // OD-09: settlement is single-currency at MVP. Failing loudly beats charging the wrong amount.
    return {
      ok: false,
      error: {
        code: 'PRICING_FAILED',
        message: 'This experience is not priced in the settlement currency.',
        detail: `expected ${settlementCurrency}`,
      },
    };
  }

  let discounts: Discount[] = [];
  if (input.promotionId) {
    const promo = await store.getPromotion(input.promotionId);
    const check = validatePromotion(promo, slot.experienceId, slot.vendorOrgId, clock.now());
    if (!check.ok) return { ok: false, error: check.error };
    discounts = check.discounts;
  }

  const config = await store.getPricingConfig();

  const result = calculateBookingTotal({
    currency: settlementCurrency,
    lines,
    discounts,
    config,
    capacityRemaining: Math.max(slot.capacity - slot.bookedCount, 0),
  });

  if (!result.ok) {
    return {
      ok: false,
      error: {
        code: result.error.code === 'EXCEEDS_CAPACITY' ? 'SOLD_OUT' : 'PRICING_FAILED',
        message:
          result.error.code === 'EXCEEDS_CAPACITY'
            ? 'There are not enough places left for that party size.'
            : 'We could not price that selection.',
        detail: result.error.code,
      } as CheckoutError,
    };
  }

  return { ok: true, breakdown: result.breakdown, slot, lineDetails };
}

/**
 * PRD §9: do not apply an offer that is expired, out of inventory, disabled, or not relevant.
 * Checked here rather than trusted from the client, because a promotion id is guessable.
 */
function validatePromotion(
  promo: PromotionSnapshot | null,
  experienceId: string,
  vendorOrgId: string,
  now: Date,
): { ok: true; discounts: Discount[] } | { ok: false; error: CheckoutError } {
  const reject = (detail: string): { ok: false; error: CheckoutError } => ({
    ok: false,
    error: { code: 'PROMOTION_INVALID', message: 'That offer cannot be applied.', detail },
  });

  if (!promo) return reject('not_found');
  if (promo.approvalState !== 'approved') return reject('not_approved');
  if (promo.vendorOrgId !== vendorOrgId) return reject('wrong_vendor');
  if (new Date(promo.startsAt).getTime() > now.getTime()) return reject('not_started');
  if (new Date(promo.endsAt).getTime() <= now.getTime()) return reject('expired');
  if (promo.inventoryLimit !== null && promo.issuedCount >= promo.inventoryLimit) {
    return reject('inventory_exhausted');
  }
  if (
    promo.appliesToExperienceIds.length > 0 &&
    !promo.appliesToExperienceIds.includes(experienceId)
  ) {
    return reject('not_applicable_to_experience');
  }

  switch (promo.valueKind) {
    case 'percentage':
      if (promo.valueRate === null) return reject('missing_rate');
      return {
        ok: true,
        discounts: [
          { kind: 'percentage', promotionId: promo.id, label: promo.title, rate: promo.valueRate },
        ],
      };
    case 'fixed':
      if (promo.valueAmountMinor === null) return reject('missing_amount');
      return {
        ok: true,
        discounts: [
          {
            kind: 'fixed',
            promotionId: promo.id,
            label: promo.title,
            amountMinor: promo.valueAmountMinor,
          },
        ],
      };
    case 'in_kind':
      // No monetary effect; fulfilled at redemption. Itemized so the guest sees it before paying.
      return {
        ok: true,
        discounts: [{ kind: 'inKind', promotionId: promo.id, label: promo.title }],
      };
  }
}

function breakdownFromBooking(b: {
  currency: Currency;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  serviceFeeMinor: number;
  totalMinor: number;
  commissionMinor: number;
  seats: number;
}): PriceBreakdown {
  const money = (amountMinor: number) => ({ amountMinor, currency: b.currency });
  return {
    currency: b.currency,
    lines: [],
    seats: b.seats,
    subtotal: money(b.subtotalMinor),
    discountTotal: money(b.discountMinor),
    discountsApplied: [],
    taxableBase: money(b.subtotalMinor - b.discountMinor),
    tax: money(b.taxMinor),
    serviceFee: money(b.serviceFeeMinor),
    total: money(b.totalMinor),
    commission: money(b.commissionMinor),
    vendorNet: money(b.subtotalMinor - b.discountMinor - b.commissionMinor),
  };
}

/** Voucher issuance helper shared by the webhook path. */
export async function mintVoucherToken(
  deps: PaymentCoreDeps,
): Promise<{ token: string; tokenHash: string }> {
  const token = await signVoucherToken(
    { v: VOUCHER_TOKEN_VERSION, id: deps.ids.voucherId() },
    deps.voucherSecret,
  );
  return { token, tokenHash: await hashVoucherToken(token) };
}
