-- Only an admin may approve a promotion, and only the system may move its issued counter.
--
-- `promotions.approval_state` is what the public read policy checks. Before 20261031000001 the
-- vendor policy covered every column, so a vendor could insert a promotion as 'approved', flip
-- their own to it, or rewrite `issued_count` to defeat the inventory limit. These assertions are
-- about raised exceptions from a trigger, because the rule is per-column; each refusal has a
-- positive control beside it so a guard that simply broke vendor self-service would show here too.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table fixture (k text primary key, v uuid) on commit drop;
grant select on fixture to anon, authenticated;

do $$
declare
  owner_u uuid; admin_u uuid;
  org uuid; promo uuid;
begin
  insert into auth.users (email) values ('promo-owner@test.local') returning id into owner_u;
  insert into auth.users (email) values ('promo-admin@test.local') returning id into admin_u;
  update profiles set role = 'admin' where id = admin_u;

  select id into org from vendor_organizations
   where trading_name = '[Demo] Unverified Excursions' limit 1;
  if org is null then
    raise exception 'fixture: expected a seeded vendor';
  end if;

  insert into vendor_members (vendor_org_id, user_id, role, can_manage_listings)
  values (org, owner_u, 'vendor_owner', false);

  -- Service role: no auth.uid(), so the guard stands aside, as it does for an Edge Function.
  insert into promotions (vendor_org_id, island_id, title, terms, value_kind,
                          starts_at, ends_at, inventory_limit, approval_state)
  select org, o.island_id, 'Guard fixture', 'Test terms', 'in_kind',
         now() - interval '1 day', now() + interval '30 days', 10, 'pending'
    from vendor_organizations o where o.id = org
  returning id into promo;

  insert into fixture values ('owner', owner_u), ('admin', admin_u), ('org', org), ('promo', promo);
end
$$;

set local role authenticated;

-- --------------------------------------------------------------------------
-- Creating
-- --------------------------------------------------------------------------

do $$
declare
  org uuid := (select v from fixture where k = 'org');
  n   integer;
begin
  perform test.become((select v from fixture where k = 'owner'));

  perform test.raises(
    format($q$ insert into promotions (vendor_org_id, island_id, title, terms, value_kind,
                 starts_at, ends_at, approval_state)
               select %L, island_id, 'Self approved', 'T', 'in_kind', now(), now() + interval '1 day',
                 'approved' from vendor_organizations where id = %L $q$, org, org),
    'a vendor cannot create a promotion as approved'
  );
  perform test.raises(
    format($q$ insert into promotions (vendor_org_id, island_id, title, terms, value_kind,
                 starts_at, ends_at, issued_count)
               select %L, island_id, 'Pre-issued', 'T', 'in_kind', now(), now() + interval '1 day',
                 5 from vendor_organizations where id = %L $q$, org, org),
    'a vendor cannot create a promotion with a non-zero issued_count'
  );
  perform test.raises(
    format($q$ insert into promotions (vendor_org_id, island_id, title, terms, value_kind,
                 starts_at, ends_at, is_demo)
               select %L, island_id, 'Self demo', 'T', 'in_kind', now(), now() + interval '1 day',
                 true from vendor_organizations where id = %L $q$, org, org),
    'a vendor cannot create a promotion marked demo'
  );

  -- Control: the same insert left at its defaults is what the portal does, and must still work.
  insert into promotions (vendor_org_id, island_id, title, terms, value_kind, starts_at, ends_at)
  select org, island_id, 'A pending offer', 'T', 'in_kind', now(), now() + interval '1 day'
    from vendor_organizations where id = org;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a vendor can still create a pending promotion');
end
$$;

-- --------------------------------------------------------------------------
-- Moving a promotion through review
-- --------------------------------------------------------------------------

do $$
declare
  promo uuid := (select v from fixture where k = 'promo');
  n     integer;
begin
  perform test.become((select v from fixture where k = 'owner'));

  perform test.raises(
    format($q$ update promotions set approval_state = 'approved' where id = %L $q$, promo),
    'a vendor cannot approve their own pending promotion'
  );
  perform test.raises(
    format($q$ update promotions set reviewed_by = auth.uid(), reviewed_at = now() where id = %L $q$, promo),
    'a vendor cannot name themselves the reviewer'
  );
  perform test.raises(
    format($q$ update promotions set issued_count = 3 where id = %L $q$, promo),
    'a vendor cannot write issued_count'
  );
  perform test.raises(
    format($q$ update promotions set is_demo = true where id = %L $q$, promo),
    'a vendor cannot mark a promotion demo'
  );

  -- Control: editing content without touching a guarded column must keep working.
  update promotions set title = 'Renamed by owner', inventory_limit = 20 where id = promo;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a vendor can still edit their promotion');
end
$$;

-- A rejected or disabled promotion must not be a way round review.
do $$
declare
  promo uuid := (select v from fixture where k = 'promo');
  n     integer;
begin
  set local role service_role;
  perform test.become_anon();
  update promotions set approval_state = 'rejected' where id = promo;
  set local role authenticated;
  perform test.become((select v from fixture where k = 'owner'));

  perform test.raises(
    format($q$ update promotions set approval_state = 'approved' where id = %L $q$, promo),
    'a vendor cannot approve a rejected promotion'
  );
  update promotions set approval_state = 'pending' where id = promo;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a vendor can resubmit a rejected promotion');

  set local role service_role;
  perform test.become_anon();
  update promotions set approval_state = 'approved' where id = promo;
  set local role authenticated;
  perform test.become((select v from fixture where k = 'owner'));

  perform test.raises(
    format($q$ update promotions set approval_state = 'pending' where id = %L $q$, promo),
    'a vendor cannot move a live promotion back to pending'
  );
  update promotions set approval_state = 'disabled' where id = promo;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a vendor can take their live promotion down');

  perform test.raises(
    format($q$ update promotions set approval_state = 'approved' where id = %L $q$, promo),
    'a vendor cannot put a disabled promotion back live without review'
  );
  update promotions set approval_state = 'pending' where id = promo;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a disabled promotion returns through review');
end
$$;

-- --------------------------------------------------------------------------
-- Positive control: an admin can, and the stamp records who
-- --------------------------------------------------------------------------

do $$
declare
  promo    uuid := (select v from fixture where k = 'promo');
  admin_u  uuid := (select v from fixture where k = 'admin');
  n        integer;
  stored   approval_state;
  reviewer uuid;
  at_ts    timestamptz;
begin
  perform test.become(admin_u);

  update promotions set approval_state = 'approved' where id = promo;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'an admin approves the promotion');

  set local role service_role;
  select approval_state, reviewed_by, reviewed_at
    into stored, reviewer, at_ts from promotions where id = promo;

  perform test.eq(stored, 'approved'::approval_state, 'the state really changed');
  perform test.eq(reviewer, admin_u, 'reviewed_by is stamped from auth.uid(), not from the client');
  perform test.ok(at_ts is not null, 'reviewed_at is stamped');
end
$$;

-- The service role (voucher issuing, later) may move the counter.
do $$
declare
  promo  uuid := (select v from fixture where k = 'promo');
  issued integer;
begin
  set local role service_role;
  perform test.become_anon();
  update promotions set issued_count = 2 where id = promo;
  select issued_count into issued from promotions where id = promo;
  perform test.eq(issued, 2, 'the service role can still move issued_count');
end
$$;

rollback;
