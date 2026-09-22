import { useNavigate, useParams } from 'react-router-dom';
import { experienceById, islandById, vendorFor } from '../data/catalogue';
import { formatLongDate } from '../data/availability';
import { useStore, type VoucherState } from '../state/store';
import { QR } from '../components/QR';
import { Icon } from '../components/Icon';
import { EmptyState, formatUsd } from '../components/kit';
import './Ticket.css';

/**
 * The mobile ticket.
 *
 * Ticket stock on a deep green screen, with the notch-and-perforation the design draws. The QR is
 * **real** — it encodes the HMAC-signed token from `signTicket`, so a phone pointed at this screen
 * reads the same string `verifyTicket` checks. The booking reference is printed beside it for
 * humans and is deliberately *not* in the token: it is short, guessable and read aloud in public,
 * and `@cvip/types` is explicit that it is not a redemption credential.
 *
 * The four voucher states are shown as a row because the state machine is the thing worth
 * demonstrating — and the transition from `attached` to `redeemed` is one-way, which the redemption
 * screen proves rather than asserts.
 */
const VOUCHER_STATES: VoucherState[] = ['available', 'attached', 'redeemed', 'expired'];

export function Ticket() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { state } = useStore();

  const booking = state.bookings.find((b) => b.id === bookingId);
  const experience = booking ? experienceById(booking.experienceId) : undefined;
  const island = booking ? islandById(booking.islandId) : undefined;
  const voucher = booking?.voucherId ? state.vouchers.find((v) => v.id === booking.voucherId) : undefined;

  if (!booking || !experience) {
    return (
      <main className="screen">
        <EmptyState
          icon="calendar"
          title="That ticket is not here"
          body="It may have been reset. Your bookings are in Trips."
          action="Go to Trips"
          onAction={() => navigate('/trips')}
        />
      </main>
    );
  }

  const vendor = vendorFor(experience);
  const cancelled = booking.status === 'cancelled';

  return (
    <main className="screen screen--deep ticket">
      <header className="ticket__head">
        <button type="button" className="ticket__back" onClick={() => navigate(-1)} aria-label="Back">
          <Icon name="chevron-left" size={17} color="var(--on-dark)" strokeWidth={2.2} />
        </button>
        <p className="t-overline ticket__brand">Caribbean VIP · Mobile ticket</p>
        <span className="ticket__spacer" />
      </header>

      <article className={`stub ${cancelled ? 'stub--void' : ''}`}>
        <div className="stub__top">
          <div className="grow">
            <p className="t-micro c-faint stub__island">
              {island?.in_app_brand.toUpperCase()} · {vendor?.location.name.toUpperCase()}
            </p>
            <h1 className="t-display-md stub__title">{experience.title}</h1>
          </div>
          <span className="stub__crest" aria-hidden>
            <span className="stub__crest-vip">VIP</span>
            <span className="stub__crest-island">{island?.code}</span>
          </span>
        </div>

        <dl className="stub__grid">
          <div>
            <dt className="t-micro c-faint">GUEST</dt>
            {/*
              * This read "Alex Bennett" — a literal, on every ticket, for every
              * guest. It is the field a vendor reads off the screen when they
              * scan, so it was the one hardcoded string in the app that a real
              * person could be turned away over. `guestName` is what onboarding
              * collected; guests who skipped it are stored as "Guest", which is
              * the honest answer rather than someone else's name.
              */}
            <dd className="t-caption-strong">{state.guestName || 'Guest'}</dd>
          </div>
          <div>
            <dt className="t-micro c-faint">GUESTS</dt>
            <dd className="t-caption-strong">
              {booking.party.adults} adult{booking.party.adults === 1 ? '' : 's'}
              {booking.party.children > 0 ? `, ${booking.party.children} child` : ''}
            </dd>
          </div>
          <div>
            <dt className="t-micro c-faint">DATE &amp; TIME</dt>
            <dd className="t-caption-strong">
              {formatLongDate(booking.dateISO).replace(/,\s\d{4}$/, '')} · {booking.time}
            </dd>
          </div>
          <div>
            <dt className="t-micro c-faint">PAYMENT</dt>
            <dd className="t-caption-strong c-brand">
              {cancelled ? 'Cancelled' : `Paid · ${formatUsd(booking.totalMinor)}`}
            </dd>
          </div>
        </dl>

        <div className="stub__qr">
          <div className="stub__qr-frame">
            <QR value={booking.ticketToken} size={172} label={`Ticket for ${booking.reference}`} />
          </div>
          <p className="t-amount-sm stub__ref">{booking.reference}</p>
          <p className="t-micro c-muted">Show this code at the {vendor?.location.name}</p>
        </div>

        {/* The perforation, with notches punched out of the dark screen behind. */}
        <div className="stub__perf" aria-hidden>
          <span className="stub__notch stub__notch--l" />
          <span className="stub__notch stub__notch--r" />
        </div>

        <div className="stub__foot">
          {voucher ? (
            <>
              <div className="row stub__voucher">
                <span className="stub__voucher-icon">
                  <Icon name="ticket" size={17} color="var(--on-dark)" />
                </span>
                <div className="grow">
                  <p className="t-caption-strong">Complimentary rum punch</p>
                  <p className="t-micro c-muted">One per adult guest · redeem at the bar</p>
                </div>
                <span className={`stub__state stub__state--${voucher.state}`}>{voucher.state}</span>
              </div>

              <div className="stub__states" role="list" aria-label="Voucher states">
                {VOUCHER_STATES.map((s) => (
                  <span
                    key={s}
                    role="listitem"
                    className={`stub__pip ${voucher.state === s ? 'is-on' : ''}`}
                    aria-current={voucher.state === s ? 'true' : undefined}
                  >
                    {s}
                  </span>
                ))}
              </div>

              {voucher.state === 'redeemed' && voucher.redeemedAtISO ? (
                <p className="t-micro c-faint stub__redeemed">
                  Redeemed {new Date(voucher.redeemedAtISO).toLocaleString('en-GB')}
                  {voucher.redeemedBy ? ` by ${voucher.redeemedBy}` : ''}
                </p>
              ) : null}
            </>
          ) : (
            <p className="t-micro c-muted">No voucher attached to this booking.</p>
          )}
        </div>
      </article>

    </main>
  );
}
