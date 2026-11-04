import { useEffect, useState } from 'react';
import { accountStatusOf, type AccountStatus } from '../lib/account';
import { CONSENT_TEXT } from '../lib/consent';
import { eraseMyData, exportMyData, removeMyAccount, retainedUntilText, type EraseResult } from '../lib/privacy';
import { supabase } from '../lib/supabase';
import { useStore } from '../state/store';
import { useOfferConsent } from '../state/useConsent';
import { SecondaryButton } from './kit';
import './OfferConsentCard.css';
import './PrivacyCard.css';

/**
 * Privacy & data — LIVE MODE ONLY.
 *
 * Mounted as `{isLiveMode ? <PrivacyCard /> : null}` (Profile), so none of this renders,
 * subscribes or fetches in demo mode.
 *
 * Three things the guest can do about their own data: withdraw each consent, download everything
 * held about them, and erase it. The erase step names what stays (bookings and payment records,
 * kept for legal and accounting reasons) before it acts, because the guest decides on what the
 * button says.
 */

/** The signed-in user's account status, following auth changes. */
function useAccountStatus(): AccountStatus | null {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setStatus(accountStatusOf(data.user));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setStatus(accountStatusOf(session?.user));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return status;
}

/** Hand the browser a file to save. */
function saveFile(filename: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function PrivacyCard() {
  const { state, dispatch, reset } = useStore();
  const { offerConsent, setOfferConsent } = useOfferConsent();
  const status = useAccountStatus();
  const [busy, setBusy] = useState<'offers' | 'export' | 'erase' | 'remove' | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [erased, setErased] = useState<Extract<EraseResult, { ok: true }> | null>(null);

  const offersOn = offerConsent === true;
  const canDownload = status?.kind === 'linked';

  const toggleOffers = async () => {
    setBusy('offers');
    setFailed(null);
    const saved = await setOfferConsent(!offersOn);
    setBusy(null);
    if (!saved) setFailed('Could not save that. Check your connection and try again.');
  };

  const download = async () => {
    setBusy('export');
    setFailed(null);
    const result = await exportMyData();
    setBusy(null);
    if (result.ok) saveFile(result.filename, result.json);
    else setFailed('Could not prepare your data. Check your connection and try again.');
  };

  const erase = async () => {
    setBusy('erase');
    setFailed(null);
    const result = await eraseMyData();
    setBusy(null);
    setConfirming(false);
    if (result.ok) {
      // The server has withdrawn every consent; bring this device's copy in line.
      dispatch({ type: 'setLocationConsent', granted: false });
      setErased(result);
    } else {
      setFailed('Could not erase your data. Nothing was changed. Try again.');
    }
  };

  const removeSignIn = async () => {
    setBusy('remove');
    setFailed(null);
    const result = await removeMyAccount();
    setBusy(null);
    setRemoveConfirm(false);
    if (result.ok) {
      // The sign-in is gone; put this device back to a fresh start.
      reset();
    } else {
      setFailed(result.reason === 'refused' ? result.message : 'Could not remove your sign-in. Nothing was changed. Try again.');
    }
  };

  return (
    <section className="pad profile__block privacy-card" aria-labelledby="privacy-heading">
      <h2 className="t-section" id="privacy-heading">
        Privacy &amp; data
      </h2>

      <h3 className="t-caption-strong">Your choices</h3>
      <p className="t-caption c-muted profile__hint">{CONSENT_TEXT.location}</p>
      <button
        type="button"
        role="switch"
        aria-checked={state.locationConsent}
        className={`offer-consent__switch ${state.locationConsent ? 'is-on' : ''}`}
        onClick={() => dispatch({ type: 'setLocationConsent', granted: !state.locationConsent })}
      >
        <span className="t-caption-strong">{state.locationConsent ? 'Location on' : 'Location off'}</span>
        <span className="offer-consent__knob" aria-hidden />
      </button>

      <p className="t-caption c-muted profile__hint">{CONSENT_TEXT.offers}</p>
      <button
        type="button"
        role="switch"
        aria-checked={offersOn}
        className={`offer-consent__switch ${offersOn ? 'is-on' : ''}`}
        disabled={busy !== null || offerConsent === null}
        onClick={() => void toggleOffers()}
      >
        <span className="t-caption-strong">{offersOn ? 'Offers on' : 'Offers off'}</span>
        <span className="offer-consent__knob" aria-hidden />
      </button>
      <p className="t-micro c-faint">
        Each change is recorded with the date and the wording you saw, as proof of your choice.
      </p>

      <h3 className="t-caption-strong privacy-card__sub">Download my data</h3>
      <p className="t-caption c-muted profile__hint">
        A file with everything we hold about you: profile, saved items, trips, bookings, reviews, offers shown and
        your consent history.
      </p>
      {canDownload ? (
        <SecondaryButton onClick={() => void download()} disabled={busy !== null}>
          {busy === 'export' ? 'Preparing…' : 'Download my data'}
        </SecondaryButton>
      ) : (
        <p className="t-micro c-muted">
          {status === null ? 'Checking your account…' : 'Add and verify an email above first, so we know the file goes to you.'}
        </p>
      )}

      <h3 className="t-caption-strong privacy-card__sub">Erase my data</h3>
      {erased ? (
        <p className="t-caption" role="status">
          Your data is erased.{' '}
          {erased.bookingsRetained > 0
            ? `We kept ${erased.bookingsRetained} booking${erased.bookingsRetained === 1 ? '' : 's'} and their payment records, because the law requires it${erased.retainedUntil ? `, until ${retainedUntilText(erased.retainedUntil)}` : ''}.`
            : 'No bookings were held, so nothing was kept.'}
        </p>
      ) : null}
      {erased && erased.accountRemovable ? (
        removeConfirm ? (
          <div className="privacy-card__confirm" role="alertdialog" aria-labelledby="remove-title">
            <p className="t-caption-strong" id="remove-title">
              Remove your sign-in?
            </p>
            <p className="t-caption">
              This deletes your login for good. You will be signed out on this device and cannot sign back in to this
              account. This cannot be undone.
            </p>
            <div className="row privacy-card__actions">
              <SecondaryButton onClick={() => setRemoveConfirm(false)} disabled={busy !== null}>
                Keep my sign-in
              </SecondaryButton>
              <SecondaryButton onClick={() => void removeSignIn()} disabled={busy !== null}>
                {busy === 'remove' ? 'Removing…' : 'Yes, remove it'}
              </SecondaryButton>
            </div>
          </div>
        ) : (
          <SecondaryButton onClick={() => setRemoveConfirm(true)} disabled={busy !== null}>
            Also remove my sign-in
          </SecondaryButton>
        )
      ) : null}
      {erased ? null : confirming ? (
        <div className="privacy-card__confirm" role="alertdialog" aria-labelledby="erase-title">
          <p className="t-caption-strong" id="erase-title">
            Erase your data?
          </p>
          <p className="t-caption">
            We will delete your name, interests, saved items, trips, reviews, messages and notifications, and switch
            off every consent. This cannot be undone.
          </p>
          <p className="t-caption">
            We will keep your bookings and payment records, because the law requires it. Your consent history stays
            as proof of your choices.
          </p>
          <div className="row privacy-card__actions">
            <SecondaryButton onClick={() => setConfirming(false)} disabled={busy !== null}>
              Keep my data
            </SecondaryButton>
            <SecondaryButton onClick={() => void erase()} disabled={busy !== null}>
              {busy === 'erase' ? 'Erasing…' : 'Yes, erase it'}
            </SecondaryButton>
          </div>
        </div>
      ) : (
        <>
          <p className="t-caption c-muted profile__hint">
            Delete your personal data from this app. Bookings and payment records are kept where the law requires it.
          </p>
          <SecondaryButton onClick={() => setConfirming(true)} disabled={busy !== null}>
            Erase my data
          </SecondaryButton>
        </>
      )}

      {failed ? (
        <p className="t-micro" role="alert">
          {failed}
        </p>
      ) : null}
    </section>
  );
}
