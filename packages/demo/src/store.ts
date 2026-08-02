/**
 * In-memory demo backend.
 *
 * Implements everything the app needs from Supabase, so the whole user flow runs with zero
 * credentials. Crucially it is NOT a fake UI: the real pricing function, the real voucher codec,
 * the real booking and voucher state machines and the real payment core all run against this. Only
 * the storage is different.
 *
 * Two things it deliberately mirrors rather than simplifies, because simplifying them would let
 * the demo show something the real system would not:
 *
 *   - Public visibility joins listing status AND vendor status (`isPubliclyVisibleDemo`).
 *   - Capacity refuses to oversell, exactly as `reserve_availability()` does.
 */

import {
  calculateBookingTotal,
  formatBookingReference,
  hashVoucherToken,
  signVoucherToken,
  verifyVoucherToken,
  VOUCHER_TOKEN_VERSION,
  type Currency,
  type PriceBreakdown,
  type RedemptionResult,
} from '@cvip/types';
import {
  DEMO_DESTINATIONS,
  DEMO_EXPERIENCES,
  DEMO_ISLANDS,
  DEMO_PRICING_CONFIG,
  DEMO_PROMOTION,
  DEMO_VENDORS,
  demoOptionsFor,
  isPubliclyVisibleDemo,
  type DemoExperience,
} from './dataset';

const SETTLEMENT_CURRENCY: Currency = 'USD';

/** Dev-only signing key. A real deployment must use a rotated per-environment secret. */
const DEMO_VOUCHER_SECRET = 'demo-mode-voucher-secret-not-for-production-use';

export interface DemoSlot {
  id: string;
  experienceId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
}

export interface DemoBooking {
  id: string;
  reference: string;
  userId: string;
  experienceId: string;
  vendorId: string;
  slotId: string;
  status: 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'refunded';
  currency: Currency;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  serviceFeeMinor: number;
  totalMinor: number;
  seats: number;
  createdAt: string;
  lines: { label: string; quantity: number; unitAmountMinor: number }[];
  promotionTitle: string | null;
}

export interface DemoVoucher {
  id: string;
  token: string;
  tokenHash: string;
  bookingId: string;
  vendorId: string;
  state: 'active' | 'redeemed' | 'expired';
  validUntil: string;
  redeemedAt: string | null;
  redeemedBy: string | null;
}

