import { z } from 'zod';
import { LISTING_LIMITS } from './listing.ts';

/**
 * What a vendor's onboarding application may contain.
 *
 * ## Why these exist
 *
 * `apps/vendor-web/app/onboarding/page.tsx` collected businessName, contactName, phone, island and
 * businessType, slept 800ms and routed to /billing. Every field was discarded, so there was nothing
 * to validate and no schema bounded any of them. Two of the five had no column to be stored in
 * either — `contact_name` and `business_type` are added by
 * `supabase/migrations/20261020000001_vendor_onboarding.sql`.
 *
 * ## Keep these three in step
 *
 * Same contract as `LISTING_LIMITS`: the numbers below are enforced by the check constraints in
 * that migration and by `maxLength` on the onboarding inputs. A form that accepts what the database
 * rejects is a submit button that fails for reasons the applicant cannot see, so if one moves, all
 * three move. `description` deliberately reuses `LISTING_LIMITS.vendorDescription` rather than
 * restating 600 — it is the same column, already bounded, and a second copy of the number is a
 * second thing to forget.
 */
export const VENDOR_LIMITS = {
  businessName: 120,
  contactName: 120,
  phone: 40,
} as const;

/**
 * The business categories onboarding offers.
 *
 * Not `EXPERIENCE_CATEGORIES`: that enum classifies a single listing for guest-facing discovery
 * ('waterfalls', 'nightlife'), while this describes the operator. A restaurant that also runs a
 * boat trip is one business of type 'food' with listings in several categories, so collapsing the
 * two would make the vendor's own type change whenever their catalogue did.
 *
 * Mirrored by the `vendor_organizations_business_type` check constraint. Text with a check rather
 * than a Postgres enum, because this taxonomy is marketing copy that will be re-cut and an enum
 * value can never be removed.
 */
export const VENDOR_BUSINESS_TYPE_IDS = [
  'tour',
  'food',
  'wellness',
  'water',
  'culture',
  'transport',
  'retail',
  'other',
] as const;

export type VendorBusinessType = (typeof VENDOR_BUSINESS_TYPE_IDS)[number];
export const vendorBusinessTypeSchema = z.enum(VENDOR_BUSINESS_TYPE_IDS);

/** The same ids with their guest-facing labels, for the onboarding select. */
export const VENDOR_BUSINESS_TYPES: ReadonlyArray<{ id: VendorBusinessType; label: string }> = [
  { id: 'tour',      label: 'Tours & Excursions' },
  { id: 'food',      label: 'Restaurant / Food & Drink' },
  { id: 'wellness',  label: 'Wellness & Spa' },
  { id: 'water',     label: 'Water Sports' },
  { id: 'culture',   label: 'Cultural Experience' },
  { id: 'transport', label: 'Transportation' },
  { id: 'retail',    label: 'Retail / Shopping' },
  { id: 'other',     label: 'Other' },
];

/**
 * `.trim()` before every length check, and the parsed output is what must be persisted — the
 * Postgres checks measure what is stored, so a name of exactly 120 characters plus a trailing
 * space passes this schema and violates `vendor_organizations_trading_name_length`. The
 * `not_blank` constraints are the mirror of `.min(1)` here: `char_length('   ') <= 120` is true,
 * so without the trim a whitespace-only business name would be storable.
 *
 * `islandId` is a uuid rather than one of the form's old slugs. `vendor_organizations.island_id` is
 * a not-null FK to `islands`, and the hardcoded list on the page offered ten islands of which only
 * four exist — a vendor who picked St. Lucia could not have been stored at all.
 *
 * `description` is nullable because the column is and the field is optional; blank must reach the
 * database as null, not '', or the portal cannot tell "no blurb yet" from an empty one.
 */
export const vendorApplicationSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, 'Enter your business name.')
    .max(VENDOR_LIMITS.businessName),
  contactName: z
    .string()
    .trim()
    .min(1, 'Enter the name of the primary contact.')
    .max(VENDOR_LIMITS.contactName),
  phone: z
    .string()
    .trim()
    .min(1, 'Enter a phone number we can reach you on.')
    .max(VENDOR_LIMITS.phone),
  islandId: z.string().uuid('Select the island you trade in.'),
  businessType: vendorBusinessTypeSchema,
  description: z.string().trim().max(LISTING_LIMITS.vendorDescription).nullable(),
});

export type VendorApplication = z.infer<typeof vendorApplicationSchema>;
