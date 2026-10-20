-- Only an admin may move a vendor's review state.
--
-- `vendor_organizations.status` is the gate every public RLS policy reads, so whoever can write it
-- decides what the marketplace shows. `vendor_orgs_owner_update` grants an owner UPDATE on their
-- own organisation row, and RLS has no column-level control, so before
-- 20261020000002 that policy covered `status` too and a vendor could approve itself. Onboarding
-- makes the applicant a `vendor_owner`, so that was reachable by anyone who signed up.
--
-- The guard is a trigger, not a policy, because the rule is per-column. These assertions are
-- therefore about a raised exception, not about row counts — unlike an RLS refusal on UPDATE,
-- which is silent.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table fixture (k text primary key, v uuid) on commit drop;
grant select on fixture to anon, authenticated;

do $$
declare
  owner_u uuid; staff_u uuid; admin_u uuid; outsider uuid;
  org uuid;
begin
  insert into auth.users (email) values ('review-owner@test.local')    returning id into owner_u;
  insert into auth.users (email) values ('review-staff@test.local')    returning id into staff_u;
  insert into auth.users (email) values ('review-admin@test.local')    returning id into admin_u;
  insert into auth.users (email) values ('review-outsider@test.local') returning id into outsider;

  update profiles set role = 'admin' where id = admin_u;

  select id into org from vendor_organizations
   where trading_name = '[Demo] Unverified Excursions' limit 1;
  if org is null then
    raise exception 'fixture: expected an unapproved seeded vendor';
  end if;

  update vendor_organizations set status = 'pending_review' where id = org;

  insert into vendor_members (vendor_org_id, user_id, role)
  values (org, owner_u, 'vendor_owner'), (org, staff_u, 'vendor_staff');

  insert into fixture values
    ('owner', owner_u), ('staff', staff_u), ('admin', admin_u),
    ('outsider', outsider), ('org', org);
end
$$;

set local role authenticated;

-- --------------------------------------------------------------------------
-- The regression: a vendor cannot approve itself
-- --------------------------------------------------------------------------

do $$
declare
  org uuid := (select v from fixture where k = 'org');
  stored vendor_status;
begin
  perform test.become((select v from fixture where k = 'owner'));

  perform test.raises(
    format($q$ update vendor_organizations set status = 'approved' where id = %L $q$, org),
    'a vendor owner cannot approve their own organisation'
  );
  perform test.raises(
    format($q$ update vendor_organizations set review_notes = 'looks fine to me' where id = %L $q$, org),
    'a vendor owner cannot write their own review notes'
  );
  perform test.raises(
    format($q$ update vendor_organizations set reviewed_by = auth.uid() where id = %L $q$, org),
    'a vendor owner cannot name themselves the reviewer'
  );

  set local role service_role;
  select status into stored from vendor_organizations where id = org;
  perform test.eq(stored, 'pending_review'::vendor_status, 'the status is genuinely unchanged');
  set local role authenticated;
end
$$;

-- An owner must still be able to edit the fields the policy exists to let them edit, or the guard
-- has simply broken vendor self-service instead of securing it.
do $$
declare
  org uuid := (select v from fixture where k = 'org');
  affected integer;
begin
  perform test.become((select v from fixture where k = 'owner'));

  update vendor_organizations set trading_name = 'Renamed By Owner' where id = org;
  get diagnostics affected = row_count;
  perform test.eq(affected, 1, 'an owner can still rename their own organisation');
end
$$;

-- --------------------------------------------------------------------------
-- Staff and outsiders
-- --------------------------------------------------------------------------

do $$
declare
  org uuid := (select v from fixture where k = 'org');
  affected integer;
begin
  -- Staff and outsiders are both stopped EARLIER than the trigger, and silently. Only
  -- `vendor_orgs_owner_update` grants UPDATE on this table to a non-admin, and it requires
  -- is_vendor_owner, so for anyone else the row is invisible to the statement: it succeeds and
  -- reports zero rows, and the trigger never runs. Asserting a raised error here would fail even
  -- though nothing was written — which is why these two check the row count instead.
  perform test.become((select v from fixture where k = 'staff'));
  update vendor_organizations set status = 'approved' where id = org;
  get diagnostics affected = row_count;
  perform test.eq(affected, 0, 'vendor staff update no vendor rows at all');

  perform test.become((select v from fixture where k = 'outsider'));
  update vendor_organizations set status = 'approved' where id = org;
  get diagnostics affected = row_count;
  perform test.eq(affected, 0, 'a stranger updates no vendor rows at all');
end
$$;

-- --------------------------------------------------------------------------
-- Positive control: an admin can, and the stamp records who
-- --------------------------------------------------------------------------

do $$
declare
  org      uuid := (select v from fixture where k = 'org');
  admin_u  uuid := (select v from fixture where k = 'admin');
  affected integer;
  stored   vendor_status;
  reviewer uuid;
  at_ts    timestamptz;
  notes    text;
begin
  perform test.become(admin_u);

  update vendor_organizations
     set status = 'approved', review_notes = 'documents verified'
   where id = org;
  get diagnostics affected = row_count;
  perform test.eq(affected, 1, 'an admin approves the vendor');

  set local role service_role;
  select status, reviewed_by, reviewed_at, review_notes
    into stored, reviewer, at_ts, notes
    from vendor_organizations where id = org;

  perform test.eq(stored, 'approved'::vendor_status, 'the status really changed');
  perform test.eq(reviewer, admin_u, 'reviewed_by is stamped from auth.uid(), not from the client');
  perform test.ok(at_ts is not null, 'reviewed_at is stamped');
  perform test.eq(notes, 'documents verified', 'the recorded reason is kept');
end
$$;

rollback;
