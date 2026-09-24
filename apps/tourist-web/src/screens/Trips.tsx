import { useNavigate } from 'react-router-dom';
import {
  destinationBySlug,
  experienceById,
  experiencesFor,
  heroUrl,
  islandById,
  type DemoExperience,
} from '../data/catalogue';
import { useStore } from '../state/store';
import { describeDay, isoOf, tripDay } from '../data/day';
import { Badge, Card, Photo, SectionHeader, formatUsd } from '../components/kit';
import { Icon } from '../components/Icon';
import { QR } from '../components/QR';
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

  /*
   * One day, not every booking.
   *
   * This screen is written as a day — one timeline, one total, a countdown and a "leave by". It
   * used to list every confirmed booking on the island under a header printing `new Date()`, so a
   * Thursday booking sat below a Wednesday date with a "leave by" time that implied today. The day
   * being shown is now derived, in `data/day.ts`, and every figure below is scoped to it.
   */
  const today = isoOf(new Date());
  const day = tripDay(
    state.bookings.filter((b) => b.status === 'confirmed' && b.islandId === state.islandId),
    today,
  );
  const bookings = day.bookings;

  const planned = state.plannedExperienceIds
    .map((id) => experienceById(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e) && e!.islandId === state.islandId);

  const dayTotalMinor = bookings.reduce((sum, b) => sum + b.totalMinor, 0);

  /**
   * What the suggested stops would add, kept *separate* from the booked total.
   *
   * The booked total sums the `totalMinor` each booking was confirmed at and is
   * never recomputed — that is what keeps this screen identical to checkout and
   * confirmation, and it must stay true. So a suggestion's price is not folded
   * into it. It is shown on its own line, as a "from" figure, because a plan
   * showing a suggested stop priced at US$65 above a total reading US$0 is a
   * screen that looks broken even though both numbers are correct.
   */
  const plannedFromMinor = planned.reduce((sum, e) => sum + e.fromAmountMinor, 0);
  const next = bookings[0];
  /*
   * A countdown only means something today. "STARTS IN 2h 15m" against tomorrow's departure is off
   * by a day, and `startsIn` builds its comparison from the current date — so it is asked the
   * question only when the answer can be right.
   */
  const countdown = next && day.isToday ? startsIn(next.time) : null;

  if (!island || !destination) return null;

  if (bookings.length === 0 && planned.length === 0) {
    /*
     * The empty day.
     *
     * This was a calendar glyph, a line of grey copy and a lone "Ask Irie AI"
     * button on a screen's worth of blank ivory — Ro's note was that it is "not
     * encouraging enough to book something", and he is right about why: it was
     * a *dialog box*. It described the absence and then asked the guest to go
     * somewhere else and solve it.
     *
     * An empty plan is the best sales position in the app. The guest has opened
     * the tab for their day, which means they want one. So this screen now
     * answers the question instead of asking it: the three highest-rated things
     * within reach, priced, with the walk, ready to open. Irie stays, but as
     * the second option rather than the only one.
     *
     * Ranked by rating rather than distance, because with nothing booked there
     * is no itinerary for a stop to be near — the only useful sort is "what is
     * the best thing here".
     */
    const starters = experiencesFor(state.islandId)
      .slice()
      .sort((a, b) => b.ratingAverage - a.ratingAverage)
      .slice(0, 3);

    return (
      <main className="screen trips">
        <header className={`trips__head ${starters[0] ? '' : 'trips__head--bare'}`}>
          {/* The header borrows the top-rated listing's own photograph. If the
              island somehow has no inventory the header falls back to the bare
              green variant rather than to a broken image — a cast to keep the
              markup uniform would have shipped a 404 on the one screen where
              the app is supposed to look most sure of itself. */}
          {starters[0] ? (
            <>
              <img
                src={heroUrl(starters[0])}
                alt=""
                className="trips__head-photo"
              />
              <span className="trips__scrim" />
            </>
          ) : null}
          <div className="trips__head-body">
            <p className="t-overline trips__brand">Caribbean VIP · {island.in_app_brand}</p>
            <h1 className="t-display-md c-on-dark">Your {destination.name} Day</h1>
            <p className="t-caption trips__weather">
              Nothing booked yet — here is where most people start.
            </p>
          </div>
        </header>

        <section className="pad trips__starters">
          <SectionHeader title={`Best of ${destination.name}`} note="Top rated" />
          {starters.map((e) => (
            <Card
              key={e.id}
              className="starter"
              onClick={() => navigate(`/experience/${e.id}`)}
            >
              <div className="row starter__row">
                <Photo
                  src={heroUrl(e)}
                  mediaKey={e.media[0]}
                  alt=""
                  ratio="1 / 1"
                  radius="var(--r-md)"
                  className="starter__photo"
                />
                <div className="grow">
                  <h3 className="t-card-title starter__title">{e.title}</h3>
                  <p className="t-micro c-locator starter__meta">
                    {e.durationMinutes >= 60
                      ? `${Math.round(e.durationMinutes / 60)} hr`
                      : `${e.durationMinutes} min`}
                    {e.pickupInfo ? ' · hotel pickup' : ''}
                  </p>
                  <div className="starter__foot">
                    <span className="t-amount-sm c-brand">{formatUsd(e.fromAmountMinor)}</span>
                    <span className="starter__rating t-micro-strong">
                      <Icon name="star" size={12} color="var(--gold)" />
                      {e.ratingAverage.toFixed(1)}
                    </span>
                  </div>
                </div>
                <Icon name="chevron-right" size={18} color="var(--ink-faint)" strokeWidth={2.2} />
              </div>
            </Card>
          ))}
        </section>

        <div className="pad">
          <button type="button" className="trips__ask" onClick={() => navigate('/irie')}>
            <Icon name="sparkle" size={18} color="var(--gold-light)" />
            <span className="grow t-caption-strong">
              Or let Irie AI build the whole day for you
            </span>
            <Icon name="chevron-right" size={16} color="var(--gold-light)" strokeWidth={2.2} />
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen trips">
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
                {describeDay(day.iso, today)} · {bookings.length} confirmed ·{' '}
                {planned.length} suggested
                {day.otherDays.length > 0
                  ? ` · ${day.otherDays.length} on other days`
                  : ''}
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
              {/* The day is named whenever it is not today. "Leave by 12:55 PM" in urgent coral
                  is a call to action for the next hour; against tomorrow's departure it is the app
                  telling the guest to leave for something that has not come round yet. */}
              <p className={`t-micro next-up__leave ${day.isToday ? 'c-urgent' : 'c-faint'}`}>
                Leave by {leaveBy(next.time)}
                {day.isToday ? '' : ` ${describeDay(day.iso, today).toLowerCase()}`}
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

        {/*
          * The day total, as a dark green bar.
          *
          * This was two pale ivory rows on an ivory ground, which put the one
          * number the screen exists to total at the same visual weight as the
          * hairlines around it. Reversed out of brand green with a gold-outlined
          * action, it reads as the foot of a bill — which is what it is.
          */}
        <div className="trips__total">
          <div className="grow">
            <p className="t-micro trips__total-label">
              {bookings.length > 0 ? 'Your day total' : 'Nothing booked yet'}
            </p>
            <p className="t-amount c-on-dark trips__total-amount">{formatUsd(dayTotalMinor)}</p>
            <p className="t-micro trips__total-count">
              {bookings.length} booked
              {planned.length > 0
                ? ` · ${planned.length} suggested, from ${formatUsd(plannedFromMinor)}`
                : ''}
            </p>
          </div>
          <button
            type="button"
            className="trips__total-cta t-caption-strong"
            onClick={() => navigate(next ? `/ticket/${next.id}` : '/profile')}
          >
            View details
          </button>
        </div>
      </section>

      {/*
        * The VIP pass.
        *
        * The reference board draws one pass for the whole day. This shows the
        * *next booking's own* ticket instead, because a single day-pass QR is a
        * credential no vendor scanner can verify — and the one claim this
        * product cannot fake is that the code on the screen scans. So the card
        * looks like the board's and encodes something real; when there is
        * nothing confirmed it does not appear at all.
        */}
      {next ? (
        <section className="pad">
          <button
            type="button"
            className="vip-pass"
            onClick={() => navigate(`/ticket/${next.id}`)}
          >
            <span className="vip-pass__crest" aria-hidden="true">
              <span className="vip-pass__crest-word">VIP</span>
              <span className="vip-pass__crest-rule" />
              <span className="vip-pass__crest-sub">{island.code}</span>
            </span>
            <span className="vip-pass__body">
              <span className="t-caption-strong vip-pass__title">Your VIP Pass</span>
              <span className="t-micro vip-pass__note">
                Show at {experienceById(next.experienceId)?.title ?? 'your next stop'}
              </span>
              <span className="t-micro vip-pass__ref">
                {bookings.length > 1
                  ? `Next of ${bookings.length} · tap for the full ticket`
                  : 'Tap to view the full ticket'}
              </span>
            </span>
            <span className="vip-pass__qr" aria-hidden="true">
              <QR value={next.ticketToken} size={62} />
            </span>
          </button>
        </section>
      ) : null}

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
