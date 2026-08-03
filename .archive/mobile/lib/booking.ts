import type { PriceBreakdown } from '@cvip/types';
import { demoBackend, type DemoBooking, type DemoVoucher } from '@cvip/demo';
import { supabase } from './supabase';
import { isDemoMode } from './mode';

/**
 * Booking, payment and voucher reads for the tourist app — T-04, T-05, T-06, T-09.
 *
 * Dispatches between the demo backend and a real backend the same way `catalogue.ts` does. Neither
 * path computes a price in this file: the demo path runs `calculateBookingTotal` inside
 * `@cvip/demo`, and the live path asks the server, because PRD §10 requires totals to be computed
 * server-side and a client that can price its own booking can also discount it.
 *
 * ## The live path is deliberately not implemented here
 *
 * Taking a real payment needs the `checkout-session` Edge Function, which is not deployed (there is
 * no hosted Supabase project yet — see docs/HANDOVER.md §7). Rather than half-wire it, the live
 * path returns a specific, honest error. Operating rule 4: a missing dependency documents itself
 * instead of failing somewhere confusing.
 */

export interface BookingSummary {
  id: string;
  reference: string;
  experienceId: string;
  experienceTitle: string;
  vendorName: string | null;
  status: DemoBooking['status'];
  startsAt: string | null;
  seats: number;
  currency: string;
  totalMinor: number;
  lines: { label: string; quantity: number; unitAmountMinor: number }[];
  subtotalMinor: number;
  taxMinor: number;
  serviceFeeMinor: number;
  discountMinor: number;
  promotionTitle: string | null;
  cancellationHours: number;
  createdAt: string;
  heroMediaKey: string | null;
}

export interface VoucherSummary {
  id: string;
  token: string;
  state: DemoVoucher['state'];
  validUntil: string;
  redeemedAt: string | null;
  redeemedBy: string | null;
}

const NOT_CONFIGURED =
  'Booking needs the checkout Edge Function, which is not deployed for this build. ' +
  'Run the app without Supabase credentials to use demo mode. See docs/setup.md.';

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

export type QuoteResult =
  | { ok: true; breakdown: PriceBreakdown }
  | { ok: false; reason: string };

/** Price a prospective booking. Reserves nothing — opening a picker must not consume a seat. */
export async function quoteBooking(input: {
  experienceId: string;
  slotId: string;
  quantities: Record<string, number>;
  applyPromotion: boolean;
}): Promise<QuoteResult> {
  if (isDemoMode) {
    return demoBackend.quote(
      input.experienceId,
      input.slotId,
      input.quantities,
      input.applyPromotion,
    );
  }
  return { ok: false, reason: NOT_CONFIGURED };
}

// ---------------------------------------------------------------------------
// Book
// ---------------------------------------------------------------------------

export type BookResult =
  | { ok: true; bookingId: string; reference: string }
  | { ok: false; reason: string };

/**
 * Pay and confirm.
 *
 * In demo mode the payment itself is the only step that is short-circuited: capacity is still
 * reserved before it, the booking still passes through `pending_payment`, and the voucher token is
 * still signed by the production codec.
 */
export async function createBooking(input: {
  experienceId: string;
  slotId: string;
  quantities: Record<string, number>;
  applyPromotion: boolean;
}): Promise<BookResult> {
  if (isDemoMode) {
    const result = await demoBackend.book(input);
    if (!result.ok) return { ok: false, reason: result.reason };
    return { ok: true, bookingId: result.booking.id, reference: result.booking.reference };
  }
  return { ok: false, reason: NOT_CONFIGURED };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function summarize(booking: DemoBooking): BookingSummary {
  const experience = demoBackend.experience(booking.experienceId);
  const vendor = demoBackend.vendor(booking.vendorId);
  const slot = demoBackend.slot(booking.slotId);

  return {
    id: booking.id,
    reference: booking.reference,
    experienceId: booking.experienceId,
    experienceTitle: experience?.title ?? 'Experience',
    vendorName: vendor?.tradingName ?? null,
    status: booking.status,
    startsAt: slot?.startsAt ?? null,
    seats: booking.seats,
    currency: booking.currency,
    totalMinor: booking.totalMinor,
    lines: booking.lines,
    subtotalMinor: booking.subtotalMinor,
    taxMinor: booking.taxMinor,
    serviceFeeMinor: booking.serviceFeeMinor,
    discountMinor: booking.discountMinor,
    promotionTitle: booking.promotionTitle,
    cancellationHours: experience?.cancellationHours ?? 24,
    createdAt: booking.createdAt,
    heroMediaKey: experience?.media[0] ?? null,
  };
}

export async function loadBookings(): Promise<{ bookings: BookingSummary[]; error: string | null }> {
  if (isDemoMode) {
    return { bookings: demoBackend.bookingsForUser().map(summarize), error: null };
  }
  if (!supabaseReady()) return { bookings: [], error: null };

  // Live reads go through RLS: `bookings_owner_read` restricts this to the caller's own rows, so
  // there is deliberately no user_id filter here to forget or to get wrong.
  const { data, error } = await supabase
    .from('bookings')
    .select('id, reference, status, currency, total_minor, seats, created_at')
    .order('created_at', { ascending: false });

  if (error) return { bookings: [], error: error.message };
  // A live booking list needs the experience and slot joins that only exist once a hosted project
  // is provisioned; until then an empty list is the honest answer, not a half-populated one.
  return { bookings: [], error: (data?.length ?? 0) > 0 ? NOT_CONFIGURED : null };
}

export async function loadBooking(bookingId: string): Promise<BookingSummary | null> {
  if (!isDemoMode) return null;
  const booking = demoBackend.bookingsForUser().find((b) => b.id === bookingId);
  return booking ? summarize(booking) : null;
}

export async function loadVoucher(bookingId: string): Promise<VoucherSummary | null> {
  if (!isDemoMode) return null;
  const voucher = demoBackend.voucherForBooking(bookingId);
  if (!voucher) return null;
  return {
    id: voucher.id,
    token: voucher.token,
    state: voucher.state,
    validUntil: voucher.validUntil,
    redeemedAt: voucher.redeemedAt,
    redeemedBy: voucher.redeemedBy,
  };
}

/** T-09 — cancel where the policy allows. Returns false when the booking is not cancellable. */
export async function cancelBooking(bookingId: string): Promise<boolean> {
  if (!isDemoMode) return false;
  return demoBackend.cancelBooking(bookingId);
}

/**
 * Whether a booking may still be cancelled free of charge.
 *
 * The cutoff is computed from the departure, not from the booking date — cancelling 20 hours before
 * a departure booked three months ago is late, and the policy has to say so.
 */
export function cancellationDeadline(booking: BookingSummary): {
  cancellable: boolean;
  deadline: Date | null;
} {
  if (booking.status !== 'confirmed' || !booking.startsAt) {
    return { cancellable: false, deadline: null };
  }
  const deadline = new Date(
    new Date(booking.startsAt).getTime() - booking.cancellationHours * 3_600_000,
  );
  return { cancellable: Date.now() < deadline.getTime(), deadline };
}

function supabaseReady(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  );
}
