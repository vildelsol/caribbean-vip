-- can_manage_listings is enforced by RLS, not only collected by the portal.
--
-- Before 20261019000001 the `*_vendor_all` policies authorised listing writes on
-- is_vendor_member() alone, so any vendor_staff row could create, edit and delete its
-- organisation's inventory. The column was read in apps/vendor-web/lib/session.tsx and never
-- checked anywhere.
--
-- Two traps shape how this file asserts:
--
-- 1. RLS denies UPDATE and DELETE SILENTLY. A `using` clause that excludes a row makes the row
--    invisible to the statement, so the statement succeeds and reports zero rows. test.raises
--    would therefore pass against a completely unguarded table. Those cases assert the affected
--    row count and then re-read the value as service_role. Only INSERT-side `with check`
--    violations raise, so only INSERT uses test.raises.
--
-- 2. An INSERT can fail for reasons that have nothing to do with RLS — a not-null column, a check
--    constraint, a bad enum. A test.raises that passes for that reason proves nothing. Every
--    insert payload here is therefore run twice: once as an actor that must be refused, once as an
--    actor that must succeed. The positive control is what makes the negative meaningful.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

-- --------------------------------------------------------------------------
-- Fixtures
-- --------------------------------------------------------------------------

set local role service_role;

create temporary table fixture (k text primary key, v uuid) on commit drop;
grant select on fixture to anon, authenticated;

do $$
declare
  manager_u uuid; plain_u uuid; owner_u uuid;
  org_a uuid; exp_a uuid;
begin
  insert into auth.users (email) values ('listing-manager@test.local') returning id into manager_u;
  insert into auth.users (email) values ('listing-plain@test.local')   returning id into plain_u;
  insert into auth.users (email) values ('listing-owner@test.local')   returning id into owner_u;

  select id into org_a from vendor_organizations where trading_name = '[Demo] Negril Sunset Cruises';
  select e.id into exp_a from experiences e where e.vendor_org_id = org_a order by e.title limit 1;

  -- Staff WITH the grant, staff WITHOUT it, and an owner whose flag was never set. The last one
  -- is the regression that matters: can_manage_listings defaults to false, so a strict flag check
  -- would lock an owner out of their own inventory.
  insert into vendor_members (vendor_org_id, user_id, role, can_manage_listings, can_view_payouts)
  values (org_a, manager_u, 'vendor_staff', true,  false),
         (org_a, plain_u,   'vendor_staff', false, false),
         (org_a, owner_u,   'vendor_owner', false, false);

  insert into fixture values
    ('manager', manager_u), ('plain', plain_u), ('owner', owner_u),
    ('org_a', org_a), ('exp_a', exp_a);
end
$$;

-- --------------------------------------------------------------------------
-- The helper itself
-- --------------------------------------------------------------------------

do $$
declare
  org_a uuid := (select v from fixture where k = 'org_a');
begin
  perform test.become((select v from fixture where k = 'manager'));
  perform test.ok(is_vendor_listing_manager(org_a), 'granted staff is a listing manager');

  perform test.become((select v from fixture where k = 'plain'));
  perform test.ok(not is_vendor_listing_manager(org_a), 'ungranted staff is not a listing manager');
  perform test.ok(is_vendor_member(org_a), 'ungranted staff is still a member of the org');

  perform test.become((select v from fixture where k = 'owner'));
  perform test.ok(
    is_vendor_listing_manager(org_a),
    'an owner manages listings even with can_manage_listings false'
  );
end
$$;

-- --------------------------------------------------------------------------
-- Read is NOT gated. A scan-only staff member still needs the listing list.
-- --------------------------------------------------------------------------

set local role authenticated;

do $$
declare
  n integer;
  org_a uuid := (select v from fixture where k = 'org_a');
  exp_a uuid := (select v from fixture where k = 'exp_a');
begin
  perform test.become((select v from fixture where k = 'plain'));

  select count(*) into n from experiences where vendor_org_id = org_a;
  perform test.ok(n > 0, 'ungranted staff still reads their org''s listings');

  select count(*) into n from availability_slots where experience_id = exp_a;
  perform test.ok(n > 0, 'ungranted staff still reads availability for those listings');
end
$$;

-- --------------------------------------------------------------------------
-- UPDATE — denied silently, so assert the row count AND the stored value
-- --------------------------------------------------------------------------

do $$
declare
  affected integer;
  stored   text;
  exp_a uuid := (select v from fixture where k = 'exp_a');
begin
  perform test.become((select v from fixture where k = 'plain'));

  update experiences set title = 'HIJACKED BY UNGRANTED STAFF' where id = exp_a;
  get diagnostics affected = row_count;
  perform test.eq(affected, 0, 'ungranted staff updates zero experience rows');

  set local role service_role;
  select title into stored from experiences where id = exp_a;
  perform test.ok(stored <> 'HIJACKED BY UNGRANTED STAFF', 'the listing title is genuinely unchanged');
  set local role authenticated;
