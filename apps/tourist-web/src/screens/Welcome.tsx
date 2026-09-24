import { useState } from 'react';
import { ISLANDS, destinationsFor, experiencesFor, mediaUrl } from '../data/catalogue';
import { useStore } from '../state/store';
import { Icon, type IconName } from '../components/Icon';
import './Welcome.css';

/**
 * First-launch onboarding, in two steps.
 *
 * Step one is a splash: the mark, the promise, and three ways in. No form —
 * a guest arriving in the Caribbean should meet the brand before a text field.
 * Step two collects the name and starting island on an ivory sheet that fills
 * the screen beneath a reframed strip of the same photography.
 */

/**
 * The hero loop.
 *
 * Four stills rather than a video: the splash is the first frame of the app and
 * a video costs a decode, an autoplay policy and several megabytes before the
 * brand has earned any of them. Cross-fading stills with a slow Ken Burns drift
 * reads as motion at 1/50th the weight, cannot stall, and degrades to a single
 * static frame under `prefers-reduced-motion` with no JavaScript involved.
 *
 * The order is a colour arc — turquoise, jungle green, aerial coast, gold
 * sunset — so the loop moves through the day rather than shuffling postcards.
 */
const HERO_FRAMES = [
  { key: 'ky-hero', position: '38% 46%' },
  { key: 'jm-dunns-2', position: '50% 42%' },
  // The aerial down a coastline Ro asked for and the library did not have at
  // the time of the first pass. It is the closest frame in the set to his
  // reference, so it is the one the loop rests on longest visually.
  { key: 'bb-south-coast-1', position: '54% 50%' },
  { key: 'jm-catamaran-1', position: '50% 46%' },
] as const;

/** What the brand promises, in three words each. Marketing, at splash scale. */
/*
 * Three proofs of the headline, not three adjectives.
 *
 * "Curated experiences" was the weakest of the three — it is what every listing site says about
 * its catalogue, and it proves nothing about the claim above it. The other two are real: vendor
 * approval is enforced in `isPubliclyVisibleDemo`, and the voucher is a genuine artefact.
 */
const PROOF: { icon: IconName; label: string }[] = [
  { icon: 'sparkle', label: 'Plans\nyour day' },
  { icon: 'shield-check', label: 'Verified\noperators' },
  { icon: 'ticket', label: 'VIP\nbenefits' },
];

