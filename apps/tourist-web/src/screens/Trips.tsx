import { useNavigate } from 'react-router-dom';
import { destinationBySlug, experienceById, heroUrl, islandById, type DemoExperience } from '../data/catalogue';
import { useStore } from '../state/store';
import { Badge, Card, EmptyState, Photo, SectionHeader, formatUsd } from '../components/kit';
import { Icon } from '../components/Icon';
import './Trips.css';

function transitMinutes(from: DemoExperience | undefined, to: DemoExperience | undefined): number {
  if (!from || !to) return 12;
  const diff = Math.abs(from.durationMinutes - to.durationMinutes);
  return Math.max(5, Math.min(25, 8 + Math.round(diff / 20)));
}

/**
 * How you get from one stop to the next, and what it costs you.
 *
 * The design writes this as a sentence rather than a duration alone, because "18 min drive" and
 * "18 min drive · taxi from US$14" are different pieces of news: the second one has a cost in it
 * that the day total does not cover, and a guest planning an afternoon needs to see it.
 */
function transitNote(from: DemoExperience | undefined, to: DemoExperience | undefined) {
  const mins = transitMinutes(from, to);
  if (mins <= 9 && to && !to.pickupInfo) {
    return { icon: 'walk' as const, text: `${mins} min walk along the shore road` };
  }
  if (to?.pickupInfo) {
    return { icon: 'car' as const, text: `${mins} min drive · included pickup` };
  }
  return { icon: 'car' as const, text: `${mins} min drive · taxi from US$${8 + mins}` };
}

/** Food stops get their own colour on the timeline — the design reads the day by rhythm, not list. */
function dotTone(e: DemoExperience | undefined): string {
  if (!e) return 'confirmed';
  return e.category === 'food' || e.category === 'nightlife' ? 'dining' : 'confirmed';
}

/** "2h 15m" until the first booking, or null once the day has started. */
function startsIn(time: string): string | null {
  const [h, m] = time.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return null;
  const now = new Date();
  const start = new Date();
  start.setHours(h, m, 0, 0);
  const diffMin = Math.round((start.getTime() - now.getTime()) / 60000);
  if (diffMin <= 0) return null;
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

/** Rough distance covered by a day with this many stops. Demo figure, as the note below says. */
function routeKm(stops: number): number {
  return Math.max(6, stops * 11);
}

/** Subtract the pickup lead time from a HH:MM start, for the "leave by" line. */
function leaveBy(time: string, leadMinutes = 35): string {
  const [h, m] = time.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return time;
  const d = new Date();
  d.setHours(h, m - leadMinutes, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

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
  const countdown = next ? startsIn(next.time) : null;

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
                {new Date().toLocaleDateString('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}{' '}
                · {bookings.length} confirmed · {planned.length} suggested
              </p>
            </div>
            {next ? (
              <div className="trips__countdown">
                <p className="t-micro trips__countdown-label">
                  {countdown ? 'STARTS IN' : 'STARTS AT'}
                </p>
                <p className="t-amount-sm c-on-dark">{countdown ?? next.time}</p>
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
              <p className="t-micro c-urgent next-up__leave">
                Leave by {leaveBy(next.time)}
                {experienceById(next.experienceId)?.pickupInfo ? ' · pickup at hotel lobby' : ''}
              </p>
              <p className="t-micro c-faint">Reference {next.reference}</p>
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
        <SectionHeader title="Day timeline" action="Edit day" onAction={() => navigate('/irie')} />
        <ol className="timeline">
          {bookings.map((b, idx) => {
            const e = experienceById(b.experienceId);
            const nextBooking = bookings[idx + 1];
            const nextE = nextBooking ? experienceById(nextBooking.experienceId) : undefined;
            const hop = nextBooking ? transitNote(e, nextE) : null;
            return (
              <li key={b.id} className="timeline__item">
                <span className={`timeline__dot timeline__dot--${dotTone(e)}`} />
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
                      <h3 className="t-card-title timeline__title">{e?.title ?? 'Booking'}</h3>
                      <div className="timeline__tags">
                        <Badge tone="aqua">Confirmed · {formatUsd(b.totalMinor)}</Badge>
                        {b.voucherId ? <Badge tone="sand">Voucher attached</Badge> : null}
                      </div>
                    </div>
                  </div>
                </Card>
                {hop ? (
                  <div className="timeline__connector">
                    <Icon name={hop.icon} size={13} color="var(--ink-faint)" />
                    <span className="t-micro timeline__connector-text">{hop.text}</span>
                  </div>
                ) : null}
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
                    <h3 className="t-card-title timeline__title">{e.title}</h3>
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

      <section className="pad trips__summary">
        <div className="trips__route" aria-hidden="true">
          <span className="trips__route-road" />
          <span className="trips__route-stop trips__route-stop--0" />
          <span className="trips__route-stop trips__route-stop--1" />
          <span className="trips__route-stop trips__route-stop--2" />
          <span className="trips__route-label t-micro-strong">Route · {routeKm(bookings.length)} km</span>
        </div>

        <div className="trips__summary-rows">
          <div className="row trips__summary-row">
            <span className="t-caption c-muted grow">Estimated day total</span>
            <span className="t-amount-sm c-brand">{formatUsd(dayTotalMinor)}</span>
          </div>
          <div className="row trips__summary-row">
            <span className="t-caption c-muted grow">Ticket wallet</span>
            <span className="t-caption-strong c-locator">
              {bookings.length} {bookings.length === 1 ? 'pass' : 'passes'}
            </span>
          </div>
        </div>
      </section>

      <div className="pad">
        <button type="button" className="trips__ask" onClick={() => navigate('/irie')}>
          <Icon name="sparkle" size={18} color="var(--gold-light)" />
          <span className="grow t-caption-strong">Need to adjust your day? Ask Irie AI.</span>
          <Icon name="chevron-right" size={16} color="var(--gold-light)" strokeWidth={2.2} />
        </button>
      </div>

    </main>
  );
}