end
$$;

do $$
declare
  affected integer;
  exp_a uuid := (select v from fixture where k = 'exp_a');
begin
  perform test.become((select v from fixture where k = 'plain'));

  update availability_slots set capacity = capacity + 99 where experience_id = exp_a;
  get diagnostics affected = row_count;
  perform test.eq(affected, 0, 'ungranted staff updates zero availability rows');

  update experience_options set is_active = false
   where experience_id = exp_a;
  get diagnostics affected = row_count;
  perform test.eq(affected, 0, 'ungranted staff updates zero option rows');
end
$$;

-- The same statement must work for a granted actor, or the assertions above prove only that the
-- table is unwritable by anyone.
do $$
declare
  affected integer;
  exp_a uuid := (select v from fixture where k = 'exp_a');
begin
  perform test.become((select v from fixture where k = 'manager'));
  update experiences set summary = 'edited by granted staff' where id = exp_a;
  get diagnostics affected = row_count;
  perform test.eq(affected, 1, 'granted staff updates the listing');

  perform test.become((select v from fixture where k = 'owner'));
  update experiences set summary = 'edited by the owner' where id = exp_a;
  get diagnostics affected = row_count;
  perform test.eq(affected, 1, 'the owner updates the listing despite the false flag');
end
$$;

-- --------------------------------------------------------------------------
-- DELETE — also silent
-- --------------------------------------------------------------------------

do $$
declare
  affected integer;
  n integer;
  exp_a uuid := (select v from fixture where k = 'exp_a');
begin
  perform test.become((select v from fixture where k = 'plain'));

  delete from experiences where id = exp_a;
  get diagnostics affected = row_count;
  perform test.eq(affected, 0, 'ungranted staff deletes zero experience rows');

  set local role service_role;
  select count(*) into n from experiences where id = exp_a;
  perform test.eq(n, 1, 'the listing still exists');
  set local role authenticated;
end
$$;

-- --------------------------------------------------------------------------
-- INSERT — the one write RLS refuses loudly. Paired with a positive control.
-- --------------------------------------------------------------------------

do $$
declare
  org_a uuid := (select v from fixture where k = 'org_a');
  exp_a uuid := (select v from fixture where k = 'exp_a');
  island_a uuid; dest_a uuid;
  stmt text;
  n integer;
begin
  set local role service_role;
  select island_id, destination_id into island_a, dest_a from experiences where id = exp_a;
  set local role authenticated;

  stmt := format(
    $q$ insert into experiences
          (vendor_org_id, island_id, destination_id, category, title,
           duration_minutes, currency, is_demo)
        values (%L, %L, %L, 'water_sports', 'Permission probe listing', 60, 'USD', true) $q$,
    org_a, island_a, dest_a
  );

  perform test.become((select v from fixture where k = 'plain'));
  perform test.raises(stmt, 'ungranted staff cannot create a listing');

  -- Positive control: the identical payload, so the refusal above cannot be a constraint error.
  perform test.become((select v from fixture where k = 'manager'));
  execute stmt;

  set local role service_role;
  select count(*) into n from experiences where title = 'Permission probe listing';
  perform test.eq(n, 1, 'the same payload succeeds for granted staff — the refusal was RLS');
  set local role authenticated;
end
$$;

do $$
declare
  exp_a uuid := (select v from fixture where k = 'exp_a');
  stmt text;
  n integer;
begin
  stmt := format(
    $q$ insert into availability_slots (experience_id, starts_at, ends_at, capacity)
        values (%L, now() + interval '400 days', now() + interval '400 days 2 hours', 8) $q$,
    exp_a
  );

  perform test.become((select v from fixture where k = 'plain'));
  perform test.raises(stmt, 'ungranted staff cannot open an availability slot');

  perform test.become((select v from fixture where k = 'manager'));
  execute stmt;

  set local role service_role;
  select count(*) into n from availability_slots
   where experience_id = exp_a and starts_at > now() + interval '399 days';
  perform test.eq(n, 1, 'the same slot payload succeeds for granted staff');
  set local role authenticated;
end
$$;

do $$
declare
  exp_a uuid := (select v from fixture where k = 'exp_a');
  stmt text;
begin
  stmt := format(
    $q$ insert into experience_media (experience_id, storage_path, alt_text, sort_order)
        values (%L, 'probe/unauthorised.jpg', 'permission probe', 99) $q$,
    exp_a
  );

  perform test.become((select v from fixture where k = 'plain'));
  perform test.raises(stmt, 'ungranted staff cannot attach media to a listing');

  perform test.become((select v from fixture where k = 'manager'));
  execute stmt;
end
$$;

rollback;