export interface DemoRedemption {
  result: RedemptionResult;
  voucherId: string | null;
  redeemedAt: string | null;
  originalRedeemedAt: string | null;
  originalScanner: string | null;
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${(seq += 1).toString(36)}-${Date.now().toString(36)}`;

/**
 * Availability for the next 30 days, twice a day.
 *
 * The FIRST future slot of each experience is given capacity 1, so the sold-out path is always
 * reachable in a demo without anyone booking eleven times.
 *
 * "First future slot" rather than a fixed day-and-hour, because a fixed one disappears once that
 * hour has passed — a demo that behaves differently before and after 09:00 is a demo that will
 * embarrass someone.
 */
function buildSlots(): DemoSlot[] {
  const slots: DemoSlot[] = [];
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const now = Date.now();

  for (const exp of DEMO_EXPERIENCES) {
    if (!isPubliclyVisibleDemo(exp)) continue;

    let isFirstFutureSlot = true;

    for (let day = 0; day < 30; day++) {
      for (const hour of [9, 14]) {
        const startsAt = new Date(midnight);
        startsAt.setDate(startsAt.getDate() + day);
        startsAt.setHours(hour);
        if (startsAt.getTime() <= now) continue;

        slots.push({
          id: `${exp.id}-${day}-${hour}`,
          experienceId: exp.id,
          startsAt: startsAt.toISOString(),
          endsAt: new Date(startsAt.getTime() + exp.durationMinutes * 60_000).toISOString(),
          capacity: isFirstFutureSlot ? 1 : 12,
          bookedCount: 0,
        });
        isFirstFutureSlot = false;
      }
    }
  }
  return slots;
}

class DemoBackend {
  readonly slots = new Map<string, DemoSlot>();
  readonly bookings = new Map<string, DemoBooking>();
  readonly vouchers = new Map<string, DemoVoucher>();
  readonly savedExperienceIds = new Set<string>();
  readonly redemptionLog: { tokenHash: string; result: RedemptionResult; at: string }[] = [];

  /** A signed-in demo tourist. Demo mode never gates on a real account. */
  readonly userId = 'demo-tourist';

  constructor() {
    for (const s of buildSlots()) this.slots.set(s.id, s);
  }

  // -- Catalogue ----------------------------------------------------------

  islands() {
    return DEMO_ISLANDS.filter((i) => i.is_active);
  }

  destinations(islandId: string) {
    return DEMO_DESTINATIONS.filter((d) => d.island_id === islandId).sort(
      (a, b) => a.sort_order - b.sort_order,
    );
  }

  /**
   * Mirrors the RLS policy: approved listing AND approved vendor.
   *
   * The island filter is applied here rather than by the caller so that a screen which forgets to
   * pass an island shows every island's listings — visibly wrong — instead of silently showing
   * Jamaica's catalogue under a Barbados heading.
   */
  visibleExperiences(islandId?: string): DemoExperience[] {
    return DEMO_EXPERIENCES.filter(
      (e) => isPubliclyVisibleDemo(e) && (islandId === undefined || e.islandId === islandId),
    );
  }

  experience(id: string): DemoExperience | null {
    const exp = DEMO_EXPERIENCES.find((e) => e.id === id);
    // A hidden listing returns null — the same answer as a missing one, so the demo cannot be
    // used to confirm that a hidden listing exists either.
    return exp && isPubliclyVisibleDemo(exp) ? exp : null;
  }

  vendor(id: string) {
    return DEMO_VENDORS.find((v) => v.id === id) ?? null;
  }

  destinationBySlug(slug: string) {
    return DEMO_DESTINATIONS.find((d) => d.slug === slug) ?? null;
  }

  upcomingSlots(experienceId: string, limit = 12): DemoSlot[] {
    const now = Date.now();
    return [...this.slots.values()]
      .filter((s) => s.experienceId === experienceId && new Date(s.startsAt).getTime() > now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, limit);
  }

  slot(id: string): DemoSlot | null {
    return this.slots.get(id) ?? null;
  }

  promotionFor(experienceId: string) {
    return DEMO_PROMOTION.appliesToExperienceIds.includes(experienceId) ? DEMO_PROMOTION : null;
  }

  // -- Pricing ------------------------------------------------------------

  /**
   * Quote using the real `calculateBookingTotal`. The demo does not have its own pricing maths —
   * that is the whole point of the exercise.
   */
  quote(
    experienceId: string,
    slotId: string,
    quantities: Record<string, number>,
    applyPromotion: boolean,
  ): { ok: true; breakdown: PriceBreakdown } | { ok: false; reason: string } {
    const exp = this.experience(experienceId);
    const slot = this.slot(slotId);
    if (!exp || !slot) return { ok: false, reason: 'That departure is no longer available.' };

    const options = demoOptionsFor(exp);
    const lines = options
      .filter((o) => (quantities[o.id] ?? 0) > 0)
      .map((o) => ({
        optionId: o.id,
        label: o.label,
        unitAmountMinor: o.unitAmountMinor,
        quantity: quantities[o.id] as number,
        occupiesCapacity: o.occupiesCapacity,
      }));

    if (lines.length === 0) return { ok: false, reason: 'Choose at least one guest.' };

    const promo = applyPromotion ? this.promotionFor(experienceId) : null;

    const result = calculateBookingTotal({
      currency: SETTLEMENT_CURRENCY,
      lines,
      // The rum punch is in-kind: itemized so the guest sees it, no effect on the total.
      discounts: promo
        ? [{ kind: 'inKind', promotionId: promo.id, label: promo.title }]
        : [],
      config: DEMO_PRICING_CONFIG,
      capacityRemaining: Math.max(slot.capacity - slot.bookedCount, 0),
    });

    if (!result.ok) {
      return {
        ok: false,
        reason:
          result.error.code === 'EXCEEDS_CAPACITY'
            ? `Only ${slot.capacity - slot.bookedCount} place(s) left on this departure.`
            : result.error.message,
      };
    }
    return { ok: true, breakdown: result.breakdown };
  }

  // -- Booking ------------------------------------------------------------

  /** Refuses rather than oversells, exactly as `reserve_availability()` does. */
  private reserve(slotId: string, seats: number): boolean {
    const slot = this.slots.get(slotId);
    if (!slot) return false;
    if (slot.bookedCount + seats > slot.capacity) return false;
    slot.bookedCount += seats;
    return true;
  }

  /**
   * The full pay → confirm → issue-voucher path.
   *
   * Demo mode has no Stripe, so the "payment" is instantaneous — but everything either side of it
   * is the real thing: capacity is reserved before payment, the booking passes through
   * `pending_payment` before `confirmed`, and the voucher token is genuinely HMAC-signed by the
   * same codec the production path uses.
   */
  async book(input: {
    experienceId: string;
    slotId: string;
    quantities: Record<string, number>;
    applyPromotion: boolean;
  }): Promise<{ ok: true; booking: DemoBooking; voucher: DemoVoucher } | { ok: false; reason: string }> {
    const quoted = this.quote(
      input.experienceId,
      input.slotId,
      input.quantities,
      input.applyPromotion,
    );
    if (!quoted.ok) return { ok: false, reason: quoted.reason };

    const exp = this.experience(input.experienceId);
    const slot = this.slot(input.slotId);
    if (!exp || !slot) return { ok: false, reason: 'That departure is no longer available.' };

    if (!this.reserve(slot.id, quoted.breakdown.seats)) {
      return { ok: false, reason: 'Those places have just been taken.' };
    }

    const b = quoted.breakdown;
    // The reference is island-prefixed by the same helper production uses (VIPJ / VIPK / VIPB), so
    // a demo reference is shaped exactly like a real one rather than being Jamaican everywhere.
    const island = DEMO_ISLANDS.find((i) => i.id === exp.islandId);
    const reference = formatBookingReference(island?.code ?? 'J', demoVoucherId());
    const promo = input.applyPromotion ? this.promotionFor(input.experienceId) : null;

    const booking: DemoBooking = {
      id: nextId('booking'),
      reference,
      userId: this.userId,
      experienceId: exp.id,
      vendorId: exp.vendorId,
      slotId: slot.id,
      status: 'pending_payment',
      currency: b.currency,
      subtotalMinor: b.subtotal.amountMinor,
      discountMinor: b.discountTotal.amountMinor,
      taxMinor: b.tax.amountMinor,
      serviceFeeMinor: b.serviceFee.amountMinor,
      totalMinor: b.total.amountMinor,
      seats: b.seats,
      createdAt: new Date().toISOString(),
      lines: b.lines.map((l) => ({
        label: l.label,
        quantity: l.quantity,
        unitAmountMinor: l.unitAmountMinor,
      })),
      promotionTitle: promo?.title ?? null,
    };
    this.bookings.set(booking.id, booking);

    // Payment confirmation — the only step demo mode short-circuits.
    booking.status = 'confirmed';

    const token = await signVoucherToken(
      { v: VOUCHER_TOKEN_VERSION, id: demoVoucherId() },
      DEMO_VOUCHER_SECRET,
    );
    const voucher: DemoVoucher = {
      id: nextId('voucher'),
      token,
      tokenHash: await hashVoucherToken(token),
      bookingId: booking.id,
      vendorId: exp.vendorId,
      state: 'active',
      // Valid until the day after the departure, matching the production rule.
      validUntil: new Date(new Date(slot.endsAt).getTime() + 86_400_000).toISOString(),
      redeemedAt: null,
      redeemedBy: null,
    };
    this.vouchers.set(voucher.id, voucher);

    return { ok: true, booking, voucher };
  }

  bookingsForUser(): DemoBooking[] {
    return [...this.bookings.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  voucherForBooking(bookingId: string): DemoVoucher | null {
    return [...this.vouchers.values()].find((v) => v.bookingId === bookingId) ?? null;
  }

  cancelBooking(bookingId: string): boolean {
    const booking = this.bookings.get(bookingId);
    if (!booking || booking.status !== 'confirmed') return false;
    booking.status = 'cancelled';

    const slot = this.slots.get(booking.slotId);
    if (slot) slot.bookedCount = Math.max(slot.bookedCount - booking.seats, 0);

    const voucher = this.voucherForBooking(bookingId);
    if (voucher && voucher.state === 'active') voucher.state = 'expired';
    return true;
  }

  // -- Redemption ---------------------------------------------------------

  /**
   * Runs the same decision order as `redeem_voucher()`, including the property that matters most:
   * `redeemed` is terminal, and a second scan reports the ORIGINAL timestamp (V-05).
   */
  async redeem(token: string, scannerName = 'Demo vendor'): Promise<DemoRedemption> {
    const record = (result: RedemptionResult, voucherId: string | null): void => {
      this.redemptionLog.push({
        tokenHash: token.slice(-12),
        result,
        at: new Date().toISOString(),
      });
      void voucherId;
    };

    let hash: string;
    try {
      hash = await hashVoucherToken(token);
    } catch {
      record('bad_signature', null);
      return blank('bad_signature');
    }

    const voucher = [...this.vouchers.values()].find((v) => v.tokenHash === hash);
    if (!voucher) {
      record('unknown_token', null);
      return blank('unknown_token');
    }

    if (voucher.state === 'redeemed') {
      record('already_redeemed', voucher.id);
      return {
        result: 'already_redeemed',
        voucherId: voucher.id,
        redeemedAt: null,
        originalRedeemedAt: voucher.redeemedAt,
        originalScanner: voucher.redeemedBy,
      };
    }
    if (voucher.state === 'expired' || new Date(voucher.validUntil).getTime() <= Date.now()) {
      record('expired', voucher.id);
      return blank('expired', voucher.id);
    }

    const booking = this.bookings.get(voucher.bookingId);
    if (booking && booking.status !== 'confirmed') {
      record('booking_not_paid', voucher.id);
      return blank('booking_not_paid', voucher.id);
    }

    const now = new Date().toISOString();
    voucher.state = 'redeemed';
    voucher.redeemedAt = now;
    voucher.redeemedBy = scannerName;
    record('ok', voucher.id);

    return {
      result: 'ok',
      voucherId: voucher.id,
      redeemedAt: now,
      originalRedeemedAt: null,
      originalScanner: null,
    };
  }

  /**
   * Redeem a token that arrived from somewhere else — the vendor scanner's entry point.
   *
   * The vendor portal is a separate app in a separate browser, so it does not share this process's
   * memory with the tourist app: a voucher issued on the phone is genuinely unknown here. Rejecting
   * it as `unknown_token` would be technically true and would also make the flagship journey
   * (book on a phone, scan at the vendor) undemonstrable.
   *
   * So a token that is *cryptographically valid* and has never been seen is adopted as an active
   * voucher and redeemed. That is the only concession, and it is a narrow one:
   *
   *   - The HMAC is genuinely verified against the same secret and by the same codec, so a
   *     tampered or fabricated QR still fails with `bad_signature` before anything is stored.
   *   - Everything after adoption is the real state machine. A second scan of the same token hits
   *     `already_redeemed` and reports the ORIGINAL timestamp and scanner, which is V-05's
   *     acceptance criterion and the thing the demo most needs to show.
   *
   * A real deployment never takes this path: `redeem_voucher()` looks the hash up in the database,
   * and an unknown hash is an unknown voucher.
   */
  async redeemScannedToken(token: string, scannerName: string): Promise<DemoRedemption> {
    const verified = await verifyVoucherToken(token.trim(), DEMO_VOUCHER_SECRET);
    if (!verified.ok) {
      const result: RedemptionResult =
        verified.error.code === 'BAD_SIGNATURE' ? 'bad_signature' : 'unknown_token';
      this.redemptionLog.push({
        tokenHash: token.slice(-12),
        result,
        at: new Date().toISOString(),
      });
      return blank(result);
    }

    const hash = await hashVoucherToken(token.trim());
    if (![...this.vouchers.values()].some((v) => v.tokenHash === hash)) {
      const adopted: DemoVoucher = {
        id: nextId('voucher'),
        token: token.trim(),
        tokenHash: hash,
        bookingId: 'scanned-elsewhere',
        vendorId: 'scanned-elsewhere',
        state: 'active',
        validUntil: new Date(Date.now() + 86_400_000).toISOString(),
        redeemedAt: null,
        redeemedBy: null,
      };
      this.vouchers.set(adopted.id, adopted);
    }

    return this.redeem(token.trim(), scannerName);
  }

  // -- Saved items --------------------------------------------------------

  isSaved(experienceId: string): boolean {
    return this.savedExperienceIds.has(experienceId);
  }

  toggleSaved(experienceId: string): boolean {
    if (this.savedExperienceIds.has(experienceId)) {
      this.savedExperienceIds.delete(experienceId);
      return false;
    }
    this.savedExperienceIds.add(experienceId);
    return true;
  }
}

function blank(result: RedemptionResult, voucherId: string | null = null): DemoRedemption {
  return { result, voucherId, redeemedAt: null, originalRedeemedAt: null, originalScanner: null };
}

function demoVoucherId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * One shared instance per app session.
 *
 * State is intentionally in memory only: a demo that persisted would accumulate other people's
 * bookings and stop being a clean walkthrough. Reloading resets it.
 */
export const demoBackend = new DemoBackend();
