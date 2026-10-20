import { useState } from 'react';
import { ensureLiveUser } from '../lib/api';
import {
  isValidEmail,
  normaliseEmail,
  signOut,
  startLink,
  verifyLink,
  type AccountResult,
} from '../lib/account';
import { COLLISION_MESSAGE, LOSS_WARNING, messageFor } from '../lib/accountCopy';
import { useStore } from '../state/store';
import { useAccountStatus } from './useAccountStatus';
import { Card, SecondaryButton, TextButton } from './kit';
import { Icon } from './Icon';
import { EmailCodeFlow } from './EmailCodeFlow';
import { SignInSheet } from './SignInSheet';
import './AccountCard.css';

/**
 * The guest's account — LIVE MODE ONLY.
 *
 * Mounted as `{isLiveMode ? <AccountCard /> : null}` (Profile) and inside `KeepBookingNudge`
 * (Confirmation, same gate), so none of this renders, subscribes or fetches in demo mode.
 *
 * A live guest starts anonymous. Adding an email keeps the same user id, so every booking already
 * made stays theirs and can be recovered on another phone. If the email already belongs to another
 * account, Supabase refuses the link; the guest is offered a sign-in to that account instead, and
 * told plainly that bookings made on this phone stay on this phone.
 */

type Mode = 'link' | 'collision' | 'signin';

export function AccountCard({ embedded = false }: { embedded?: boolean }) {
  const status = useAccountStatus();
  const { dispatch } = useStore();
  const [mode, setMode] = useState<Mode>('link');
  const [collisionEmail, setCollisionEmail] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  // This device only (`scope: 'local'`). The account's bookings leave the device with it; the
  // SIGNED_OUT handler in liveSync purges too, so this holds however the session ends.
  const doSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    const result = await signOut();
    setSigningOut(false);
    if (result.ok) {
      dispatch({ type: 'purgeServerBookings' });
      setMode('link');
    } else {
      setSignOutError(messageFor(result.reason));
    }
  };

  // A guest with no session yet (nothing booked) gets an anonymous one first: an email has to be
  // added to *someone*. The email is checked before that, so a typo does not mint a user.
  const send = async (email: string): Promise<AccountResult> => {
    if (status?.kind === 'none') {
      if (!isValidEmail(normaliseEmail(email))) return { ok: false, reason: 'invalid_email' };
      if (!(await ensureLiveUser())) return { ok: false, reason: 'network' };
    }
    return startLink(email);
  };

  let body;
  if (status === null) {
    body = <p className="t-caption c-muted">Checking your account…</p>;
  } else if (status.kind === 'linked') {
    body = (
      <Card>
        <div className="acct__status">
          <span className="acct__status-icon">
            <Icon name="shield-check" size={18} color="var(--green-900)" />
          </span>
          <p className="t-caption c-ink">
            Your bookings are saved to <strong>{status.email}</strong>. Sign in with this email on any
            phone to see them again.
          </p>
        </div>
        <div className="acct">
          {signOutError ? (
            <p className="t-micro c-urgent" role="alert">
              {signOutError}
            </p>
          ) : null}
          <TextButton onClick={() => void doSignOut()} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </TextButton>
          <p className="t-micro c-faint">Signing out removes these bookings from this phone. They stay saved to your email.</p>
        </div>
      </Card>
    );
  } else if (mode === 'collision') {
    body = (
      <div className="acct">
        <p className="t-caption c-ink" role="status">
          {COLLISION_MESSAGE}
        </p>
        <SecondaryButton onClick={() => setMode('signin')}>Sign in to that account</SecondaryButton>
        <TextButton onClick={() => setMode('link')}>Use a different email</TextButton>
      </div>
    );
  } else if (mode === 'signin') {
    body = (
      <>
        <SignInSheet initialEmail={collisionEmail} onCancel={() => setMode('link')} />
        <TextButton onClick={() => setMode('link')}>Back</TextButton>
      </>
    );
  } else {
    body = (
      <div className="acct">
        <p className="t-caption c-muted">{LOSS_WARNING}</p>
        <EmailCodeFlow
          idPrefix={embedded ? 'nudge-link' : 'link'}
          send={send}
          verify={(email, code) => verifyLink(email, code)}
          onCollision={(email) => {
            setCollisionEmail(email);
            setMode('collision');
          }}
          sendLabel="Add my email"
          doneMessage={(email) => `Done. Your bookings are now saved to ${email}.`}
        />
        <TextButton
          onClick={() => {
            setCollisionEmail('');
            setMode('signin');
          }}
        >
          Already added an email on another phone? Sign in
        </TextButton>
      </div>
    );
  }

  if (embedded) return body;

  return (
    <section className="pad profile__block">
      <h2 className="t-section">Your account</h2>
      {body}
    </section>
  );
}

/**
 * After a live booking: a small prompt to add an email, opening the same flow in place.
 * Shows nothing once the guest has an email (unless they opened it here, so the success line
 * stays on screen).
 */
export function KeepBookingNudge() {
  const status = useAccountStatus();
  const [open, setOpen] = useState(false);

  if (!open && (status === null || status.kind === 'linked')) return null;

  return (
    <div className="acct__nudge">
      <Card>
        <div className="acct__nudge-inner">
          <p className="t-caption-strong c-ink">Keep this booking if you lose your phone</p>
          {open ? (
            <AccountCard embedded />
          ) : (
            <>
              <p className="t-micro c-muted">
                This ticket is saved on this phone only. Add your email and you can get it back on any phone.
              </p>
              <SecondaryButton onClick={() => setOpen(true)}>Add my email</SecondaryButton>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
