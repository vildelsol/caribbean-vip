-- Only an admin may approve a listing.
--
-- `experiences.status` is what the public read policy checks. Before 20261029000001 the vendor
-- insert and update policies covered every column, so a vendor owner could create a listing as
-- 'approved' or flip a draft to it and skip moderation. These assertions are about raised
-- exceptions from a trigger, because the rule is per-column; each refusal has a positive control
-- beside it so a guard that simply broke vendor self-service would show up here too.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table fixture (k text primary key, v uuid) on commit drop;
grant select on fixture to anon, authenticated;

do $$
declare
  owner_u uuid; staff_u uuid; admin_u uuid;
  org uuid; dest uuid; exp uuid;
begin
  insert into auth.users (email) values ('listing-owner@test.local') returning id into owner_u;
  insert into auth.users (email) values ('listing-staff@test.local') returning id into staff_u;
  insert into auth.users (email) values ('listing-admin@test.local') returning id into admin_u;
  update profiles set role = 'admin' where id = admin_u;

  select id into org from vendor_organizations
   where trading_name = '[Demo] Unverified Excursions' limit 1;
  select d.id into dest from destinations d
   join vendor_organizations o on o.island_id = d.island_id where o.id = org limit 1;
  if org is null or dest is null then
    raise exception 'fixture: expected a seeded vendor and a destination on its island';
  end if;

  insert into vendor_members (vendor_org_id, user_id, role, can_manage_listings)
  values (org, owner_u, 'vendor_owner', false), (org, staff_u, 'vendor_staff', true);

  -- Service role: no auth.uid(), so the guard stands aside, as it does for an Edge Function.
  insert into experiences (vendor_org_id, island_id, destination_id, category, title,
                           duration_minutes, currency, status)
  select org, o.island_id, dest, (enum_range(null::experience_category))[1], 'Guard fixture',
         60, 'USD', 'draft'
    from vendor_organizations o where o.id = org
  returning id into exp;

  insert into fixture values
    ('owner', owner_u), ('staff', staff_u), ('admin', admin_u), ('org', org),
    ('dest', dest), ('exp', exp);
end
$$;

set local role authenticated;

-- --------------------------------------------------------------------------
-- Creating
-- --------------------------------------------------------------------------

do $$
declare
  org  uuid := (select v from fixture where k = 'org');
  dest uuid := (select v from fixture where k = 'dest');
  n    integer;
begin
  perform test.become((select v from fixture where k = 'owner'));

  perform test.raises(
    format($q$ insert into experiences (vendor_org_id, island_id, destination_id, category, title,
                 duration_minutes, currency, status)
               select %L, island_id, %L, (enum_range(null::experience_category))[1], 'Self approved',
                 60, 'USD', 'approved' from vendor_organizations where id = %L $q$, org, dest, org),
    'a vendor cannot create a listing as approved'
  );
  perform test.raises(
    format($q$ insert into experiences (vendor_org_id, island_id, destination_id, category, title,
                 duration_minutes, currency, status)
               select %L, island_id, %L, (enum_range(null::experience_category))[1], 'Skips draft',
                 60, 'USD', 'pending_review' from vendor_organizations where id = %L $q$, org, dest, org),
    'a vendor cannot create a listing already in review'
  );

  -- Control: the same insert as a draft is what the portal does, and it must still work.
  insert into experiences (vendor_org_id, island_id, destination_id, category, title,
                           duration_minutes, currency, status)
  select org, island_id, dest, (enum_range(null::experience_category))[1], 'A draft',
         60, 'USD', 'draft' from vendor_organizations where id = org;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a vendor can still create a draft listing');
end
$$;

-- --------------------------------------------------------------------------
-- Moving a listing through review
-- --------------------------------------------------------------------------

do $$
declare
  exp uuid := (select v from fixture where k = 'exp');
  n   integer;
