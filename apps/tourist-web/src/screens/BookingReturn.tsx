/**
 * BookingReturn — handles the redirect from Stripe's hosted checkout.
 *
 * Stripe sends the guest to /?session_id=cs_xxx after payment. This screen polls
 * /booking-status until the webhook confirms the booking (or up to ~30 s), then
 * merges the booking's `my_bookings()` row into the store (or, if that read has not
 * caught up, a fill-only reconstruction) so the existing Confirmation, Ticket and
 * Trips screens work unchanged.
 *
 * If the session_id is missing or the booking cannot be found, it falls back to a
 * helpful error screen. Demo mode (no Supabase) never reaches this route.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../state/store';
import { pollBookingStatus } from '../lib/api';
import { findMyBookingRow, returnedBookingAction } from '../state/liveSync';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/kit';

type Phase = 'polling' | 'error';

const MAX_POLLS = 18;
const POLL_INTERVAL_MS = 1700;

export function BookingReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { state, dispatch } = useStore();

  const sessionId = params.get('session_id');
  const [phase, setPhase] = useState<Phase>('polling');
  const [attempt, setAttempt] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setPhase('error');
      return;
    }

    let count = 0;
    // Set by the cleanup: after unmount nothing may dispatch, navigate or set state.
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      setAttempt((n) => n + 1);
      const result = await pollBookingStatus(sessionId);
      if (cancelled) return;

      if (!result) {
        setPhase('error');
        return;
      }

      if (result.status === 'confirmed' && result.ticketToken) {
        const bookingId = result.bookingId;
        // One read of `my_bookings()`. With the row, the booking is the server's own (real
        // departure, catalogue id, itemisation); without it, a fill-only reconstruction from
        // booking-status and what Checkout left in sessionStorage. See `returnedBookingAction`.
        const row = await findMyBookingRow(bookingId);
        if (cancelled) return;
        const attendeeName = sessionStorage.getItem(`attendee_${bookingId}`) || null;

        // A merge, not `addBooking`: `useLiveSync` may already have recovered this booking on page
        // load, and `state` here is the first render's. The merge matches by id, so whichever lands
        // first there is still one booking.
        dispatch(
          returnedBookingAction(
            row,
            result,
            {
              slotDate: sessionStorage.getItem(`slot_date_${bookingId}`),
              slotTime: sessionStorage.getItem(`slot_time_${bookingId}`),
              party: sessionStorage.getItem(`party_${bookingId}`),
              attendee: attendeeName,
            },
            state.islandId,
          ),
        );
        // The merge keeps the device's attendee; if the sync landed first that is null, so the
        // one carried through Stripe is set explicitly.
        if (attendeeName) dispatch({ type: 'assignAttendee', bookingId, attendeeName });

        navigate(`/confirmation/${bookingId}`, { replace: true });
        return;
      }

      if (result.status === 'cancelled') {
        setPhase('error');
        return;
      }

      count += 1;
      if (count >= MAX_POLLS) {
        setPhase('error');
        return;
      }

      timerRef.current = setTimeout(run, POLL_INTERVAL_MS);
    };

    // Any rejection (network, a non-JSON body) ends on the error screen, never an unhandled
    // rejection with the spinner left turning.
    const run = () => {
      poll().catch(() => {
        if (!cancelled) setPhase('error');
      });
    };

    run();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // Deliberately keyed on `sessionId` alone. `state` and `dispatch` are read inside the poll
    // closure and must not restart it: re-running on every store change would open a second
    // polling chain against the same Stripe session.
  }, [sessionId]);

  if (phase === 'error') {
    return (
      <main className="screen">
        <EmptyState
          icon="calendar"
          title="We couldn't confirm your booking"
          body="If your card was charged, your booking will appear in Trips within a minute. Contact support if it doesn't."
          action="Go to Trips"
          onAction={() => navigate('/trips')}
        />
      </main>
    );
  }

  return (
    <main className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, paddingTop: 80 }}>
      <span className="booking-return__spinner">
        <Icon name="refresh" size={32} color="var(--brand)" />
      </span>
      <p className="t-body-strong" style={{ textAlign: 'center' }}>Confirming your booking…</p>
      <p className="t-caption c-faint" style={{ textAlign: 'center' }}>
        {attempt < 4 ? 'Waiting for payment confirmation' : 'Still confirming — hang on'}
      </p>
    </main>
  );
}
