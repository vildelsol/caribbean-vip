/**
 * Who may read a booking through `booking-status`, and what they get.
 *
 * Pure and in its own file for the same reason as `returnUrls.ts`: the function around it needs
 * Deno and a live Supabase, and this is the part that decides whether a ticket leaks.
 *
 * The Stripe checkout session id is NOT a credential. It is in the success URL, so it lives in
 * browser history, Referer headers, screenshots and the Stripe dashboard. The caller must also be
 * the guest the booking belongs to. The anon key alone is not a user, so it never qualifies.
 */

/** Statuses at which the ticket token may be released — the same rule as `my_bookings()`. */
const TICKET_STATUSES: readonly string[] = ['confirmed', 'completed'];

export interface BookingAccessRow {
  user_id: string;
  status: string;
  ticket_token: string | null;
}

export type BookingStatusAccess = { ok: true; ticketToken: string | null } | { ok: false };

/**
 * `{ ok: false }` covers "not yours" and "no caller" alike, and the function answers both exactly
 * as it answers a booking that does not exist, so a stranger cannot probe which session ids are real.
 */
export function decideBookingStatusAccess(
  callerUserId: string | null,
  booking: BookingAccessRow,
): BookingStatusAccess {
  if (!callerUserId || callerUserId !== booking.user_id) return { ok: false };
  const releasable = TICKET_STATUSES.includes(booking.status);
  return { ok: true, ticketToken: releasable ? (booking.ticket_token ?? null) : null };
}
