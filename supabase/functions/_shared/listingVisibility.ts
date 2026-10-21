/**
 * Whether a guest may find and book a listing.
 *
 * Mirrors the `experiences_public_read` RLS policy (0010_rls.sql): the listing is `approved` AND its
 * vendor organisation is `approved`, so suspending a vendor withdraws all its listings at once.
 * The Edge Functions read with the service-role client, which skips RLS, so they must apply the
 * rule themselves. Pure and in its own file for the same reason as `returnUrls.ts`.
 */
export function isPubliclyBookable(
  listingStatus: string | null | undefined,
  vendorStatus: string | null | undefined,
): boolean {
  return listingStatus === 'approved' && vendorStatus === 'approved';
}
