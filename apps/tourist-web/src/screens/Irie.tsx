import { useMemo, useState } from 'react';
import {
  byDistanceFrom,
  destinationBySlug,
  experiencesFor,
  heroUrl,
  islandById,
  simulatedPosition,
  travelFrom,
  formatKm,
  type DemoExperience,
} from '../data/catalogue';
import { useStore } from '../state/store';
import { Icon } from '../components/Icon';
import { Badge, DemoNote, Photo, Price } from '../components/kit';
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
 */

interface Intent {
  chip: string;
  reply: string;
  categories: string[];
  maxMinor?: number;
  reason: (e: DemoExperience, metres: number) => string;
}

const INTENTS: Intent[] = [
  {
    chip: 'Plan my afternoon',
    reply: 'You have a few free hours. These are close, open this afternoon and get you back before dinner.',
    categories: [],
    reason: (_e, m) => {
      const t = travelFrom(m);
      return `${t.minutes} minutes' ${t.mode} from you, and quiet at midday.`;
    },
  },
  {
    chip: 'Something under $50',
    reply: 'Here is what I can find under US$50 per person nearby.',
    categories: [],
    maxMinor: 5000,
    reason: (e) => `US$${Math.round(e.fromAmountMinor / 100)} per adult — the best value close by.`,
  },
  {
    chip: 'Quiet beach nearby',
    reply: 'These stay calm even when the cruise ships are in.',
    categories: ['beaches', 'water_sports'],
    reason: (_e, m) => `${formatKm(m)} out, so it misses the port crowds.`,
  },
  {
    chip: 'Dinner with a view',
    reply: 'Somewhere to end the day.',
    categories: ['food', 'nightlife'],
    reason: () => 'Good at sunset, and it takes a same-day table.',
  },
  {
    chip: 'Family activity',
    reply: 'These work well with children along.',
    categories: ['family', 'beaches', 'adventure'],
    reason: () => 'Suits mixed ages, and there is shade.',
  },
  {
    chip: 'Rainy-day option',
    reply: 'Mostly indoors, or fine whatever the weather does.',
    categories: ['culture', 'food'],
    reason: () => 'Indoors and shaded — good after a hot morning.',
  },
];

interface Turn {
  id: string;
  question: string;
  reply: string;
  picks: { experience: DemoExperience; metres: number; reason: string }[];
}

export function Irie() {
  const { state, dispatch } = useStore();
  const [turns, setTurns] = useState<Turn[]>([]);

  const island = islandById(state.islandId);
  const destination = destinationBySlug(state.destinationSlug);

  const ranked = useMemo(() => {
    if (!destination) return [];
    return byDistanceFrom(simulatedPosition(destination), experiencesFor(state.islandId));
  }, [state.islandId, destination]);

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
    setTurns((t) => [...t, { id: `${Date.now()}`, question: intent.chip, reply: intent.reply, picks }]);
  };

  if (!island || !destination) return null;

  const planned = state.plannedExperienceIds.length;

  return (
    <main className="screen screen--deep irie">
      <header className="irie__head">
        <div className="row" style={{ gap: 9 }}>
          <Icon name="sparkle" size={19} color="var(--gold-light)" />
          <span className="t-body-strong c-on-dark">Irie AI</span>
          <span className="irie__tag t-micro">GUIDED DEMO</span>
        </div>
        {turns.length > 0 ? (
          <button type="button" className="irie__reset" onClick={() => setTurns([])} aria-label="Start over">
            <Icon name="refresh" size={18} color="rgba(251,246,236,0.7)" />
          </button>
        ) : null}
      </header>

      <section className="irie__intro">
        <h1 className="t-display irie__hello">Wah Gwaan!</h1>
        <p className="t-body irie__lead">
          I&rsquo;m Irie AI, your Caribbean concierge. How can I make your day extraordinary?
        </p>

        {/* Context chips make the reasoning visible before a word is typed. Each one is real state:
            the island, the catalogue size, the wallet, the day plan. */}
        <div className="irie__context">
          <span className="ctx">{destination.name}</span>
          <span className="ctx">{ranked.length} experiences nearby</span>
          <span className="ctx">{state.bookings.filter((b) => b.status === 'confirmed').length} booked</span>
          {planned > 0 ? <span className="ctx">{planned} planned</span> : null}
          <span className="ctx">{state.vouchers.length} vouchers</span>
        </div>
      </section>

      <div className="irie__chips">
        {INTENTS.map((i) => (
          <button key={i.chip} type="button" className="irie-chip" onClick={() => ask(i)}>
            {i.chip}
          </button>
        ))}
      </div>

      {turns.map((turn) => (
        <section key={turn.id} className="irie__turn">
          <p className="irie__question">{turn.question}</p>
          <div className="irie__answer">
            <p className="t-caption-strong">{turn.reply}</p>
            <div className="col irie__picks">
              {turn.picks.map(({ experience, metres, reason }) => {
                const isPlanned = state.plannedExperienceIds.includes(experience.id);
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
                      <h3 className="t-caption-strong">{experience.title}</h3>
                      <p className="t-micro c-locator irie-pick__meta">
                        {`US$${Math.round(experience.fromAmountMinor / 100)}`} ·{' '}
                        {formatKm(metres)} · {travelFrom(metres).minutes} min{' '}
                        {travelFrom(metres).mode}
                      </p>
                      {/* The stated reason is the point: an answer a guest can check beats one they
                          have to trust. */}
                      <p className="t-micro c-muted irie-pick__reason">{reason}</p>
                      <div className="irie-pick__actions">
                        <button
                          type="button"
                          className="badge badge--brand irie-pick__btn"
                          onClick={() =>
                            dispatch(
                              isPlanned
                                ? { type: 'unplanExperience', experienceId: experience.id }
                                : { type: 'planExperience', experienceId: experience.id },
                            )
                          }
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
          </div>
        </section>
      ))}

      {turns.length === 0 ? (
        <p className="irie__hint t-caption">Tap a suggestion above — every answer comes from the live demo catalogue.</p>
      ) : null}

      <DemoNote>Rule-matched over the demo catalogue · no language model</DemoNote>
    </main>
  );
}
