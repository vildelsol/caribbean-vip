/**
 * booking-status — polled by the tourist app after Stripe redirect.
 *
 * GET ?session_id=cs_xxx
 * → { status: 'pending_payment'|'confirmed'|'cancelled', ticketToken?: string }
 *
 * Returns 404 if the booking is not found for the session. Uses the service-role client
 * so it can read across user boundaries — security relies on the session_id being
 * unguessable (it is a Stripe-generated opaque ID, not sequential).
 */

import { createClient } from 'npm:@supabase/supabase-js@^2';

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

  const { data, error } = await supabase
    .from('payments')
    .select('bookings!inner(id, status, ticket_token, reference, experience_id, availability_slot_id, total_minor, tax_minor, service_fee_minor, subtotal_minor, seats, created_at)')
    .eq('stripe_checkout_session_id', sessionId)
    .single();

  if (error || !data) return json({ error: 'Booking not found' }, 404);

  const booking = (data as { bookings: Record<string, unknown> }).bookings;

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
    ticketToken: booking.ticket_token ?? null,
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
