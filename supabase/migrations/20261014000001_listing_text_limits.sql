-- Bound the listing text columns.
--
-- `title`, `summary`, `description` and `pickup_info` were created as plain `text` with no length
-- constraint, and nothing above them bounded either: no Zod schema, no `maxLength` on the vendor
-- form. The longest title the platform accepted was whatever fit in a request body, on a product
-- whose guest app is a 390pt phone frame.
--
-- The limits match `LISTING_LIMITS` in `packages/types/src/listing.ts` and the inputs in
-- `apps/vendor-web/app/listings/page.tsx`. All three move together or the save button starts
-- failing for reasons a vendor cannot see.
--
-- The longest values in the seeded catalogue are title 35, summary 76, description 297 and pickup
-- 54, so every existing row passes with room to spare. `not valid` is deliberately NOT used: these
-- should be checked on the rows that are already here, and they are.

alter table experiences
  add constraint experiences_title_length check (char_length(title) <= 120),
  add constraint experiences_summary_length check (char_length(summary) <= 280),
  add constraint experiences_description_length check (char_length(description) <= 2000),
  add constraint experiences_pickup_info_length check (char_length(pickup_info) <= 280);

alter table vendor_organizations
  add constraint vendor_organizations_description_length check (char_length(description) <= 600);