begin
  perform test.become((select v from fixture where k = 'owner'));

  perform test.raises(
    format($q$ update experiences set status = 'approved' where id = %L $q$, exp),
    'a vendor cannot approve a draft'
  );

  update experiences set status = 'pending_review' where id = exp;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a vendor can submit a draft for review');

  perform test.raises(
    format($q$ update experiences set status = 'approved' where id = %L $q$, exp),
    'a vendor cannot approve a listing that is in review'
  );
  perform test.raises(
    format($q$ update experiences set review_notes = 'looks fine to me' where id = %L $q$, exp),
    'a vendor cannot write review notes'
  );
  perform test.raises(
    format($q$ update experiences set reviewed_by = auth.uid(), reviewed_at = now() where id = %L $q$, exp),
    'a vendor cannot name themselves the reviewer'
  );

  update experiences set status = 'draft' where id = exp;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a vendor can withdraw a listing from review');

  -- Control: editing content without touching status or review fields must keep working.
  update experiences set title = 'Renamed by owner' where id = exp;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a vendor can still edit their listing');
end
$$;

-- A rejected or taken-down listing must not be a way round review.
do $$
declare
  exp uuid := (select v from fixture where k = 'exp');
  n   integer;
begin
  -- A service-role request carries no user, so clear the one test.become() left behind.
  set local role service_role;
  perform test.become_anon();
  update experiences set status = 'rejected' where id = exp;
  set local role authenticated;
  perform test.become((select v from fixture where k = 'owner'));

  perform test.raises(
    format($q$ update experiences set status = 'approved' where id = %L $q$, exp),
    'a vendor cannot approve a rejected listing'
  );
  update experiences set status = 'pending_review' where id = exp;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a vendor can resubmit a rejected listing');

  -- A service-role request carries no user, so clear the one test.become() left behind.
  set local role service_role;
  perform test.become_anon();
  update experiences set status = 'approved' where id = exp;
  set local role authenticated;
  perform test.become((select v from fixture where k = 'owner'));

  perform test.raises(
    format($q$ update experiences set status = 'draft' where id = %L $q$, exp),
    'a vendor cannot move a live listing straight back to draft'
  );
  update experiences set status = 'unpublished' where id = exp;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a vendor can take a live listing down');

  perform test.raises(
    format($q$ update experiences set status = 'approved' where id = %L $q$, exp),
    'a vendor cannot put a taken-down listing back live without review'
  );
  update experiences set status = 'pending_review' where id = exp;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a taken-down listing returns through review');
end
$$;

-- --------------------------------------------------------------------------
-- Staff granted can_manage_listings are held to the same rule
-- --------------------------------------------------------------------------

do $$
declare
  exp uuid := (select v from fixture where k = 'exp');
begin
  -- A service-role request carries no user, so clear the one test.become() left behind.
  set local role service_role;
  perform test.become_anon();
  update experiences set status = 'draft' where id = exp;
  set local role authenticated;
  perform test.become((select v from fixture where k = 'staff'));

  perform test.raises(
    format($q$ update experiences set status = 'approved' where id = %L $q$, exp),
    'staff granted can_manage_listings cannot approve either'
  );
end
$$;

-- --------------------------------------------------------------------------
-- Positive control: an admin can, and the stamp records who
-- --------------------------------------------------------------------------

do $$
declare
  exp      uuid := (select v from fixture where k = 'exp');
  admin_u  uuid := (select v from fixture where k = 'admin');
  n        integer;
  stored   listing_status;
  reviewer uuid;
  at_ts    timestamptz;
  notes    text;
begin
  perform test.become(admin_u);

  update experiences set status = 'approved', review_notes = 'photos and price checked'
   where id = exp;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'an admin approves the listing');

  set local role service_role;
  select status, reviewed_by, reviewed_at, review_notes
    into stored, reviewer, at_ts, notes from experiences where id = exp;

  perform test.eq(stored, 'approved'::listing_status, 'the status really changed');
  perform test.eq(reviewer, admin_u, 'reviewed_by is stamped from auth.uid(), not from the client');
  perform test.ok(at_ts is not null, 'reviewed_at is stamped');
  perform test.eq(notes, 'photos and price checked', 'the recorded reason is kept');
end
$$;

rollback;
