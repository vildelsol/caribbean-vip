-- A change to a promotion's approval state leaves an audit row, whoever made it.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table fixture (k text primary key, v uuid) on commit drop;
grant select on fixture to anon, authenticated;

do $$
declare
  owner_u uuid; org uuid; promo uuid;
begin
  insert into auth.users (email) values ('promo-audit-owner@test.local') returning id into owner_u;

  select id into org from vendor_organizations
   where trading_name = '[Demo] Unverified Excursions' limit 1;
  if org is null then
    raise exception 'fixture: expected a seeded vendor';
  end if;

  insert into vendor_members (vendor_org_id, user_id, role, can_manage_listings)
  values (org, owner_u, 'vendor_owner', false);

  insert into promotions (vendor_org_id, island_id, title, terms, value_kind,
                          starts_at, ends_at, approval_state)
  select org, o.island_id, 'Audit fixture', 'Test terms', 'in_kind',
         now() - interval '1 day', now() + interval '30 days', 'approved'
    from vendor_organizations o where o.id = org
  returning id into promo;

  insert into fixture values ('owner', owner_u), ('promo', promo);
end
$$;

do $$
declare
  promo uuid := (select v from fixture where k = 'promo');
  n integer;
begin
  select count(*) into n from audit_logs where entity_id = promo;
  perform test.eq(n, 0, 'creating a promotion is not an approval change');

  -- A change that is not to approval_state must not log.
  update promotions set title = 'Renamed' where id = promo;
  select count(*) into n from audit_logs where entity_id = promo;
  perform test.eq(n, 0, 'editing content writes no audit row');
end
$$;

set local role authenticated;

do $$
declare
  promo uuid := (select v from fixture where k = 'promo');
  owner_u uuid := (select v from fixture where k = 'owner');
  n integer;
  actor uuid;
  before_state text;
  after_state text;
begin
  perform test.become(owner_u);
  update promotions set approval_state = 'disabled' where id = promo;

  set local role service_role;
  select count(*), min(actor_user_id::text)::uuid, min(before->>'approval_state'), min(after->>'approval_state')
    into n, actor, before_state, after_state
    from audit_logs
   where entity_id = promo and entity_type = 'promotions'
     and action = 'promotions.approval_state_changed';

  perform test.eq(n, 1, 'a vendor taking their own offer down is logged');
  perform test.eq(actor, owner_u, 'the actor is the caller, from auth.uid()');
  perform test.eq(before_state, 'approved', 'the previous state is recorded');
  perform test.eq(after_state, 'disabled', 'the new state is recorded');
end
$$;

rollback;
