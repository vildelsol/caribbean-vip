import { describe, expect, it } from 'vitest';
import { isPubliclyBookable } from './listingVisibility';

/**
 * Mirrors the `experiences_public_read` RLS policy: a listing is public only if it is approved AND
 * its vendor organisation is approved. The Edge Functions use the service-role client, which skips
 * RLS, so they have to apply the same rule themselves — resolve-slot and checkout used to apply
 * none, and a draft or suspended listing could be found by title and paid for.
 */
describe('which listings a guest may book', () => {
  it('allows an approved listing from an approved vendor', () => {
    expect(isPubliclyBookable('approved', 'approved')).toBe(true);
  });

  it.each(['draft', 'pending_review', 'rejected', 'suspended', 'archived', '', null, undefined])(
    'refuses a listing whose status is %j',
    (status) => {
      expect(isPubliclyBookable(status, 'approved')).toBe(false);
    },
  );

  it.each(['pending', 'suspended', 'rejected', '', null, undefined])(
    'refuses an approved listing whose vendor status is %j',
    (vendor) => {
      expect(isPubliclyBookable('approved', vendor)).toBe(false);
    },
  );

  it('is case-sensitive, like the enum it mirrors', () => {
    expect(isPubliclyBookable('Approved', 'approved')).toBe(false);
  });
});
