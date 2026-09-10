import { Icon } from './Icon';
import { formatAccuracy, formatKmish } from '../data/positionFormat';
import type { GuestPosition } from '../state/useGuestPosition';
import './LocationBar.css';

/**
 * What the app is measuring from, said out loud.
 *
 * Every distance on the screen depends on one choice — real fix or destination centre — and a
 * screen that shows "3.6 km" without saying which is quietly making a claim it may not be able to
 * keep. This is small, permanent, and always names the source.
 *
 * It is also the consent gate itself (T-07): the only control in the app that can raise the browser
 * location prompt, and the only one that can withdraw it again.
 */
export function LocationBar({
  guest,
  destinationName,
}: {
  guest: GuestPosition;
  destinationName: string;
}) {
  const { position, locating, available, enable, disable } = guest;

  if (locating) {
    return (
      <div className="locbar" aria-live="polite">
        <Icon name="pin" size={13} color="var(--teal-text)" strokeWidth={2} />
        <span className="grow t-micro">Finding you&hellip;</span>
      </div>
    );
  }

  if (position.kind === 'real') {
    return (
      <div className="locbar locbar--live" aria-live="polite">
        <span className="locbar__dot" />
        <span className="grow t-micro">
          Using your location · {formatAccuracy(position.accuracyMetres)}
        </span>
        <button type="button" className="locbar__btn t-micro-strong" onClick={disable}>
          Turn off
        </button>
      </div>
    );
  }

  // Every simulated case says which one it is. "Off-island" in particular is not a failure — it is
  // the normal state of anyone opening this outside the Caribbean, and naming the distance is what
  // stops it reading as a bug.
  const body =
    position.reason === 'off-island'
      ? `You're about ${formatKmish(position.metresAway ?? 0)} away — distances are from ${destinationName}`
      : position.reason === 'no-fix'
        ? `No fix from your device — distances are from ${destinationName}`
        : `Distances are from ${destinationName}`;

  return (
    <div className="locbar" aria-live="polite">
      <Icon name="pin" size={13} color="var(--teal-text)" strokeWidth={2} />
      <span className="grow t-micro">{body}</span>
      {available ? (
        <button type="button" className="locbar__btn t-micro-strong" onClick={() => void enable()}>
          {position.reason === 'no-fix' ? 'Try again' : 'Use my location'}
        </button>
      ) : null}
    </div>
  );
}