export function Welcome() {
  const { dispatch } = useStore();
  const [step, setStep] = useState<'splash' | 'setup'>('splash');
  const [guestPath, setGuestPath] = useState(false);
  const [name, setName] = useState('');
  const [islandId, setIslandId] = useState(ISLANDS[0]?.id ?? 'island-jm');

  const trimmed = name.trim();
  // A guest need not name themselves; anyone signing in or registering does.
  const canContinue = guestPath || trimmed.length >= 2;

  const enter = (asGuest: boolean) => {
    setGuestPath(asGuest);
    setStep('setup');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canContinue) return;
    dispatch({ type: 'selectIsland', islandId });
    dispatch({ type: 'setOnboarded', name: trimmed || 'Guest' });
  };

  return (
    <main className={`wl wl--${step}`}>
      <div className="wl__stage" aria-hidden="true">
        {HERO_FRAMES.map((frame, i) => (
          <div key={frame.key} className="wl__frame" style={{ animationDelay: `${i * 7}s` }}>
            <img
              src={mediaUrl(frame.key)}
              alt=""
              className="wl__frame-img"
              style={{ objectPosition: frame.position, animationDelay: `${i * 7}s` }}
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchPriority={i === 0 ? 'high' : 'low'}
              decoding={i === 0 ? 'sync' : 'async'}
            />
          </div>
        ))}
        {/* Warm at the top, brand green at the foot — a colour grade rather than a
            flat wash, so the turquoise keeps its saturation through the middle. */}
        <div className="wl__grade" />
        <div className="wl__vignette" />
      </div>

      {/* ---------------- Step one — the splash ---------------- */}
      {step === 'splash' ? (
        <div className="wl__splash">
          <div className="wl__splash-top">
            <div className="wl-crest">
              <span className="wl-crest__stars" aria-hidden="true">
                <Icon name="sparkle" size={11} color="var(--gold-light)" />
                <Icon name="sparkle" size={15} color="var(--gold-light)" />
                <Icon name="sparkle" size={11} color="var(--gold-light)" />
              </span>
              <span className="wl-crest__word">VIP</span>
              <span className="wl-crest__rule" aria-hidden="true" />
              <span className="wl-crest__sub">CARIBBEAN</span>
            </div>

            {/*
              * The splash leads with what the product *does*.
              *
              * It used to open "Exclusive experiences. Authentic connections." — two abstractions
              * that every OTA also claims, and neither of which describes anything this app does
              * that Viator does not. The thing nobody else does was five taps away, on the
              * concierge screen: it plans a day against real departures, real distances and what
              * the guest has already booked, and it will tell them when something does not fit.
              *
              * So the mechanism is the headline now, and "Your Island. Your Way." is kept as the
              * brand overline above it — the line is good, it is simply not an argument.
              *
              * **One line under the headline, not a paragraph.** The first attempt explained the
              * mechanism in full — real departures, real drive times, what you have already booked
              * — which is true, and is three lines of body copy on a screen that has about two
              * seconds to make one point. A splash is a poster. The headline makes the claim, this
              * line names the promise in five words, and the proof row below substantiates it in
              * three words a column. Anything longer belongs on the concierge screen, where the
              * guest has actually asked.
              */}
            <div className="wl__pitch">
              <p className="wl__brandline">Your Island. Your Way.</p>
              <h1 className="wl__tagline">
                A Caribbean day that
                <br />
                actually works.
              </h1>
              <p className="wl__sub">Every stop fits. Nothing overlaps.</p>
              <p className="wl__islands-line">Jamaica &middot; Cayman &middot; Barbados</p>
            </div>
          </div>

          <ul className="wl__proof">
            {PROOF.map((p) => (
              <li key={p.label} className="wl__proof-item">
                <span className="wl__proof-ring" aria-hidden="true">
                  <Icon name={p.icon} size={15} color="var(--gold-light)" />
                </span>
                <span className="wl__proof-label">{p.label}</span>
              </li>
            ))}
          </ul>

          <div className="wl__actions">
            <button type="button" className="wl-cta wl-cta--gold" onClick={() => enter(true)}>
              Continue as Guest
            </button>
            <button type="button" className="wl-cta wl-cta--outline" onClick={() => enter(false)}>
              Sign In
            </button>
            <button type="button" className="wl__link" onClick={() => enter(false)}>
              Create an Account
            </button>
          </div>
        </div>
      ) : (
        /* ---------------- Step two — name and island ---------------- */
        <form className="wl__setup" onSubmit={submit} noValidate>
          {/* The strip: enough photograph to keep the place in the room, not so
              much that the screen reads as half-empty sky. */}
          <div className="wl__strip">
            <button
              type="button"
              className="wl__back"
              onClick={() => setStep('splash')}
              aria-label="Back"
            >
              <Icon name="chevron-left" size={18} strokeWidth={2.2} color="var(--ivory)" />
            </button>

            {/* Brand continuity — the mark stays with you between the two steps. */}
            <div className="wl__mark" aria-hidden="true">
              <span className="wl__mark-crest">VIP</span>
              <span className="wl__mark-word">CARIBBEAN VIP</span>
            </div>

            <div className="wl__steps" aria-hidden="true">
              <span className="wl__step is-done" />
              <span className="wl__step is-on" />
            </div>
          </div>

          <div className="wl__card">
            <header className="wl__card-head">
              <h2 className="wl__card-title">
                {guestPath ? 'Welcome aboard' : 'Create your profile'}
              </h2>
              <p className="wl__card-note">
                {guestPath
                  ? 'Tell us where you are and we will do the rest.'
                  : 'Two details and you are in.'}
              </p>
            </header>

            <label className="wl__field">
              <span className="wl__label">
                Your name {guestPath ? <span className="wl__optional">optional</span> : null}
              </span>
              <input
                type="text"
                className="wl__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your first name"
                autoComplete="given-name"
                autoFocus
              />
            </label>

            <fieldset className="wl__islands">
              <legend className="wl__label">Which island are you visiting?</legend>
              {/*
                * Full-width rows, not a two-across grid.
                *
                * Three islands in a two-column grid leaves a visible empty cell in
                * the fourth slot, which is the single loudest "unfinished" signal
                * on the screen. Rows also make room for the photograph and the
                * inventory count, which is what actually sells the choice.
                */}
              <div className="wl__island-list">
                {ISLANDS.map((island) => {
                  const first = destinationsFor(island.id)[0];
                  const count = experiencesFor(island.id).length;
                  const on = island.id === islandId;
                  return (
                    <button
                      key={island.id}
                      type="button"
                      className={`wl__island ${on ? 'is-on' : ''}`}
                      onClick={() => setIslandId(island.id)}
                      aria-pressed={on}
                    >
                      <img
                        className="wl__island-thumb"
                        src={mediaUrl(island.hero_media_path ?? undefined)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="wl__island-text">
                        <span className="wl__island-name">{island.in_app_brand}</span>
                        <span className="wl__island-dest">
                          {first ? first.name : island.name}
                          {count ? ` · ${count} experiences` : ''}
                        </span>
                      </span>
                      <span className="wl__island-check" aria-hidden="true">
                        <Icon name="check" size={12} strokeWidth={2.8} color="var(--on-dark)" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="wl__card-foot">
              <button
                type="submit"
                className="wl-cta wl-cta--gold"
                disabled={!canContinue}
                aria-disabled={!canContinue}
              >
                Start Exploring
              </button>
              <p className="wl__foot-note">
                You can switch islands any time from your profile.
              </p>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}
