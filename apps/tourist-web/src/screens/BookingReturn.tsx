/**
 * BookingReturn — handles the redirect from Stripe's hosted checkout.
 *
 * Stripe sends the guest to /?session_id=cs_xxx after payment. This screen polls
 * /booking-status until the webhook confirms the booking (or up to ~30 s), then
 * reconstructs the local Booking shape from the server response and adds it to the
 * store so the existing Confirmation, Ticket and Trips screens work unchanged.
 *
 * If the session_id is missing or the booking cannot be found, it falls back to a
 * helpful error screen. Demo mode (no Supabase) never reaches this route.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../state/store';
import { pollBookingStatus } from '../lib/api';
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

    const poll = async () => {
      setAttempt((n) => n + 1);
      const result = await pollBookingStatus(sessionId);

      if (!result) {
        setPhase('error');
        return;
      }

      if (result.status === 'confirmed' && result.ticketToken) {
        // Reconstruct enough of the Booking shape for the existing confirmation + ticket screens.
        // Lines are not stored locally — the confirmation screen falls back gracefully when empty.
        const bookingId = result.bookingId;

        // Only add if not already in store (idempotent on double-render).
        if (!state.bookings.some((b) => b.id === bookingId)) {
          dispatch({
            type: 'addBooking',
            booking: {
              id: bookingId,
              reference: result.reference,
              experienceId: result.experienceId,
              islandId: state.islandId,
              dateISO: extractDateFromSlot(sessionStorage.getItem(`slot_date_${bookingId}`) ?? ''),
              time: sessionStorage.getItem(`slot_time_${bookingId}`) ?? '',
              party: JSON.parse(sessionStorage.getItem(`party_${bookingId}`) ?? 'null') ?? { adults: result.seats, children: 0, photoPackage: false },
              totalMinor: result.totalMinor,
              lines: [],
              taxMinor: result.taxMinor,
              serviceFeeMinor: result.serviceFeeMinor,
              subtotalMinor: result.subtotalMinor,
              status: 'confirmed',
              createdAtISO: result.createdAt,
              ticketToken: result.ticketToken,
              voucherId: null,
              attendeeName: sessionStorage.getItem(`attendee_${bookingId}`) || null,
            },
          });
        }

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

      timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();

    return () => {
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

function extractDateFromSlot(raw: string): string {
  return raw ? raw.split('T')[0] ?? '' : '';
}
