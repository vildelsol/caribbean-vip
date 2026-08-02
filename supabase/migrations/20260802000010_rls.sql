-- M1 · Row Level Security
--
-- PRD §14: "Enforce Row Level Security for every user-accessible Supabase table."
--
-- AD-10 is the load-bearing idea here: public visibility is a POLICY, not a query convention. A
-- developer who forgets `.eq('status','approved')` still cannot leak a draft listing, because the
-- `anon` policy joins through to the vendor's approval status. T-03 and V-02 are therefore
-- properties of the database rather than promises about application code.

-- --------------------------------------------------------------------------
-- Enable RLS everywhere. The test suite fails if any public table is missing.
-- --------------------------------------------------------------------------

alter table islands                enable row level security;
alter table destinations           enable row level security;
alter table profiles               enable row level security;
alter table vendor_organizations   enable row level security;
alter table vendor_members         enable row level security;
alter table vendor_locations       enable row level security;
alter table vendor_documents       enable row level security;
alter table experiences            enable row level security;
alter table experience_media       enable row level security;
alter table experience_options     enable row level security;
alter table availability_slots     enable row level security;
alter table promotions             enable row level security;
alter table promotion_experiences  enable row level security;
alter table geofences              enable row level security;
alter table promotion_impressions  enable row level security;
alter table saved_items            enable row level security;
alter table trips                  enable row level security;
alter table trip_items             enable row level security;
alter table bookings               enable row level security;
alter table booking_guests         enable row level security;
alter table payments               enable row level security;
alter table vouchers               enable row level security;
alter table voucher_redemptions    enable row level security;
alter table notifications          enable row level security;
alter table reviews                enable row level security;
alter table ai_conversations       enable row level security;
alter table audit_logs             enable row level security;
alter table platform_settings      enable row level security;
alter table rate_limit_events      enable row level security;

-- --------------------------------------------------------------------------
-- Geography — public reference data
-- --------------------------------------------------------------------------

create policy islands_public_read on islands
  for select to anon, authenticated
  using (is_active);

create policy islands_admin_all on islands
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy destinations_public_read on destinations
  for select to anon, authenticated
  using (is_active and exists (
    select 1 from islands i where i.id = destinations.island_id and i.is_active
  ));

create policy destinations_admin_all on destinations
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- --------------------------------------------------------------------------
-- profiles — "Can access only own records" (PRD §4)
-- --------------------------------------------------------------------------

create policy profiles_self_read on profiles
  for select to authenticated
  using (id = auth.uid() or is_admin());

create policy profiles_self_update on profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Deliberately no self-insert policy: profiles are created by the handle_new_user() trigger.
create policy profiles_admin_all on profiles
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- --------------------------------------------------------------------------
-- Vendors
-- --------------------------------------------------------------------------
--
-- Approved vendors are publicly readable so a listing can show who runs it. Everything about an
-- unapproved vendor — including that it applied — is private to its members and admins.

create policy vendor_orgs_public_read on vendor_organizations
  for select to anon, authenticated
  using (status = 'approved');

create policy vendor_orgs_member_read on vendor_organizations
  for select to authenticated
  using (is_vendor_member(id) or is_admin());

create policy vendor_orgs_owner_update on vendor_organizations
  for update to authenticated
  using (is_vendor_owner(id)) with check (is_vendor_owner(id));

create policy vendor_orgs_insert on vendor_organizations
  for insert to authenticated
  with check (auth.uid() is not null);

create policy vendor_orgs_admin_all on vendor_organizations
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy vendor_members_read on vendor_members
  for select to authenticated
  using (user_id = auth.uid() or is_vendor_member(vendor_org_id) or is_admin());

create policy vendor_members_owner_manage on vendor_members
  for all to authenticated
  using (is_vendor_owner(vendor_org_id) or is_admin())
  with check (is_vendor_owner(vendor_org_id) or is_admin());

create policy vendor_locations_public_read on vendor_locations
  for select to anon, authenticated
  using (exists (
    select 1 from vendor_organizations o
    where o.id = vendor_locations.vendor_org_id and o.status = 'approved'
  ));

create policy vendor_locations_member_all on vendor_locations
  for all to authenticated
  using (is_vendor_member(vendor_org_id) or is_admin())
  with check (is_vendor_member(vendor_org_id) or is_admin());

-- Onboarding evidence is never public, not even for an approved vendor.
create policy vendor_documents_member_read on vendor_documents
  for select to authenticated
  using (is_vendor_member(vendor_org_id) or is_admin());

