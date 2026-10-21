/**
 * What the account screens say. Plain and calm: the guest may be standing on a dock with a weak
 * signal, and the worst outcome here (a lost ticket) is the one we are trying to prevent, not
 * threaten them with.
 */

import type { FailReason } from './account';

export const COLLISION_MESSAGE =
  'This email already has an account. Sign in to it. Bookings made on this phone stay on this phone.';

export const LOSS_WARNING =
  'Your tickets are saved on this phone only. If you lose this phone or clear your browser, they go with it. Add your email to keep them safe.';

/** Shown before signing in over an anonymous session that holds tickets (`shouldConfirmSignIn`). */
export const SIGN_IN_ORPHAN_WARNING =
  'Tickets you bought on this phone will only stay on this phone. They will not move to the account you sign in to, and they will be lost if this browser is cleared.';

/** Live mode: Irie cannot move a paid booking yet, so it says who can. */
export const RESCHEDULE_UNAVAILABLE =
  'Moving a paid booking is not available in the app yet. Contact the operator to change the time.';

const MESSAGES: Record<FailReason, string> = {
  demo: 'Accounts are not available in this demonstration.',
  invalid_email: 'Enter a full email address, like name@example.com.',
  invalid_code: 'Enter the code from the email, using numbers only.',
  email_exists: COLLISION_MESSAGE,
  rate_limited: 'Too many codes have been sent for now. Wait a minute, then try again.',
  wrong_code: 'That code is not right. Check the email and try again.',
  // GoTrue reports a mistyped code as expired too, so this covers both.
  expired_code: 'That code has expired or is not right. Check it, or send a new one.',
  unknown_email: 'We could not find an account with that email. Check the spelling, or continue as a guest.',
  network: 'We could not reach the server. Check your connection and try again.',
  unknown: 'Something went wrong. Please try again in a moment.',
};

export function messageFor(reason: FailReason): string {
  return MESSAGES[reason] ?? MESSAGES.unknown;
}
