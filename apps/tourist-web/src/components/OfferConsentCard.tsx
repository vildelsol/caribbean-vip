import { useState } from 'react';
import { useStore } from '../state/store';
import { useOfferConsent } from '../state/useConsent';
import './OfferConsentCard.css';

/**
 * The offer opt-in — LIVE MODE ONLY.
 *
 * Mounted as `{isLiveMode ? <OfferConsentCard /> : null}` (Profile), so none of this renders,
 * subscribes or fetches in demo mode.
 *
 * Offers need two separate yeses: location (the control in `LocationBar`) and this one. They stay
 * separate because they are different questions, and the server checks both. Saying so here stops
 * a guest switching this on and wondering why nothing arrives.
 */
export function OfferConsentCard() {
  const { state } = useStore();
  const { offerConsent, setOfferConsent } = useOfferConsent();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Shown off until the server has answered, so a slow read never shows an opt-in that is not there.
  const on = offerConsent === true;

  const toggle = async () => {
    setSaving(true);
    setFailed(false);
    const saved = await setOfferConsent(!on);
    setSaving(false);
    setFailed(!saved);
  };

  return (
    <section className="pad profile__block offer-consent">
      <h2 className="t-section">Nearby offers</h2>
      <p className="t-caption c-muted profile__hint">
        Get an offer from a local vendor when you are close to them. Offers need your location as
        well; it is a separate switch on the Explore screen.
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`offer-consent__switch ${on ? 'is-on' : ''}`}
        disabled={saving || offerConsent === null}
        onClick={() => void toggle()}
      >
        <span className="t-caption-strong">{on ? 'Offers on' : 'Offers off'}</span>
        <span className="offer-consent__knob" aria-hidden />
      </button>
      {on && !state.locationConsent ? (
        <p className="t-micro c-muted">Turn on “Use my location” to receive them.</p>
      ) : null}
      {failed ? (
        <p className="t-micro" role="alert">
          Could not save that. Check your connection and try again.
        </p>
      ) : null}
    </section>
  );
}
