import { describe, expect, it } from 'vitest';
import { decideClaim, guestTokenFromBody } from './claimGuest';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const GUEST = '22222222-2222-4222-8222-222222222222';

describe('who may claim a guest’s bookings', () => {
  it('moves from the verified guest to the verified account', () => {
    expect(decideClaim(ACCOUNT, GUEST)).toEqual({ ok: true, fromUserId: GUEST, toUserId: ACCOUNT });
  });

  it('refuses a caller with no user (the anon key alone) before looking at the guest', () => {
    expect(decideClaim(null, GUEST)).toEqual({ ok: false, status: 401 });
  });

  it('refuses when the guest token did not resolve to a user', () => {
    expect(decideClaim(ACCOUNT, null)).toEqual({ ok: false, status: 400 });
  });

  it('refuses a guest token that is the account’s own', () => {
    expect(decideClaim(ACCOUNT, ACCOUNT)).toEqual({ ok: false, status: 400 });
  });

  it('refuses an empty-string account id', () => {
    expect(decideClaim('', GUEST)).toEqual({ ok: false, status: 401 });
  });
});

describe('reading the guest token from the body', () => {
  it('returns a non-empty string', () => {
    expect(guestTokenFromBody({ guestAccessToken: 'abc' })).toBe('abc');
  });

  it.each([null, undefined, 'abc', 42, [], {}, { guestAccessToken: '' }, { guestAccessToken: 7 }])(
    'returns null for %j',
    (body) => {
      expect(guestTokenFromBody(body)).toBeNull();
    },
  );
});
