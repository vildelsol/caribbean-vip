import type { UserRole } from '@cvip/types';

/**
 * The listing-write permission, client side.
 *
 * This is the mirror of `is_vendor_listing_manager(org_id)` in
 * `supabase/migrations/20261019000001_listings_rls_can_manage.sql`. The database is the
 * authority — this copy exists so the portal does not offer a control the policy will refuse.
 * The two definitions must stay in step; if the migration's helper changes, change this.
 *
 * An owner counts as a manager regardless of the column. `can_manage_listings` defaults to
 * false, so a strict reading of the flag would lock an owner out of their own inventory.
 *
 * Read is deliberately not gated. RLS leaves SELECT open to any member of the organisation
 * because scan-only staff still need to see what they are scanning, so the listing list and the
 * availability calendar render for everyone and only the write controls are withheld.
 */
export function isListingManager(
  membership: { role: UserRole; can_manage_listings: boolean } | null,
): boolean {
  if (!membership) return false;
  return membership.role === 'vendor_owner' || membership.can_manage_listings;
}

/**
 * What an ungranted member is told when a write is refused.
 *
 * The write paths throw this rather than letting the request reach RLS and come back as a
 * policy error, and the pages disable their controls with the same words, so the explanation an
 * operator reads is the same whichever way they arrive at it.
 */
export const NO_LISTING_PERMISSION =
  'You do not have permission to change listings. Ask an owner at your organisation to grant it.';
