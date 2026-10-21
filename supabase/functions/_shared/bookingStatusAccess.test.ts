import { describe, expect, it } from 'vitest';
import { bearerToken, decideBookingStatusAccess } from './bookingStatusAccess';

/**
 * booking-status used to answer anyone holding a Stripe checkout session id, with the booking and
 * its ticket token — the thing the QR at the gate is made from. The session id is not a secret: it
 * is in the success URL, so it sits in browser history, Referer headers, a shared screenshot and
 * the Stripe dashboard. Knowing it must not be enough to hold the ticket.
 *
 * The function itself needs Deno and a live Supabase, so the decision is pulled out and pinned here.
 */

const OWNER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';

const booking = (over: Partial<{ user_id: string; status: string; ticket_token: string | null }> = {}) => ({
  user_id: OWNER,
  status: 'confirmed',
  ticket_token: 'signed-ticket-token',
  ...over,
});

describe('who may read a booking through booking-status', () => {
  it('lets the guest who owns the booking read it, with the ticket token', () => {
    expect(decideBookingStatusAccess(OWNER, booking())).toEqual({
      ok: true,
      ticketToken: 'signed-ticket-token',
    });
  });

  it('refuses a different signed-in guest, even though they hold the session id', () => {
    expect(decideBookingStatusAccess(STRANGER, booking())).toEqual({ ok: false });
  });

  it('refuses a caller with no user at all (the anon key alone)', () => {
    expect(decideBookingStatusAccess(null, booking())).toEqual({ ok: false });
  });

  it('refuses an empty-string user id rather than comparing it to anything', () => {
    expect(decideBookingStatusAccess('', booking({ user_id: '' }))).toEqual({ ok: false });
  });

  it('does not tell a stranger whether the booking exists — same answer as a missing one', () => {
    expect(decideBookingStatusAccess(STRANGER, booking({ status: 'pending_payment' }))).toEqual({ ok: false });
  });
});

describe('when the owner may have the ticket token', () => {
  it.each(['confirmed', 'completed'])('releases it for %s', (status) => {
    expect(decideBookingStatusAccess(OWNER, booking({ status }))).toEqual({
      ok: true,
      ticketToken: 'signed-ticket-token',
    });
  });

  it.each(['pending_payment', 'expired', 'cancelled', 'refunded'])(
    'withholds it for %s, but still reports the status',
    (status) => {
      expect(decideBookingStatusAccess(OWNER, booking({ status }))).toEqual({ ok: true, ticketToken: null });
    },
  );

  it('reports no token when the booking has none yet', () => {
    expect(decideBookingStatusAccess(OWNER, booking({ ticket_token: null }))).toEqual({ ok: true, ticketToken: null });
  });
});

describe('reading the caller token from the Authorization header', () => {
  it('extracts a bearer token', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });
  it('is case-insensitive about the scheme', () => {
    expect(bearerToken('bearer abc')).toBe('abc');
  });
  it.each([null, '', 'Bearer', 'Bearer ', 'Basic abc', 'abc'])('returns null for %j', (h) => {
    expect(bearerToken(h)).toBeNull();
  });
});
