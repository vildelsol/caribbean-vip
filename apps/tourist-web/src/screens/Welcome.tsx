import { useState } from 'react';
import { ISLANDS, destinationsFor } from '../data/catalogue';
import { useStore } from '../state/store';
import { Icon } from '../components/Icon';
import './Welcome.css';

/**
 * First-launch onboarding — collects the guest's name and starting island so the rest of the app
 * can feel personal from the first screen.
 *
 * Deliberately lightweight: two fields, no email, no password. The premise of the product is that
 * a guest arriving in the Caribbean should be inside the experience in seconds, not filling in a
 * registration form at the gate. The name is used on the Profile screen and in Irie's greeting;
 * the island selection does what the island switcher on Explore does — it just happens first.
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

  return (
    <main className="welcome">
      <div className="welcome__hero" aria-hidden="true">
        <img
          src={`${import.meta.env.BASE_URL}demo/jm-hero.jpg`}
          alt=""
          className="welcome__hero-img"
          loading="eager"
          fetchPriority="high"
          decoding="sync"
        />
        <div className="welcome__hero-scrim" />
      </div>

      <div className="welcome__body">
        <header className="welcome__header">
          <span className="welcome__crest" aria-hidden="true">
            <span className="crest__vip">VIP</span>
          </span>
          <h1 className="welcome__title">Caribbean VIP</h1>
          <p className="welcome__sub">Your local guide to the best of the islands</p>
        </header>

        <form className="welcome__form" onSubmit={submit} noValidate>
          <label className="welcome__field">
            <span className="welcome__label">Your name</span>
            <input
              type="text"
              className="welcome__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marcus"
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
                    <span className="welcome__island-name">{island.in_app_brand}</span>
                    {first ? (
                      <span className="welcome__island-dest">{first.name}</span>
                    ) : null}
                    {on ? (
                      <span className="welcome__island-check" aria-hidden="true">
                        <Icon name="check" size={14} strokeWidth={2.4} color="var(--green-900)" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <button
            type="submit"
            className="welcome__cta"
            disabled={!canContinue}
            aria-disabled={!canContinue}
          >
            Start exploring
          </button>
        </form>
      </div>
    </main>
  );
}
