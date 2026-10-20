import { useState } from 'react';
import { shouldConfirmSignIn, startSignIn, verifySignIn } from '../lib/account';
import { SIGN_IN_ORPHAN_WARNING } from '../lib/accountCopy';
import { useStore } from '../state/store';
import { EmailCodeFlow } from './EmailCodeFlow';
import { PrimaryButton, TextButton } from './kit';
import { useAccountStatus } from './useAccountStatus';

/**
 * Sign in to an account that already has an email — LIVE MODE ONLY.
 *
 * Used from Welcome's `signin` step (reached only when `isLiveMode`) and from AccountCard after an
 * email collision. `startSignIn` sets `shouldCreateUser: false`, so an unknown email is reported,
 * never silently turned into a fresh empty account. Once verified, `useLiveSync` sees `SIGNED_IN`
 * and merges the account's bookings into this device.
 *
 * `verifyOtp` replaces the session, and an anonymous guest cannot get back to the one they leave.
 * So when they hold a confirmed ticket under it (`shouldConfirmSignIn`), the sheet stops first and
 * says plainly what happens to those tickets, with "Continue" and "Go back".
 */
export function SignInSheet({
  onDone,
  onCancel,
  initialEmail,
}: {
  onDone?: () => void;
  /** "Go back" on the warning step. */
  onCancel?: () => void;
  initialEmail?: string;
}) {
  const status = useAccountStatus();
  const { state } = useStore();
  const [acknowledged, setAcknowledged] = useState(false);

  if (status === null) return <p className="t-caption c-muted">Checking your account…</p>;

  if (!acknowledged && shouldConfirmSignIn(status, state.bookings)) {
    return (
      <div className="acct" role="alertdialog" aria-labelledby="signin-warn">
        <p id="signin-warn" className="t-caption c-ink">
          {SIGN_IN_ORPHAN_WARNING}
        </p>
        <PrimaryButton onClick={() => setAcknowledged(true)}>Continue</PrimaryButton>
        <TextButton onClick={() => onCancel?.()}>Go back</TextButton>
      </div>
    );
  }

  return (
    <div className="acct">
      <p className="t-caption c-muted">
        Enter the email you added to your bookings. We will send a code to bring them back to this phone.
      </p>
      <EmailCodeFlow
        idPrefix="signin"
        send={(email) => startSignIn(email)}
        verify={(email, code) => verifySignIn(email, code)}
        onDone={onDone}
        initialEmail={initialEmail}
        doneMessage={(email) => `Signed in as ${email}. Your bookings will appear in Trips.`}
      />
    </div>
  );
}
