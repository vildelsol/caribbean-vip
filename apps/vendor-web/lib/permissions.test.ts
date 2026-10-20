import { describe, expect, it } from 'vitest';
import { isListingManager } from './permissions';

/**
 * `isListingManager` is the client mirror of `is_vendor_listing_manager(org_id)` in
 * `supabase/migrations/20261019000001_listings_rls_can_manage.sql`. These cases are the
 * migration's cases: if a change here needs them edited, the policy needs the same change.
 */
describe('isListingManager', () => {
  it('grants an owner whatever the column says', () => {
    // The column defaults to false, so a strict reading of it would lock an owner out of their
    // own inventory. This case is the reason the role is checked first.
    expect(isListingManager({ role: 'vendor_owner', can_manage_listings: false })).toBe(true);
    expect(isListingManager({ role: 'vendor_owner', can_manage_listings: true })).toBe(true);
  });

  it('grants staff only when the column is set', () => {
    expect(isListingManager({ role: 'vendor_staff', can_manage_listings: true })).toBe(true);
    expect(isListingManager({ role: 'vendor_staff', can_manage_listings: false })).toBe(false);
  });

  it('refuses with no membership in scope', () => {
    expect(isListingManager(null)).toBe(false);
  });
});