create policy vendor_documents_member_write on vendor_documents
  for insert to authenticated
  with check (is_vendor_member(vendor_org_id));

create policy vendor_documents_admin_all on vendor_documents
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- --------------------------------------------------------------------------
-- Inventory — AD-10, T-03, V-02
-- --------------------------------------------------------------------------
--
-- Both conditions are required: the listing is approved AND its vendor is approved. A suspended
-- vendor's previously-approved listings disappear from public view immediately, with no batch job.

create policy experiences_public_read on experiences
  for select to anon, authenticated
  using (
    status = 'approved'
    and exists (
      select 1 from vendor_organizations o
      where o.id = experiences.vendor_org_id and o.status = 'approved'
    )
  );

create policy experiences_vendor_all on experiences
  for all to authenticated
  using (is_vendor_member(vendor_org_id) or is_admin())
  with check (is_vendor_member(vendor_org_id) or is_admin());

-- Child tables inherit visibility from the parent listing, so media and prices for a draft
-- listing are not readable even by direct id.
create policy experience_media_public_read on experience_media
  for select to anon, authenticated
  using (exists (
    select 1 from experiences e
    join vendor_organizations o on o.id = e.vendor_org_id
    where e.id = experience_media.experience_id
      and e.status = 'approved' and o.status = 'approved'
  ));

create policy experience_media_vendor_all on experience_media
  for all to authenticated
  using (exists (
    select 1 from experiences e
    where e.id = experience_media.experience_id
      and (is_vendor_member(e.vendor_org_id) or is_admin())
  ))
  with check (exists (
    select 1 from experiences e
    where e.id = experience_media.experience_id
      and (is_vendor_member(e.vendor_org_id) or is_admin())
  ));

create policy experience_options_public_read on experience_options
  for select to anon, authenticated
  using (is_active and exists (
    select 1 from experiences e
    join vendor_organizations o on o.id = e.vendor_org_id
    where e.id = experience_options.experience_id
      and e.status = 'approved' and o.status = 'approved'
  ));

create policy experience_options_vendor_all on experience_options
  for all to authenticated
  using (exists (
    select 1 from experiences e
    where e.id = experience_options.experience_id
      and (is_vendor_member(e.vendor_org_id) or is_admin())
  ))
  with check (exists (
    select 1 from experiences e
    where e.id = experience_options.experience_id
      and (is_vendor_member(e.vendor_org_id) or is_admin())
  ));

create policy availability_slots_public_read on availability_slots
  for select to anon, authenticated
  using (status = 'open' and exists (
    select 1 from experiences e
    join vendor_organizations o on o.id = e.vendor_org_id
    where e.id = availability_slots.experience_id
      and e.status = 'approved' and o.status = 'approved'
  ));

create policy availability_slots_vendor_all on availability_slots
  for all to authenticated
  using (exists (
    select 1 from experiences e
    where e.id = availability_slots.experience_id
      and (is_vendor_member(e.vendor_org_id) or is_admin())
  ))
  with check (exists (
    select 1 from experiences e
    where e.id = availability_slots.experience_id
      and (is_vendor_member(e.vendor_org_id) or is_admin())
  ));

-- --------------------------------------------------------------------------
-- Promotions
-- --------------------------------------------------------------------------
--
-- An approved, in-window offer is publicly readable. An expired or pending one is not, so a
-- client cannot enumerate offers that are not currently claimable.

create policy promotions_public_read on promotions
  for select to anon, authenticated
  using (
    approval_state = 'approved'
    and now() between starts_at and ends_at
    and exists (
      select 1 from vendor_organizations o
      where o.id = promotions.vendor_org_id and o.status = 'approved'
    )
  );

create policy promotions_vendor_all on promotions
  for all to authenticated
  using (is_vendor_member(vendor_org_id) or is_admin())
  with check (is_vendor_member(vendor_org_id) or is_admin());

create policy promotion_experiences_public_read on promotion_experiences
  for select to anon, authenticated
  using (exists (
    select 1 from promotions p
    where p.id = promotion_experiences.promotion_id and p.approval_state = 'approved'
  ));

create policy promotion_experiences_vendor_all on promotion_experiences
  for all to authenticated
  using (exists (
    select 1 from promotions p
    where p.id = promotion_experiences.promotion_id
      and (is_vendor_member(p.vendor_org_id) or is_admin())
  ))
  with check (exists (
    select 1 from promotions p
    where p.id = promotion_experiences.promotion_id
      and (is_vendor_member(p.vendor_org_id) or is_admin())
  ));

