import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  byDistanceFrom,
  destinationBySlug,
  experienceById,
  experiencesFor,
  heroUrl,
  islandById,
  simulatedPosition,
  travelFrom,
  formatKm,
  DEFAULT_PARTY,
  seatsIn,
  type DemoExperience,
  type PartySelection,
} from '../data/catalogue';
import { isoDate } from '../data/availability';
import {
  ITINERARY_SHAPES,
  buildSoonestDay,
  formatClock,
  formatSpan,
  shapeById,
  type ClashResolution,
  type Itinerary,
  type ItineraryShape,
  type ItineraryStop,
} from '../data/itinerary';
import { useStore } from '../state/store';
import { Icon, type IconName } from '../components/Icon';
import { PalmFronds } from '../components/PalmFronds';
import { Badge, Photo, Price, Stepper, formatUsd, type BadgeTone } from '../components/kit';
import './Irie.css';

/**
 * Irie AI — the concierge.
 *
 * **There is no language model behind this.** Every answer is matched by rule over the same
 * catalogue the rest of the app reads, which is why it cannot name a listing that does not exist
 * or invent a price: it has no vocabulary of its own. The header says GUIDED DEMO every time the
 * tab is opened, and that label is not decoration — this screen is the one an audience is most
 * likely to mistake for something it is not, and the source design has no such label on it.
 *
 * When a real model lands it goes *in front* of this, and this stays behind it as the documented
 * "falls back to normal search" path.
 *
 * ## Two kinds of answer
 *
 * A **pick** turn answers a question with two listings and a stated reason for each. A **day** turn
 * composes a whole itinerary — timed stops, the travel between them, and a running estimate — in
 * `data/itinerary.ts`. The day turn is what makes this tab read as a product rather than a chatbot,
 * and it is the half that is unit tested, because all of its judgement lives in that pure module
 * rather than in this file.
 *
 * A day turn stores its *request*, not its result, and rebuilds on every render. That is deliberate:
 * booking one of the stops, or adding the day to the plan, changes the answer, and a transcript
 * showing a stale day beside a Trips screen that disagrees with it is worse than no transcript.
 */

// ---------------------------------------------------------------------------
// Pick turns
// ---------------------------------------------------------------------------

interface Intent {
  chip: string;
  reply: string;
  categories: string[];
  maxMinor?: number;
  reason: (e: DemoExperience, metres: number) => string;
  /**
   * The row's glyph and its colour.
   *
   * These were unadorned text pills, which on a dark ground reads as a wall of
   * grey lozenges — the concierge's opening move looked like a tag cloud.
   *
   * The first fix put each glyph in a filled tile of its own jewel tone. That
   * was backwards, and Ro called it: it puts the colour in the container and
   * drains the glyph to white, which is how a settings list is built, not a
   * concierge. The colour belongs in the *glyph*, on a row that barely exists.
   * Restraint in the container, expression in the mark.
   *
   * So these are light, warm hues meant to sit on near-black green — not the
   * dark jewel tones the category tiles use, which are chosen to carry white
   * type on top of them and would disappear here.
   */
  icon: IconName;
  color: string;
}

/** Which glyph stands for which shape of day. Keyed by `ItineraryShape.id`. */
const SHAPE_ICONS: Record<string, IconName> = {
  'full-day': 'sun',
  afternoon: 'sun',
  evening: 'moon',
};

const INTENTS: Intent[] = [
  {
    chip: 'Something under $50',
    icon: 'price-tag',
    color: '#E3C271',
    reply: 'Here is what I can find under US$50 per person nearby.',
    categories: [],
    maxMinor: 5000,
    reason: (e) => `US$${Math.round(e.fromAmountMinor / 100)} per adult — the best value close by.`,
  },
  {
    chip: 'Quiet beach nearby',
    icon: 'beach',
    color: '#5AC8D8',
    reply: 'These stay calm even when the cruise ships are in.',
    categories: ['beaches', 'water_sports'],
    reason: (_e, m) => `${formatKm(m)} out, so it misses the port crowds.`,
  },
  {
    chip: 'Dinner with a view',
    icon: 'wine',
    color: '#E2674A',
    reply: 'Somewhere to end the day.',
    categories: ['food', 'nightlife'],
    reason: () => 'Good at sunset, and it takes a same-day table.',
  },
  {
    chip: 'Family activity',
    icon: 'family',
    color: '#E884A8',
    reply: 'These work well with children along.',
    categories: ['family', 'beaches', 'adventure'],
    reason: () => 'Suits mixed ages, and there is shade.',
  },
  {
    chip: 'Rainy-day option',
    icon: 'umbrella',
    color: '#8FB8E0',
    reply: 'Mostly indoors, or fine whatever the weather does.',
    categories: ['culture', 'food'],
    reason: () => 'Indoors and shaded — good after a hot morning.',
  },
];

