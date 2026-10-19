import { z } from 'zod';

/**
 * What a listing's text fields may contain.
 *
 * ## Why these exist
 *
 * They did not, anywhere. `experiences.title`, `.summary`, `.description` and `.pickup_info` are
 * plain `text` in Postgres with no constraint, no Zod schema bounded them, and the vendor form had
 * no `maxLength` — so the longest title the platform accepted was the longest string that fits in
 * a request body. The tourist app is a 390pt phone frame; a vendor who pastes a paragraph into the
 * title field gets a listing that is wrong on every surface that renders it, and nothing between
 * the keyboard and the database would have said so.
 *
 * ## Why these numbers
 *
 * The longest values in the seeded catalogue are title 35, summary 76, description 297 and pickup
 * 54 characters. Each limit below leaves several times that in headroom, so nothing existing comes
 * near one — these bound the pathological case, they are not an editorial opinion about how long a
 * good title is.
 *
 * 120 for a title is roughly where the major OTAs land, and it is about four lines of the serif
 * display face at the width the detail screen sets it.
 *
 * ## Keep these three in step
 *
 * The same numbers are enforced in `supabase/migrations/20261014000001_listing_text_limits.sql`
 * and on the inputs in `apps/vendor-web/app/listings/page.tsx`. A form that accepts what the
 * database rejects is a save button that fails for reasons the vendor cannot see, so if one moves,
 * all three move.
 */
export const LISTING_LIMITS = {
  title: 120,
  summary: 280,
  description: 2000,
  pickupInfo: 280,
  vendorDescription: 600,
} as const;

/**
 * `.trim()` before the length check, so trailing whitespace cannot be the thing that fails a save.
 * Nullable where the column is nullable — see the note on `DemoExperience`.
 *
 * ## Persist the parsed output, not the input
 *
 * Because the trim happens here and the Postgres check measures what is stored, a caller that
 * validates the raw string and then saves that same raw string has not been protected: a title of
 * exactly `LISTING_LIMITS.title` characters plus a trailing space passes this schema and violates
 * `experiences_title_length`. Write `parse`/`safeParse` output to the database.
 * `apps/vendor-web/app/listings/page.tsx` is the worked example.
 */
export const listingTextSchema = z.object({
  title: z.string().trim().min(1, 'A listing needs a title.').max(LISTING_LIMITS.title),
  summary: z.string().trim().max(LISTING_LIMITS.summary).nullable(),
  description: z.string().trim().max(LISTING_LIMITS.description).nullable(),
  pickupInfo: z.string().trim().max(LISTING_LIMITS.pickupInfo).nullable(),
});

export type ListingText = z.infer<typeof listingTextSchema>;
