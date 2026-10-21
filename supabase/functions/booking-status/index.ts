/**
 * booking-status — polled by the tourist app after Stripe redirect.
 *
 * GET ?session_id=cs_xxx
 * → { status: 'pending_payment'|'confirmed'|'cancelled', ticketToken?: string }
 *
 * The caller must be signed in (anonymous sign-in counts) AS THE GUEST WHO OWNS THE BOOKING.
 * The session id alone is not enough: it is in the success URL, so it leaks through browser
 * history, Referer headers and screenshots. A missing user is 401; a booking that is missing or
 * belongs to someone else is the same 404, so session ids cannot be probed.
 *
 * Uses the service-role client for the lookup, so the ownership check below is the only thing
 * standing between a session id and a ticket — see `_shared/bookingStatusAccess.ts`.
 */

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { bearerToken, decideBookingStatusAccess } from '../_shared/bookingStatusAccess.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'GET') {
    return json({ error: 'GET only' }, 405);
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session_id');
  if (!sessionId) return json({ error: 'session_id required' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // `verify_jwt` only proves the bearer is SOME valid Supabase JWT, and the publishable anon key
  // is one. Ask Auth who the user is; the anon key has no user and comes back null.
  const token = bearerToken(req.headers.get('Authorization'));
  const { data: auth } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  const callerUserId = auth.user?.id ?? null;
  if (!callerUserId) return json({ error: 'Sign in required' }, 401);

  const { data, error } = await supabase
    .from('payments')
    .select('bookings!inner(id, user_id, status, ticket_token, reference, experience_id, availability_slot_id, total_minor, tax_minor, service_fee_minor, subtotal_minor, seats, created_at)')
    .eq('stripe_checkout_session_id', sessionId)
    .single();

  if (error || !data) return json({ error: 'Booking not found' }, 404);

  const booking = (data as { bookings: Record<string, unknown> }).bookings;

  const access = decideBookingStatusAccess(callerUserId, {
    user_id: booking.user_id as string,
    status: booking.status as string,
    ticket_token: (booking.ticket_token as string | null) ?? null,
  });
  if (!access.ok) return json({ error: 'Booking not found' }, 404);

  return json({
    bookingId: booking.id,
    status: booking.status,
    reference: booking.reference,
    experienceId: booking.experience_id,
    availabilitySlotId: booking.availability_slot_id,
    totalMinor: booking.total_minor,
    taxMinor: booking.tax_minor,
    serviceFeeMinor: booking.service_fee_minor,
    subtotalMinor: booking.subtotal_minor,
    seats: booking.seats,
    createdAt: booking.created_at,
    ticketToken: access.ticketToken,
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
