import { useNavigate } from 'react-router-dom';
import { destinationBySlug, experienceById, heroUrl, islandById } from '../data/catalogue';
import { useStore } from '../state/store';
import { Badge, Card, DemoNote, EmptyState, Photo, SectionHeader, formatUsd } from '../components/kit';
import { Icon } from '../components/Icon';
import './Trips.css';

/**
 * Trips — the day plan.
 *
 * The design's argument for this screen is that booking history is passive and a day plan is not:
 * it leads with what is next, sequences the day, and totals it. That is why bookings and the
 * listings Irie put on the plan appear on one timeline rather than in separate lists — the guest
 * thinks in terms of their day, not in terms of which of these they have paid for yet.
 *
 * The day total sums the `totalMinor` that `calculateBookingTotal` produced at the time of booking.
 * No figure here is recomputed, which is what keeps it identical to the checkout and confirmation.
 */
export function Trips() {
  const { state } = useStore();
  const navigate = useNavigate();

  const island = islandById(state.islandId);
  const destination = destinationBySlug(state.destinationSlug);

  const bookings = state.bookings
    .filter((b) => b.status === 'confirmed' && b.islandId === state.islandId)
    .sort((a, b) => `${a.dateISO}${a.time}`.localeCompare(`${b.dateISO}${b.time}`));

  const planned = state.plannedExperienceIds
    .map((id) => experienceById(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e) && e!.islandId === state.islandId);

  const dayTotalMinor = bookings.reduce((sum, b) => sum + b.totalMinor, 0);
  const next = bookings[0];

  if (!island || !destination) return null;

  if (bookings.length === 0 && planned.length === 0) {
    return (
      <main className="screen">
        <header className="trips__head trips__head--bare">
          <p className="t-overline trips__brand">Caribbean VIP · {island.in_app_brand}</p>
          <h1 className="t-display-md c-on-dark">Your {destination.name} Day</h1>
        </header>
        <EmptyState
          icon="calendar"
          title="Nothing planned yet"
          body="Book an experience, or ask Irie AI to build an afternoon around where you are."
          action="Ask Irie AI"
          onAction={() => navigate('/irie')}
        />
        <DemoNote>Demo itinerary · sample timings</DemoNote>
      </main>
    );
  }

  return (
    <main className="screen">
      <header className="trips__head">
        <Photo
          src={`${import.meta.env.BASE_URL}demo/${island.hero_media_path ?? 'jm-hero'}.jpg`}
          alt=""
          ratio="390 / 214"
          radius="0"
          className="trips__head-photo"
        />
        <span className="trips__scrim" />
        <div className="trips__head-body">
          <p className="t-overline trips__brand">Caribbean VIP · {island.in_app_brand}</p>
          <div className="row trips__head-row">
            <div className="grow">
              <h1 className="t-display-md c-on-dark">Your {destination.name} Day</h1>
              <p className="t-caption trips__weather">
                {bookings.length} confirmed · {planned.length} suggested
              </p>
            </div>
            {next ? (
              <div className="trips__countdown">
                <p className="t-micro trips__countdown-label">STARTS AT</p>
                <p className="t-amount-sm c-on-dark">{next.time}</p>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {next ? (
        <Card className="next-up">
          <div className="row next-up__inner">
            <span className="next-up__icon">
              <Icon name="clock" size={21} color="var(--green-900)" />
            </span>
            <div className="grow">
              <p className="t-micro-strong c-locator">NEXT UP</p>
              <h2 className="t-caption-strong next-up__title">
                {experienceById(next.experienceId)?.title ?? 'Your booking'} · {next.time}
              </h2>
              <p className="t-micro c-urgent">Reference {next.reference}</p>
            </div>
            <button
              type="button"
              className="badge badge--brand next-up__cta"
              onClick={() => navigate(`/ticket/${next.id}`)}
            >
              Ticket
            </button>
          </div>
        </Card>
      ) : null}

      <section className="pad trips__timeline-wrap">
        <SectionHeader title="Day timeline" />
        <ol className="timeline">
          {bookings.map((b) => {
            const e = experienceById(b.experienceId);
            return (
              <li key={b.id} className="timeline__item">
                <span className="timeline__dot timeline__dot--confirmed" />
                <Card className="timeline__card" onClick={() => navigate(`/ticket/${b.id}`)}>
                  <div className="row timeline__row">
                    {e ? (
                      <Photo
                        src={heroUrl(e)}
                        mediaKey={e.media[0]}
                        alt=""
                        ratio="1 / 1"
                        radius="var(--r-sm)"
                        className="timeline__photo"
                      />
                    ) : null}
                    <div className="grow">
                      <p className="t-micro-strong c-locator">{b.time}</p>
                      <h3 className="t-caption-strong timeline__title">{e?.title ?? 'Booking'}</h3>
                      <div className="timeline__tags">
                        <Badge tone="aqua">Confirmed · {formatUsd(b.totalMinor)}</Badge>
                        {b.voucherId ? <Badge tone="sand">Voucher attached</Badge> : null}
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}

          {planned.map((e) => (
            <li key={e.id} className="timeline__item">
              <span className="timeline__dot timeline__dot--suggested" />
              <Card className="timeline__card" onClick={() => navigate(`/experience/${e.id}`)}>
                <div className="row timeline__row">
                  <Photo
                    src={heroUrl(e)}
                    mediaKey={e.media[0]}
                    alt=""
                    ratio="1 / 1"
                    radius="var(--r-sm)"
                    className="timeline__photo"
                  />
                  <div className="grow">
                    <p className="t-micro-strong c-faint">SUGGESTED BY IRIE</p>
                    <h3 className="t-caption-strong timeline__title">{e.title}</h3>
                    <div className="timeline__tags">
                      <Badge tone="muted">Not booked · from {formatUsd(e.fromAmountMinor)}</Badge>
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <div className="pad trips__total">
        <span className="t-caption c-muted grow">Estimated day total</span>
        <span className="t-amount c-brand">{formatUsd(dayTotalMinor)}</span>
      </div>

      <DemoNote>Demo itinerary · sample timings</DemoNote>
    </main>
  );
}
