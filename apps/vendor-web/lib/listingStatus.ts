/**
 * Listing review status, as the vendor portal sees it.
 *
 * Pure and import-free so the transition table can be tested without a backend. The live table is
 * `guard_listing_review_fields()` in `supabase/migrations/20261029000001_guard_listing_review_fields.sql`;
 * `vendorMayMove` restates it, and the database is the authority. If one changes, change both and
 * the cases in `listingStatus.test.ts` and `supabase/tests/listing_review.test.sql`.
 */

export type ListingStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'unpublished';

const STATUSES: readonly ListingStatus[] = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'unpublished',
];

/** An unknown value reads as a draft: the safe reading, since a draft is never public. */
export function parseListingStatus(value: string): ListingStatus {
  return (STATUSES as readonly string[]).includes(value) ? (value as ListingStatus) : 'draft';
}

/** Moves a vendor may make live. Anything to or from 'approved' by review is an admin's. */
const VENDOR_MOVES: ReadonlySet<string> = new Set([
  'draft>pending_review',
  'rejected>pending_review',
  'pending_review>draft',
  'rejected>draft',
  'approved>unpublished',
  'unpublished>pending_review',
  'unpublished>draft',
]);

export function vendorMayMove(from: ListingStatus, to: ListingStatus): boolean {
  return VENDOR_MOVES.has(`${from}>${to}`);
}

export interface StatusView {
  label: string;
  pillClass: string;
}

export function statusView(status: ListingStatus): StatusView {
  switch (status) {
    case 'approved':
      return { label: 'Live', pillClass: 'pill--live' };
    case 'pending_review':
      return { label: 'In review', pillClass: 'pill--review' };
    case 'rejected':
      return { label: 'Needs changes', pillClass: 'pill--attention' };
    case 'unpublished':
      return { label: 'Unpublished', pillClass: 'pill--draft' };
    default:
      return { label: 'Draft', pillClass: 'pill--draft' };
  }
}

export interface ListingAction {
  label: string;
  to: ListingStatus;
  /** True for the move that takes a listing down, so the page can style it quietly. */
  quiet: boolean;
}

/**
 * The one button a listing row offers.
 *
 * Demo mode has no moderation queue, so there Publish still publishes and Unpublish goes back to
 * draft, as it always did. Live, nothing a vendor presses can produce 'approved'.
 */
export function listingAction(status: ListingStatus, demo: boolean): ListingAction | null {
  if (demo) {
    return status === 'approved'
      ? { label: 'Unpublish', to: 'draft', quiet: true }
      : { label: 'Publish', to: 'approved', quiet: false };
  }
  switch (status) {
    case 'draft':
      return { label: 'Submit for review', to: 'pending_review', quiet: false };
    case 'rejected':
      return { label: 'Resubmit', to: 'pending_review', quiet: false };
    case 'unpublished':
      return { label: 'Resubmit for review', to: 'pending_review', quiet: false };
    case 'pending_review':
      return { label: 'Withdraw', to: 'draft', quiet: true };
    case 'approved':
      return { label: 'Unpublish', to: 'unpublished', quiet: true };
  }
}
