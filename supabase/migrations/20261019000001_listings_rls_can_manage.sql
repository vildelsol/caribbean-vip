-- Enforce vendor_members.can_manage_listings in RLS.
--
-- PRD §4: "vendor staff have no access to payout or account ownership settings unless granted."
-- The column has existed since 20260802000003_vendors.sql and the vendor portal selects it in
-- lib/session.tsx, but no policy ever read it: every `*_vendor_all` policy below authorised writes
-- on `is_vendor_member()` alone, so any vendor_staff row could create, edit and delete its
-- organisation's listings. The flag was collected and discarded.
--
-- Two choices are load-bearing here:
--
-- 1. READ stays member-wide. The old policies were `for all`, so they also governed SELECT.
--    Gating the whole policy on the flag would stop a scan-only staff member from seeing their own
--    organisation's draft listings, which the portal needs. Read and write are therefore split.
--
-- 2. A vendor_owner always manages listings. `can_manage_listings` defaults to false, so requiring
--    the flag outright would lock an owner out of their own inventory the moment a membership row
--    is created without it. Ownership implies the grant; the flag only ever widens staff.
--
-- Scope is listings and their children. `promotions` keeps `is_vendor_member()` because no
-- corresponding permission column exists for it — see OD/open-decisions before widening this.

-- --------------------------------------------------------------------------
-- Helper
-- --------------------------------------------------------------------------
--
-- Named for the question it answers, not for the column, so the column reference inside the body
-- stays unambiguous.

create or replace function is_vendor_listing_manager(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from vendor_members m
    where m.vendor_org_id = org_id
      and m.user_id = auth.uid()
      and (m.role = 'vendor_owner' or m.can_manage_listings)
  );
$$;

comment on function is_vendor_listing_manager(uuid) is
  'True when the current user may write the org''s listings: owner, or staff granted can_manage_listings.';

-- --------------------------------------------------------------------------
-- experiences
-- --------------------------------------------------------------------------

drop policy experiences_vendor_all on experiences;

create policy experiences_vendor_read on experiences
  for select to authenticated
  using (is_vendor_member(vendor_org_id) or is_admin());

create policy experiences_vendor_insert on experiences
  for insert to authenticated
  with check (is_vendor_listing_manager(vendor_org_id) or is_admin());

create policy experiences_vendor_update on experiences
  for update to authenticated
  using (is_vendor_listing_manager(vendor_org_id) or is_admin())
  with check (is_vendor_listing_manager(vendor_org_id) or is_admin());

create policy experiences_vendor_delete on experiences
  for delete to authenticated
  using (is_vendor_listing_manager(vendor_org_id) or is_admin());

-- --------------------------------------------------------------------------
-- experience_media
-- --------------------------------------------------------------------------

drop policy experience_media_vendor_all on experience_media;

create policy experience_media_vendor_read on experience_media
  for select to authenticated
  using (exists (
    select 1 from experiences e
    where e.id = experience_media.experience_id
      and (is_vendor_member(e.vendor_org_id) or is_admin())
  ));

create policy experience_media_vendor_insert on experience_media
  for insert to authenticated
  with check (exists (
    select 1 from experiences e
    where e.id = experience_media.experience_id
      and (is_vendor_listing_manager(e.vendor_org_id) or is_admin())
  ));

create policy experience_media_vendor_update on experience_media
  for update to authenticated
  using (exists (
    select 1 from experiences e
    where e.id = experience_media.experience_id
      and (is_vendor_listing_manager(e.vendor_org_id) or is_admin())
  ))
  with check (exists (
    select 1 from experiences e
    where e.id = experience_media.experience_id
      and (is_vendor_listing_manager(e.vendor_org_id) or is_admin())
  ));

create policy experience_media_vendor_delete on experience_media
  for delete to authenticated
  using (exists (
    select 1 from experiences e
    where e.id = experience_media.experience_id
      and (is_vendor_listing_manager(e.vendor_org_id) or is_admin())
  ));

-- --------------------------------------------------------------------------
-- experience_options
-- --------------------------------------------------------------------------

drop policy experience_options_vendor_all on experience_options;

create policy experience_options_vendor_read on experience_options
  for select to authenticated
  using (exists (
    select 1 from experiences e
    where e.id = experience_options.experience_id
      and (is_vendor_member(e.vendor_org_id) or is_admin())
  ));

create policy experience_options_vendor_insert on experience_options
  for insert to authenticated
  with check (exists (
    select 1 from experiences e
    where e.id = experience_options.experience_id
      and (is_vendor_listing_manager(e.vendor_org_id) or is_admin())
  ));

create policy experience_options_vendor_update on experience_options
  for update to authenticated
  using (exists (
    select 1 from experiences e
    where e.id = experience_options.experience_id
      and (is_vendor_listing_manager(e.vendor_org_id) or is_admin())
  ))
  with check (exists (
    select 1 from experiences e
    where e.id = experience_options.experience_id
      and (is_vendor_listing_manager(e.vendor_org_id) or is_admin())
  ));

create policy experience_options_vendor_delete on experience_options
  for delete to authenticated
  using (exists (
    select 1 from experiences e
    where e.id = experience_options.experience_id
      and (is_vendor_listing_manager(e.vendor_org_id) or is_admin())
  ));

-- --------------------------------------------------------------------------
-- availability_slots
-- --------------------------------------------------------------------------

drop policy availability_slots_vendor_all on availability_slots;

create policy availability_slots_vendor_read on availability_slots
  for select to authenticated
  using (exists (
    select 1 from experiences e
    where e.id = availability_slots.experience_id
      and (is_vendor_member(e.vendor_org_id) or is_admin())
  ));

create policy availability_slots_vendor_insert on availability_slots
  for insert to authenticated
  with check (exists (
    select 1 from experiences e
    where e.id = availability_slots.experience_id
      and (is_vendor_listing_manager(e.vendor_org_id) or is_admin())
  ));

create policy availability_slots_vendor_update on availability_slots
  for update to authenticated
  using (exists (
    select 1 from experiences e
    where e.id = availability_slots.experience_id
      and (is_vendor_listing_manager(e.vendor_org_id) or is_admin())
  ))
  with check (exists (
    select 1 from experiences e
    where e.id = availability_slots.experience_id
      and (is_vendor_listing_manager(e.vendor_org_id) or is_admin())
  ));

create policy availability_slots_vendor_delete on availability_slots
  for delete to authenticated
  using (exists (
    select 1 from experiences e
    where e.id = availability_slots.experience_id
      and (is_vendor_listing_manager(e.vendor_org_id) or is_admin())
  ));