-- Geofence coordinates and radii are NOT public. Exposing them would let anyone map every
-- trigger zone and farm offers without visiting. Eligibility is evaluated server-side.
create policy geofences_vendor_all on geofences
  for all to authenticated
  using (exists (
    select 1 from promotions p
    where p.id = geofences.promotion_id
      and (is_vendor_member(p.vendor_org_id) or is_admin())
  ))
  with check (exists (
    select 1 from promotions p
    where p.id = geofences.promotion_id
      and (is_vendor_member(p.vendor_org_id) or is_admin())
  ));

create policy promotion_impressions_self_read on promotion_impressions
  for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- --------------------------------------------------------------------------
-- Tourist-owned data — "Can access only own records" (PRD §4)
-- --------------------------------------------------------------------------

create policy saved_items_self_all on saved_items
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy trips_self_all on trips
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy trip_items_self_all on trip_items
  for all to authenticated
  using (exists (select 1 from trips t where t.id = trip_items.trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from trips t where t.id = trip_items.trip_id and t.user_id = auth.uid()));

-- The tourist owns it; the fulfilling vendor can see it operationally (PRD §6: "View upcoming
-- bookings and guest counts"); admins can see everything (PRD §7).
create policy bookings_self_read on bookings
  for select to authenticated
  using (user_id = auth.uid() or is_vendor_member(vendor_org_id) or is_admin());

-- No insert/update policy for tourists: bookings are written by the checkout Edge Function under
-- the service role, after a server-side price calculation. A client cannot create its own booking.
create policy bookings_admin_write on bookings
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy booking_guests_read on booking_guests
  for select to authenticated
  using (exists (
    select 1 from bookings b
    where b.id = booking_guests.booking_id
      and (b.user_id = auth.uid() or is_vendor_member(b.vendor_org_id) or is_admin())
  ));

-- Payment rows are visible to the payer and to admins only. A vendor sees its earnings through
-- the booking's fee columns, not through the customer's Stripe references.
create policy payments_self_read on payments
  for select to authenticated
  using (exists (
    select 1 from bookings b
    where b.id = payments.booking_id and (b.user_id = auth.uid() or is_admin())
  ));

create policy notifications_self_all on notifications
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy ai_conversations_self_all on ai_conversations
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- Vouchers
-- --------------------------------------------------------------------------
--
-- The holder sees their own; the vendor sees vouchers issued against it, which is what the
-- scanner needs. token_hash is a hash, so vendor visibility does not expose a usable credential.

create policy vouchers_self_read on vouchers
  for select to authenticated
  using (user_id = auth.uid() or is_vendor_member(vendor_org_id) or is_admin());

create policy vouchers_admin_write on vouchers
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- Read-only for everyone. There is deliberately NO insert, update or delete policy: redemptions
-- are written only by redeem_voucher() (SECURITY DEFINER), and the append-only trigger blocks
-- mutation even for the table owner.
create policy voucher_redemptions_read on voucher_redemptions
  for select to authenticated
  using (is_vendor_member(vendor_org_id) or is_admin());

-- --------------------------------------------------------------------------
-- Reviews — PRD §12 verified-booking reviews
-- --------------------------------------------------------------------------

create policy reviews_public_read on reviews
  for select to anon, authenticated
  using (moderation_state = 'published');

create policy reviews_self_read on reviews
  for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- A review requires a confirmed or completed booking that belongs to the reviewer. Enforced in
-- the WITH CHECK so a fabricated review cannot be inserted at all.
create policy reviews_self_write on reviews
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from bookings b
      where b.id = reviews.booking_id
        and b.user_id = auth.uid()
        and b.status in ('confirmed', 'completed')
    )
  );

create policy reviews_admin_all on reviews
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- --------------------------------------------------------------------------
-- Platform tables
-- --------------------------------------------------------------------------

-- Read-only for admins; no write policy at all. Log integrity beats convenience.
create policy audit_logs_admin_read on audit_logs
  for select to authenticated
  using (is_admin());

-- Fee and tax rates are readable by signed-in users so a client can render a breakdown, but the
-- authoritative calculation is still server-side (AD-06).
create policy platform_settings_read on platform_settings
  for select to authenticated
  using (true);

-- PRD §4: super admin manages "fee rules, security settings and sensitive operational controls".
create policy platform_settings_super_admin_write on platform_settings
  for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- Written by Edge Functions under the service role; nobody may read their own limit state.
create policy rate_limit_events_admin_read on rate_limit_events
  for select to authenticated
  using (is_admin());
