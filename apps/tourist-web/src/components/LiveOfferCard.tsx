import { useLiveOffer } from '../state/useLiveOffer';
import { PrimaryButton } from './kit';
import { QR } from './QR';

/**
 * The server's offer, and the voucher once claimed — LIVE MODE ONLY.
 *
 * Mounted as `{isLiveMode ? <LiveOfferCard /> : null}` (Explore), so none of this renders,
 * subscribes or fetches in demo mode. Renders nothing until the server has said there is an offer
 * or the guest holds a voucher, so a guest with the consents off never sees an empty box.
 */
export function LiveOfferCard() {
  const { offer, held, claiming, failed, claim } = useLiveOffer();

  if (held) {
    return (
      <section className="pad profile__block" aria-label="Your voucher">
        <h2 className="t-section">Your voucher</h2>
        <QR value={held.token} label="Voucher QR code. Show it to the vendor." />
        <p className="t-micro c-muted">Valid until {new Date(held.validUntil).toLocaleString()}.</p>
      </section>
    );
  }

  if (!offer) return null;

  return (
    <section className="pad profile__block" aria-label="Offer near you">
      <h2 className="t-section">{offer.title}</h2>
      {offer.description ? <p className="t-caption">{offer.description}</p> : null}
      <p className="t-micro c-muted">{Math.round(offer.distanceMetres)} m away. Ends {new Date(offer.endsAt).toLocaleTimeString()}.</p>
      <p className="t-micro c-muted">{offer.terms}</p>
      <PrimaryButton onClick={() => void claim()} disabled={claiming}>
        {claiming ? 'Saving…' : 'Save this offer'}
      </PrimaryButton>
      {failed ? (
        <p className="t-micro" role="alert">
          Could not save that. The offer may have ended. Try again.
        </p>
      ) : null}
    </section>
  );
}
