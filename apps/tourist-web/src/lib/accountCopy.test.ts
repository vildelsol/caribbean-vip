import { describe, expect, it } from 'vitest';
import { COLLISION_MESSAGE, LOSS_WARNING, RESCHEDULE_UNAVAILABLE, SIGN_IN_ORPHAN_WARNING, messageFor } from './accountCopy';
import type { FailReason } from './account';

const REASONS: FailReason[] = [
  'demo',
  'invalid_email',
  'invalid_code',
  'email_exists',
  'rate_limited',
  'wrong_code',
  'expired_code',
  'unknown_email',
  'network',
  'unknown',
];

describe('account copy', () => {
  it.each(REASONS)('%s has a plain, complete sentence', (reason) => {
    const text = messageFor(reason);
    expect(text.length).toBeGreaterThan(10);
    expect(text).toMatch(/[.]$/);
    // Calm copy: no shouting, no exclamation marks, no raw error codes leaking through.
    expect(text).not.toMatch(/!/);
    expect(text).not.toMatch(/_/);
  });

  it('the collision message is the agreed wording', () => {
    expect(COLLISION_MESSAGE).toBe(
      'This email already has an account. Sign in to it. Bookings made on this phone stay on this phone.',
    );
    expect(messageFor('email_exists')).toBe(COLLISION_MESSAGE);
  });

  it('the loss warning names both ways tickets are lost', () => {
    expect(LOSS_WARNING).toMatch(/lose this phone/i);
    expect(LOSS_WARNING).toMatch(/clear/i);
    expect(LOSS_WARNING).toMatch(/email/i);
  });

  it('an unexpected reason still gets the generic message', () => {
    expect(messageFor('something_else' as FailReason)).toBe(messageFor('unknown'));
  });

  it('the sign-in warning says the tickets move, and stay on this phone only if the move fails', () => {
    expect(SIGN_IN_ORPHAN_WARNING).toMatch(/this phone/i);
    expect(SIGN_IN_ORPHAN_WARNING).toMatch(/clear/i);
    expect(SIGN_IN_ORPHAN_WARNING).not.toMatch(/!/);
  });

  it('the live reschedule notice points the guest to the operator', () => {
    expect(RESCHEDULE_UNAVAILABLE).toMatch(/operator/i);
    expect(RESCHEDULE_UNAVAILABLE).toMatch(/[.]$/);
  });
});
