import { useState } from 'react';
import { ISLANDS, destinationsFor } from '../data/catalogue';
import { useStore } from '../state/store';
import { Icon } from '../components/Icon';
import './Welcome.css';

/**
 * First-launch onboarding — name + island selection.
 *
 * Card-up layout: hero takes the top ~55%, ivory card rises from the bottom
 * with the form on a crisp light surface. Matches the VIP Cayman reference.
 */
export function Welcome() {
  const { dispatch } = useStore();
  const [name, setName] = useState('');
  const [islandId, setIslandId] = useState(ISLANDS[0]?.id ?? 'island-jm');

  const trimmed = name.trim();
  const canContinue = trimmed.length >= 2;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canContinue) return;
    dispatch({ type: 'selectIsland', islandId });
    dispatch({ type: 'setOnboarded', name: trimmed });
  };

  const continueAsGuest = () => {
    dispatch({ type: 'selectIsland', islandId });
    dispatch({ type: 'setOnboarded', name: 'Guest' });
  };

  return (
    <main className="welcome">
      {/* Full-bleed hero — catamaran on turquoise Caribbean water */}
      <div className="welcome__hero" aria-hidden="true">
        <img
          src={`${import.meta.env.BASE_URL}demo/jm-catamaran-1.jpg`}
          alt=""
          className="welcome__hero-img"
          loading="eager"
          fetchPriority="high"
          decoding="sync"
        />
        <div className="welcome__hero-warm" />
        <div className="welcome__hero-scrim" />
      </div>

      {/* Brand section floats in the hero */}
      <div className="welcome__brand">
        <div className="welcome__crest" aria-hidden="true">
          <span className="welcome__crest-vip">VIP</span>
        </div>
        <div className="welcome__tagline">
          <p className="welcome__eyebrow">CARIBBEAN VIP</p>
          <h1 className="welcome__title">Your Island.<br />Your Way.</h1>
        </div>
      </div>

      {/* Ivory card rises from the bottom */}
      <form className="welcome__card" onSubmit={submit} noValidate>
        <label className="welcome__field">
          <span className="welcome__label">What should we call you?</span>
          <input
            type="text"
            className="welcome__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your first name"
            autoComplete="given-name"
            autoFocus
            required
          />
        </label>

        <fieldset className="welcome__islands">
          <legend className="welcome__label">Which island are you visiting?</legend>
          <div className="welcome__island-grid">
            {ISLANDS.map((island) => {
              const first = destinationsFor(island.id)[0];
              const on = island.id === islandId;
              return (
                <button
                  key={island.id}
                  type="button"
                  className={`welcome__island-btn ${on ? 'is-on' : ''}`}
                  onClick={() => setIslandId(island.id)}
                  aria-pressed={on}
                >
                  {on && (
                    <span className="welcome__island-check" aria-hidden="true">
                      <Icon name="check" size={11} strokeWidth={2.8} color="var(--on-dark)" />
                    </span>
                  )}
                  <span className="welcome__island-name">{island.in_app_brand}</span>
                  {first ? (
                    <span className="welcome__island-dest">{first.name}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="welcome__ctas">
          <button
            type="submit"
            className="welcome__cta welcome__cta--primary"
            disabled={!canContinue}
            aria-disabled={!canContinue}
          >
            Start Exploring
          </button>
          <button
            type="button"
            className="welcome__cta welcome__cta--ghost"
            onClick={continueAsGuest}
          >
            Continue as Guest
          </button>
        </div>
      </form>
    </main>
  );
}