type Turn =
  | {
      id: string;
      kind: 'picks';
      question: string;
      reply: string;
      picks: { experience: DemoExperience; metres: number; reason: string }[];
    }
  | {
      id: string;
      kind: 'day';
      question: string;
      shapeId: ItineraryShape['id'];
      party: PartySelection;
      /** The listing the guest arrived from, placed before the day is fitted around it. */
      anchorExperienceId?: string;
    };

/** Today, local, matching `availability.ts` — never a UTC date, which drifts by a day after 8pm. */
function todayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return isoDate(d);
}

export function Irie() {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [turns, setTurns] = useState<Turn[]>([]);

  const island = islandById(state.islandId);
  const destination = destinationBySlug(state.destinationSlug);

  const ranked = useMemo(() => {
    if (!destination) return [];
    return byDistanceFrom(simulatedPosition(destination), experiencesFor(state.islandId));
  }, [state.islandId, destination]);

  /**
   * "Ask Irie" on the experience detail page hands the listing over in router state.
   *
   * It is consumed once and then cleared, because a browser Back onto this tab must not silently
   * re-ask a question the guest did not ask again. `replace` keeps it out of the history stack.
   */
  const askAbout = (location.state as { askIrieAbout?: string } | null)?.askIrieAbout;
  /**
   * Clearing the router state is not enough on its own to make this run once.
   *
   * StrictMode invokes an effect twice in development, and both invocations read the same
   * `askAbout` before the clearing `navigate` has re-rendered — which posted the question, and the
   * whole itinerary under it, twice. The ref is the thing that actually makes consumption
   * single-shot; the `navigate` still matters, because it stops a browser Back onto this tab
   * re-asking a question the guest did not ask again.
   */
  const consumedAsk = useRef<string | null>(null);
  useEffect(() => {
    if (!askAbout || consumedAsk.current === askAbout) return;
    consumedAsk.current = askAbout;
    const experience = experienceById(askAbout);
    navigate(location.pathname, { replace: true, state: null });
    if (!experience) return;
    setTurns((t) => [
      {
        id: `${Date.now()}`,
        kind: 'day',
        question: `Would ${experience.title} fit my day?`,
        shapeId: 'full-day',
        party: DEFAULT_PARTY,
        anchorExperienceId: experience.id,
      },
      ...t,
    ]);
  }, [askAbout, navigate, location.pathname]);

  /** Newest turn is prepended, so the screen has to follow it up rather than down. */
  const latestTurnRef = useRef<HTMLElement>(null);
  const latestTurnId = turns[0]?.id;
  useEffect(() => {
    if (!latestTurnId) return;
    latestTurnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [latestTurnId]);

  const ask = (intent: Intent) => {
    let pool = ranked;
    if (intent.categories.length > 0) {
      const hits = pool.filter((r) => intent.categories.includes(r.experience.category));
      // Falling back to the unfiltered list rather than answering with nothing: an empty answer to
      // a chip the app itself offered is a dead end the guest cannot get out of.
      if (hits.length > 0) pool = hits;
    }
    if (intent.maxMinor !== undefined) {
      const affordable = pool.filter((r) => r.experience.fromAmountMinor <= intent.maxMinor!);
      if (affordable.length > 0) pool = affordable;
    }
    const picks = pool.slice(0, 2).map(({ experience, metres }) => ({
      experience,
      metres,
      reason: intent.reason(experience, metres),
    }));
    setTurns((t) => [
      { id: `${Date.now()}`, kind: 'picks', question: intent.chip, reply: intent.reply, picks },
      ...t,
    ]);
  };

  const askForDay = (shape: ItineraryShape) => {
    setTurns((t) => [
      { id: `${Date.now()}`, kind: 'day', question: shape.chip, shapeId: shape.id, party: DEFAULT_PARTY },
      ...t,
    ]);
  };

  const setParty = (turnId: string, party: PartySelection) => {
    setTurns((t) => t.map((turn) => (turn.id === turnId && turn.kind === 'day' ? { ...turn, party } : turn)));
  };

  if (!island || !destination) return null;

  const planned = state.plannedExperienceIds.length;

  return (
    <main className="screen screen--deep irie">
      {/* Drawn, not photographed — see PalmFronds for why. It is the first child
          so everything else stacks above it without a z-index on each one. */}
      <PalmFronds className="irie__fronds" />
      {/* The second, cooler cluster low on the left — the screen's foliage used
          to stop at the header and leave the rest of a long scroll empty. */}
      <PalmFronds className="irie__fronds irie__fronds--low" variant="understory" />
      {/* This one scrolls with the document rather than being pinned to the
          viewport, so something actually arrives as you read down. */}
      <PalmFronds className="irie__fronds irie__fronds--mid" variant="understory" />

      <header className="irie__head">
        {/* The mark reads left to right as a name, then its spark, then its
            role — the reference board's order. The sparkle trailed the name
            there for a reason: leading with it makes the glyph the subject and
            the name its caption. */}
        <div className="irie__brand">
          <span className="irie__name">Irie AI</span>
          {/* Larger and breathing — the one thing on the header that says the
              concierge is awake rather than a static title. */}
          <span className="irie__spark" aria-hidden="true">
            <Icon name="sparkle" size={24} color="var(--gold-light)" />
          </span>
          <span className="irie__tag t-micro">CONCIERGE</span>
        </div>
        {turns.length > 0 ? (
          <button type="button" className="irie__reset" onClick={() => setTurns([])} aria-label="Start over">
            <Icon name="refresh" size={18} color="rgba(251,246,236,0.7)" />
          </button>
        ) : null}
      </header>

      <section className="irie__intro">
        <h1 className="t-display irie__hello">Wah Gwaan!</h1>
        {/*
          * Two sentences, two sizes.
          *
          * These were one 16px paragraph, which gave a statement of identity and
          * an open question the same weight and let them run together into a
          * single grey block. Split, the introduction carries and the question
          * invites — which is the order the rows beneath it answer in.
          */}
        <p className="irie__lead">I&rsquo;m Irie AI, your Caribbean concierge.</p>
        <p className="irie__ask">How can I make your day extraordinary?</p>
        <span className="irie__rule" aria-hidden="true" />

        {/* Context chips make the reasoning visible before a word is typed. Each one is real state:
            the island, the catalogue size, the wallet, the day plan. */}
        <div className="irie__context">
          <span className="ctx">{destination.name}</span>
          <span className="ctx">{ranked.length} experiences nearby</span>
          <span className="ctx">{state.bookings.filter((b) => b.status === 'confirmed').length} booked</span>
          {planned > 0 ? <span className="ctx">{planned} planned</span> : null}
          <span className="ctx">
            {state.vouchers.length} {state.vouchers.length === 1 ? 'voucher' : 'vouchers'}
          </span>
        </div>
      </section>

      {/* The builder leads, because composing a day is the thing this tab does that a search box
          cannot. The narrower question chips follow it. */}
      <section className="irie__builder">
        <p className="t-micro-strong irie__builder-label">BUILD ME A DAY</p>
        <div className="irie__chips irie__chips--builder">
          {ITINERARY_SHAPES.map((shape) => (
            <button
              key={shape.id}
              type="button"
              className="irie-chip irie-chip--gold"
              onClick={() => askForDay(shape)}
            >
              {/* The glyph says which part of the day it builds. A sparkle on
                  all three said only "this is the AI one", which the whole
                  screen already says. */}
              <Icon
                name={SHAPE_ICONS[shape.id] ?? 'sparkle'}
                size={15}
                color="var(--gold-light)"
                strokeWidth={1.8}
              />
              {shape.chip}
            </button>
          ))}
        </div>
      </section>

      <div className="irie__intents">
        {INTENTS.map((i) => (
          <button
            key={i.chip}
            type="button"
            className="irie-intent"
            onClick={() => ask(i)}
            style={{ '--intent-color': i.color } as CSSProperties}
          >
            <span className="irie-intent__icon" aria-hidden="true">
              <Icon name={i.icon} size={22} strokeWidth={1.75} color={i.color} />
            </span>
            <span className="irie-intent__label">{i.chip}</span>
            <Icon name="chevron-right" size={16} color="rgba(251,246,236,0.5)" />
          </button>
        ))}
      </div>

      {turns.map((turn, i) => (
        <section key={turn.id} className="irie__turn" ref={i === 0 ? latestTurnRef : undefined}>
          <p className="irie__question">{turn.question}</p>
          <div className="irie__answer">
            {turn.kind === 'picks' ? (
              <PicksAnswer
                reply={turn.reply}
                picks={turn.picks}
                plannedIds={state.plannedExperienceIds}
                onOpen={(id) => navigate(`/experience/${id}`)}
                onTogglePlan={(id, isPlanned) =>
                  dispatch(
                    isPlanned
                      ? { type: 'unplanExperience', experienceId: id }
                      : { type: 'planExperience', experienceId: id },
                  )
                }
              />
            ) : (
              <DayAnswer
                turn={turn}
                onParty={(party) => setParty(turn.id, party)}
                onOpen={(id) => navigate(`/experience/${id}`)}
                onSeeTrips={() => navigate('/trips')}
              />
            )}
          </div>
        </section>
      ))}

      {/*
        Something real under the chips.
        A wall of buttons over empty space reads as a menu rather than a concierge, and the guest
        has no way to tell whether there is anything behind it. Three live listings, nearest first,
        answer that before a word is typed — and they are the same rows the chips would return.
      */}
      {turns.length === 0 && ranked.length > 0 ? (
        <section className="irie__popular">
          <p className="irie__ideas-label">
            <Icon name="sparkle" size={14} color="var(--gold-light)" />
            Here are some ideas for you
          </p>
          <div className="irie__pop-rail">
            {ranked.slice(0, 3).map(({ experience, metres }) => (
              <button
                key={experience.id}
                type="button"
                className="pop-card"
                onClick={() => navigate(`/experience/${experience.id}`)}
              >
                <Photo
                  src={heroUrl(experience)}
                  mediaKey={experience.media[0]}
                  alt=""
                  ratio="150 / 92"
                  radius="0"
                />
                <span className="pop-card__body">
                  <span className="pop-card__title">{experience.title}</span>
                  <span className="pop-card__meta">
                    {formatKm(metres)} · {travelFrom(metres).minutes} min
                  </span>
                  {/* Price and rating on one line, the way the reference board
                      foots its cards. The rating was missing entirely, and it is
                      the number that decides a tap on a rail like this one. */}
                  <span className="pop-card__foot">
                    <span className="pop-card__price">
                      {formatUsd(experience.fromAmountMinor)}
                    </span>
                    <span className="pop-card__rating">
                      <Icon name="star" size={11} color="var(--gold-light)" />
                      {experience.ratingAverage.toFixed(1)}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {turns.length === 0 ? (
        <p className="irie__hint t-caption">
          Tap a suggestion above — every answer is built from what is bookable near you right now.
        </p>
      ) : null}

    </main>
  );
}

// ---------------------------------------------------------------------------
// Pick answers
// ---------------------------------------------------------------------------

function PicksAnswer({
  reply,
  picks,
  plannedIds,
  onOpen,
  onTogglePlan,
}: {
  reply: string;
  picks: { experience: DemoExperience; metres: number; reason: string }[];
  plannedIds: string[];
  onOpen: (id: string) => void;
  onTogglePlan: (id: string, isPlanned: boolean) => void;
}) {
  return (
    <>
      <p className="t-caption-strong">{reply}</p>
      <div className="col irie__picks">
        {picks.map(({ experience, metres, reason }) => {
          const isPlanned = plannedIds.includes(experience.id);
          return (
            <article key={experience.id} className="irie-pick">
              <Photo
                src={heroUrl(experience)}
                mediaKey={experience.media[0]}
                alt={experience.title}
                ratio="1 / 1"
                radius="var(--r-md)"
                className="irie-pick__photo"
              />
              <div className="grow">
                <button
                  type="button"
                  className="irie-pick__open t-caption-strong"
                  onClick={() => onOpen(experience.id)}
                >
                  {experience.title}
                </button>
                <p className="t-micro c-locator irie-pick__meta">
                  {`US$${Math.round(experience.fromAmountMinor / 100)}`} · {formatKm(metres)} ·{' '}
                  {travelFrom(metres).minutes} min {travelFrom(metres).mode}
                </p>
                {/* The stated reason is the point: an answer a guest can check beats one they
                    have to trust. */}
                <p className="t-micro c-muted irie-pick__reason">{reason}</p>
                <div className="irie-pick__actions">
                  <button
                    type="button"
                    className="badge badge--brand irie-pick__btn"
                    onClick={() => onTogglePlan(experience.id, isPlanned)}
                  >
                    {isPlanned ? 'Remove from day' : 'Add to Trip'}
                  </button>
                  <Badge tone="aqua">
                    <Price minor={experience.fromAmountMinor} />
                  </Badge>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Day answers — the itinerary builder
// ---------------------------------------------------------------------------

function DayAnswer({
  turn,
  onParty,
  onOpen,
  onSeeTrips,
}: {
  turn: Extract<Turn, { kind: 'day' }>;
  onParty: (party: PartySelection) => void;
  onOpen: (id: string) => void;
  onSeeTrips: () => void;
}) {
  const { state, dispatch } = useStore();
  const shape = shapeById(turn.shapeId);
  const destination = destinationBySlug(state.destinationSlug);

  /**
   * Rebuilt from live state on every render, so booking a stop or adding the day to the plan is
   * reflected in the answer rather than leaving a stale transcript beside a Trips screen that
   * disagrees with it.
   */
  const day: Itinerary | null = useMemo(() => {
    if (!shape || !destination) return null;
    return buildSoonestDay(
      {
        shape,
        islandId: state.islandId,
        destination,
        party: turn.party,
        bookings: state.bookings
          .filter((b) => b.status === 'confirmed' && b.islandId === state.islandId)
          .map((b) => ({ ...b, seats: seatsIn(b.party) })),
        plannedExperienceIds: state.plannedExperienceIds,
        anchorExperienceId: turn.anchorExperienceId,
      },
      todayISO(),
    );
  }, [shape, destination, state.islandId, state.bookings, state.plannedExperienceIds, turn.party, turn.anchorExperienceId]);

  /**
   * Applies a proposed departure to the booking behind a clashing stop.
   *
   * The day rebuilds from live state on every render, so the timeline, the total and the clash
   * count all follow from this one dispatch — there is no second copy of the answer to keep in
   * step with it.
   */
  const moveBooking = (stop: ItineraryStop, resolution: ClashResolution) => {
    const booking = state.bookings.find(
      (b) =>
        b.status === 'confirmed' &&
        b.experienceId === stop.experience.id &&
        b.dateISO === day?.dateISO &&
        b.time === stop.time,
    );
    if (!booking) return;
    dispatch({
      type: 'rescheduleBooking',
      bookingId: booking.id,
      dateISO: resolution.dateISO,
      time: resolution.time,
    });
  };

  if (!day || !shape) return null;

  const anchor = turn.anchorExperienceId ? experienceById(turn.anchorExperienceId) : undefined;
  const anchorPlaced = anchor ? day.stops.some((s) => s.experience.id === anchor.id) : false;
  const unplanned = day.addableExperienceIds.filter((id) => !state.plannedExperienceIds.includes(id));

  if (day.stops.length === 0) {
    return (
      <>
        <p className="t-caption-strong">{shape.reply}</p>
        <p className="t-caption c-muted day__none">
          Nothing within reach has a departure left that fits {shape.title.toLowerCase()} in the next few
          days. Try a different island or a wider window.
        </p>
      </>
    );
  }

  return (
    <>
      {/*
        A day with a clash in it must not be introduced as one that flows. The bookings are the
        guest's own and are all still shown — but the headline leads with the problem, because that
        is the thing they need to act on and the rest of the screen is unchanged by it.
      */}
      <p className="t-caption-strong">
        {day.clashCount > 0
          ? `${day.clashCount === 1 ? 'One booking does' : `${day.clashCount} bookings do`} not fit around the rest of your day. I have left everything here and marked what clashes.`
          : anchor
            ? anchorPlaced
              ? `Yes — ${anchor.title} fits, and here is the day around it.`
              : `${anchor.title} has no departure that fits, so here is the day without it.`
            : shape.reply}
      </p>

      <div className="day__summary">
        <span className="t-micro-strong c-locator">
          {day.stops.length} stop{day.stops.length === 1 ? '' : 's'} · {formatSpan(day.stops)}
        </span>
        <span className="t-micro c-muted">{whenLabel(day.dateISO)}</span>
      </div>

      {/* Party size drives every quote below it, so it sits above the total rather than beside it. */}
      <div className="day__party">
        <Stepper
          label="Guests"
          sub="Re-prices every stop"
          value={seatsIn(turn.party)}
          min={1}
          max={12}
          onChange={(next) => onParty({ ...turn.party, adults: next, children: 0 })}
        />
      </div>

      <ol className="day__timeline">
        {day.stops.map((stop) => (
          <li key={stop.experience.id} className="day__item">
            {stop.arriveFrom || stop.clash ? (
              <Leg stop={stop} onMove={(r) => moveBooking(stop, r)} />
            ) : null}
            {/* The dot is positioned against the card, not the list item — a leg above it would
                otherwise push it up the rail and leave it labelling the transfer instead of the stop. */}
            <div className="day__row">
              <span className={`day__dot day__dot--${stop.state} ${stop.clash ? 'day__dot--clash' : ''}`} />
              <button type="button" className="day__card" onClick={() => onOpen(stop.experience.id)}>
                <Photo
                  src={heroUrl(stop.experience)}
                  mediaKey={stop.experience.media[0]}
                  alt=""
                  ratio="1 / 1"
                  radius="var(--r-sm)"
                  className="day__photo"
                />
                <span className="grow day__card-body">
                  <span className="t-micro-strong c-locator day__time">{formatClock(stop.startMinutes)}</span>
                  <span className="t-caption-strong day__title">{stop.experience.title}</span>
                  <span className="day__tags">
                    <StopBadge stop={stop} />
                  </span>
                </span>
              </button>
            </div>
          </li>
        ))}
      </ol>

      {day.stops.length < day.stopsWanted ? (
        // Stated rather than silently under-delivered: the builder refuses to pretend that a listing
        // 130 km away can join a morning here, and a guest who asked for a full day deserves to know
        // that is the reason they got three stops.
        <p className="t-micro c-muted day__short">
          {day.stops.length} of a possible {day.stopsWanted} — nothing else nearby has a departure that
          fits the time left.
        </p>
      ) : null}

      <div className="day__total">
        <span className="grow">
          <span className="t-caption c-muted">Estimated total</span>
          {day.routeMetres > 0 ? (
            <span className="t-micro c-faint day__route">Route · {formatKm(day.routeMetres)}</span>
          ) : null}
        </span>
        <span className="t-amount c-brand">
          {day.unquotedCount > 0 ? 'from ' : ''}
          {formatUsd(day.totalMinor)}
        </span>
      </div>

      {day.unquotedCount > 0 ? (
        <p className="t-micro c-urgent day__caveat">
          {day.unquotedCount} stop{day.unquotedCount === 1 ? '' : 's'} could not be priced for this party,
          so the total is a floor rather than a quote.
        </p>
      ) : null}

      <div className="day__actions">
        {unplanned.length > 0 ? (
          <button
            type="button"
            className="btn btn--primary btn--full day__add"
            onClick={() => {
              for (const id of unplanned) dispatch({ type: 'planExperience', experienceId: id });
            }}
          >
            Add {unplanned.length === day.stops.length ? 'this day' : `${unplanned.length} more`} to my trip
          </button>
        ) : (
          <button type="button" className="btn btn--secondary btn--full" onClick={onSeeTrips}>
            See it on Trips
          </button>
        )}
      </div>

      <p className="t-micro c-faint day__note">
        Adding a stop plans it — nothing is booked or paid for until you check out.
      </p>
    </>
  );
}

/**
 * The transfer between two stops — or the fact that there is not one, or that it cannot be made.
 *
 * A clash replaces the leg rather than sitting beside it: "127 min drive" above a stop the guest
 * cannot reach in time is not extra detail, it is the misleading half of the same sentence.
 */
function Leg({ stop, onMove }: { stop: ItineraryStop; onMove: (r: ClashResolution) => void }) {
  if (stop.clash) {
    const { resolution } = stop.clash;
    return (
      <div className="day__clash">
        <span className="day__leg day__leg--clash t-micro">
          <Icon name="clock" size={12} color="var(--coral-text)" strokeWidth={2} />
          {stop.clash.kind === 'overlap'
            ? `Runs over ${stop.clash.withTitle} — ${durationLabel(stop.clash.shortfallMinutes)} short`
            : `Not enough time from ${stop.clash.withTitle} — ${durationLabel(stop.clash.shortfallMinutes)} short`}
        </span>
        {/*
          The fix, not just the fault. Naming a collision and stopping there hands the guest a
          puzzle; the departure that clears it is the thing they actually wanted. When nothing
          does, that is said plainly — two bookings an island apart at the same hour cannot be
          reconciled by moving either one, and a button that pretended otherwise would be worse
          than the collision.
        */}
        {resolution ? (
          <button type="button" className="day__fix" onClick={() => onMove(resolution)}>
            <Icon name="sparkle" size={13} color="var(--gold-light)" />
            <span className="day__fix-text">
              {resolution.kind === 'later-slot'
                ? `The ${formatClock(resolution.startMinutes)} departure clears this`
                : `${whenLabel(resolution.dateISO)} at ${formatClock(resolution.startMinutes)} clears this`}
            </span>
            <span className="day__fix-go t-micro-strong">Move</span>
          </button>
        ) : (
          <span className="day__fix day__fix--none t-micro">
            Nothing else available has room — this one would have to be cancelled.
          </span>
        )}
      </div>
    );
  }
  const arrival = stop.arriveFrom!;
  if (arrival.kind === 'same-site') {
    return (
      <span className="day__leg t-micro">
        <Icon name="pin" size={12} color="var(--ink-faint)" strokeWidth={2} />
        Same site — no transfer
      </span>
    );
  }
  return (
    <span className="day__leg t-micro">
      <Icon name={arrival.mode === 'walk' ? 'walk' : 'car'} size={12} color="var(--ink-faint)" strokeWidth={2} />
      {arrival.minutes} min {arrival.mode} · {formatKm(arrival.metres)}
    </span>
  );
}

/** "45 min" / "2 hr 10 min" — a shortfall of 374 minutes means nothing read as a number of minutes. */
function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function StopBadge({ stop }: { stop: ItineraryStop }) {
  if (stop.state === 'confirmed') {
    return <Badge tone="aqua">Confirmed · {formatUsd(stop.estimateMinor ?? 0)}</Badge>;
  }
  if (stop.estimateMinor === null) {
    return <Badge tone="coral">{stop.quoteNote ?? 'No price for this party'}</Badge>;
  }
  const label = stop.state === 'planned' ? 'Planned' : 'Suggested';
  const tone: BadgeTone = stop.state === 'planned' ? 'sand' : 'muted';
  return (
    <>
      <Badge tone={tone}>
        {label} · {formatUsd(stop.estimateMinor)}
      </Badge>
      {stop.capacityRemaining !== null && stop.capacityRemaining <= 6 ? (
        <Badge tone="coral">{stop.capacityRemaining} left</Badge>
      ) : null}
    </>
  );
}

/** "Today" / "Tomorrow" / "Thu 6 Aug" — a built day that moved must say that it moved. */
function whenLabel(dateISO: string): string {
  const today = todayISO();
  if (dateISO === today) return 'Today';
  const [y, m, d] = today.split('-').map(Number);
  const tomorrow = isoDate(new Date(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + 1));
  if (dateISO === tomorrow) return 'Tomorrow';
  const [py, pm, pd] = dateISO.split('-').map(Number);
  return new Date(py ?? 2026, (pm ?? 1) - 1, pd ?? 1).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
