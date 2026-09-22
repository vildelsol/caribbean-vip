import { useState } from 'react';
import { ISLANDS, destinationsFor } from '../data/catalogue';
import { useStore } from '../state/store';
import { Icon } from '../components/Icon';
import './Welcome.css';

/**
 * First-launch onboarding, in two steps.
 *
 * Step one is a splash: the mark, the promise, and three ways in. No form —
 * a guest arriving in the Caribbean should meet the brand before a text field.
 * Step two collects the name and starting island on an ivory card over the
 * same photograph.
 */
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
    <main className="wl">
      <div className="wl__hero" aria-hidden="true">
        <img
          src={`${import.meta.env.BASE_URL}demo/ky-hero.jpg`}
          alt=""
          className={`wl__hero-img ${step === 'setup' ? 'wl__hero-img--setup' : ''}`}
          loading="eager"
          fetchPriority="high"
          decoding="sync"
        />
        <div className={`wl__scrim ${step === 'setup' ? 'wl__scrim--deep' : ''}`} />
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

            <div className="wl__pitch">
              <h1 className="wl__tagline">Your Island. Your Way.</h1>
              <p className="wl__sub">
                Premium experiences across Jamaica, Cayman and Barbados.
              </p>
            </div>
          </div>

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
              <div className="wl__island-grid">
                {ISLANDS.map((island) => {
                  const first = destinationsFor(island.id)[0];
                  const on = island.id === islandId;
                  return (
                    <button
                      key={island.id}
                      type="button"
                      className={`wl__island ${on ? 'is-on' : ''}`}
                      onClick={() => setIslandId(island.id)}
                      aria-pressed={on}
                    >
                      {on && (
                        <span className="wl__island-check" aria-hidden="true">
                          <Icon name="check" size={11} strokeWidth={2.8} color="var(--on-dark)" />
                        </span>
                      )}
                      <span className="wl__island-name">{island.in_app_brand}</span>
                      {first ? <span className="wl__island-dest">{first.name}</span> : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <button
              type="submit"
              className="wl-cta wl-cta--gold"
              disabled={!canContinue}
              aria-disabled={!canContinue}
            >
              Start Exploring
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
