import { useNavigate, useParams } from 'react-router-dom';
import { byDistanceFrom, destinationBySlug, experienceById, experiencesFor, heroUrl, simulatedPosition } from '../data/catalogue';
import { formatLongDate, pickupTime } from '../data/availability';
import { useStore } from '../state/store';
import { QR } from '../components/QR';
import { Icon } from '../components/Icon';
import { Badge, Card, DemoNote, EmptyState, Photo, PrimaryButton, SecondaryButton, formatUsd } from '../components/kit';
import './Confirmation.css';

/**
 * Booking confirmed — the design's "rewarding receipt".
 *
 * Its argument is that a confirmation is not a dead end: ticket, voucher, and **one good next idea
 * for the same day**. So the last section is a single suggestion drawn from the real catalogue and
 * sorted by distance from where the guest is, not a grid of upsells.
 */
export function Confirmation() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { state, dispatch } = useStore();

  const booking = state.bookings.find((b) => b.id === bookingId);
  const experience = booking ? experienceById(booking.experienceId) : undefined;
  const destination = destinationBySlug(state.destinationSlug);
  const voucher = booking?.voucherId ? state.vouchers.find((v) => v.id === booking.voucherId) : undefined;

  if (!booking || !experience) {
    return (
      <main className="screen">
        <EmptyState
          icon="calendar"
          title="That booking is not here"
          body="It may have been reset. Your other bookings are in Trips."
          action="Go to Trips"
          onAction={() => navigate('/trips')}
        />
      </main>
    );
  }

  // One suggestion, close by, that is not the thing just booked and is not already on the plan.
  const next = destination
    ? byDistanceFrom(simulatedPosition(destination), experiencesFor(booking.islandId)).find(
        ({ experience: e }) =>
          e.id !== experience.id &&
          !state.plannedExperienceIds.includes(e.id) &&
          !state.bookings.some((b) => b.experienceId === e.id && b.status === 'confirmed'),
      )
    : undefined;

  return (
    <main className="screen confirm">
      <header className="confirm__hero">
        <Photo src={heroUrl(experience)} mediaKey={experience.media[0]} alt="" ratio="390 / 290" radius="0" />
        <span className="confirm__scrim" />
        <div className="confirm__hero-body">
          <p className="row confirm__flag">
            <Icon name="sparkle" size={16} color="var(--gold-light)" />
            <span className="t-overline">Booking confirmed</span>
          </p>
          <h1 className="t-display c-on-dark confirm__title">You&rsquo;re going to {experience.title}!</h1>
        </div>
      </header>

      <Card className="confirm__card">
        <div className="row confirm__card-inner">
          <div className="grow">
            <p className="t-micro c-faint confirm__key">{formatLongDate(booking.dateISO).toUpperCase()}</p>
            <p className="t-caption-strong confirm__val">
              {booking.time} · {booking.party.adults} adult{booking.party.adults === 1 ? '' : 's'}
              {booking.party.children > 0 ? `, ${booking.party.children} child` : ''}
            </p>

            <p className="t-micro c-faint confirm__key">BOOKING REFERENCE</p>
            <p className="t-amount-sm c-brand confirm__ref">{booking.reference}</p>

            <p className="t-micro c-muted confirm__pickup">Hotel pickup around {pickupTime(booking.time)}</p>

            {voucher ? (
              <p className="confirm__voucher t-micro-strong">
                <span className="confirm__voucher-dot" />
                Rum punch voucher attached
              </p>
            ) : null}
          </div>

          <button type="button" className="confirm__qr" onClick={() => navigate(`/ticket/${booking.id}`)}>
            <QR value={booking.ticketToken} size={92} label={`Ticket for ${booking.reference}`} />
            <span className="t-micro-strong c-locator">View ticket</span>
          </button>
        </div>
      </Card>

      <div className="confirm__actions">
        <PrimaryButton onClick={() => navigate('/trips')}>Add to my day</PrimaryButton>
        <SecondaryButton onClick={() => navigate(`/ticket/${booking.id}`)}>Show ticket</SecondaryButton>
      </div>

      <p className="confirm__total t-caption">
        <span className="grow c-muted">Paid</span>
        <span className="t-amount-sm c-brand">{formatUsd(booking.totalMinor, { withCode: true })}</span>
      </p>

      {next ? (
        <section className="confirm__next">
          <h2 className="t-section">Make it a full day</h2>
          <Card className="next-idea" onClick={() => navigate(`/experience/${next.experience.id}`)}>
            <div className="row next-idea__inner">
              <Photo
                src={heroUrl(next.experience)}
                mediaKey={next.experience.media[0]}
                alt=""
                ratio="1 / 1"
                radius="var(--r-md)"
                className="next-idea__photo"
              />
              <div className="grow">
                <p className="t-micro-strong c-locator">NEARBY, AFTER YOU FINISH</p>
                <h3 className="t-caption-strong next-idea__title">{next.experience.title}</h3>
                <div className="row next-idea__foot">
                  <span className="t-caption-strong c-brand">
                    from {formatUsd(next.experience.fromAmountMinor)}
                  </span>
                  <Badge tone="aqua">Add</Badge>
                </div>
              </div>
            </div>
          </Card>
          <button
            type="button"
            className="confirm__plan t-micro-strong c-locator"
            onClick={() => {
              dispatch({ type: 'planExperience', experienceId: next.experience.id });
              navigate('/trips');
            }}
          >
            Add to my day without booking
          </button>
        </section>
      ) : null}

      <DemoNote>Demo booking · no payment processed</DemoNote>
    </main>
  );
}
