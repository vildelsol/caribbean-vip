-- An admin can create a promotion and its geofence for a vendor, as the console does.
--
-- The console inserts as the admin's own session, so this goes through RLS and the review guard.
-- Positive controls first: the insert the form produces must work. Then the database limits the
-- form mirrors, so a form that drifts from them fails here as well as in its own tests.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table fixture (k text primary key, v uuid) on commit drop;
grant select on fixture to anon, authenticated;

do $$
declare
  admin_u uuid; org uuid;
begin
  insert into auth.users (email) values ('promo-create-admin@test.local') returning id into admin_u;
  update profiles set role = 'admin' where id = admin_u;
  select id into org from vendor_organizations
   where trading_name = '[Demo] Unverified Excursions' limit 1;
  if org is null then raise exception 'fixture: expected a seeded vendor'; end if;
  insert into fixture values ('admin', admin_u), ('org', org);
end
$$;

set local role authenticated;

do $$
declare
  org uuid := (select v from fixture where k = 'org');
  promo uuid;
  n integer;
  state approval_state;
  demo boolean;
begin
  perform test.become((select v from fixture where k = 'admin'));

  insert into promotions (vendor_org_id, island_id, title, terms, value_kind,
                          starts_at, ends_at, requires_booking, is_demo)
  select org, island_id, 'Admin created', 'One per guest.', 'in_kind',
         now(), now() + interval '30 days', false, true
    from vendor_organizations where id = org
  returning id, approval_state, is_demo into promo, state, demo;

  perform test.eq(state, 'pending'::approval_state, 'an admin-created promotion starts pending');
  perform test.eq(demo, true, 'an admin may mark an offer as a test offer');

  insert into geofences (promotion_id, centre_lat, centre_lng, radius_m, active_days,
                         active_from_time, active_to_time, cooldown_minutes)
  values (promo, 18.4, -77.1, 250, '{5,6}', '22:00', '02:00', 1440);
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'an admin can add the geofence, including an overnight window');

  perform test.raises(
    format($q$ insert into geofences (promotion_id, centre_lat, centre_lng, radius_m)
               values (%L, 18.4, -77.1, 49) $q$, promo),
    'a radius under 50 m is refused'
  );
  perform test.raises(
    format($q$ insert into geofences (promotion_id, centre_lat, centre_lng, radius_m)
               values (%L, 18.4, -77.1, 20001) $q$, promo),
    'a radius over 20 km is refused'
  );
  perform test.raises(
    format($q$ insert into geofences (promotion_id, centre_lat, centre_lng, radius_m)
               values (%L, 91, -77.1, 250) $q$, promo),
    'a latitude out of range is refused'
  );
  perform test.raises(
    format($q$ insert into geofences (promotion_id, centre_lat, centre_lng, radius_m, cooldown_minutes)
               values (%L, 18.4, -77.1, 250, -1) $q$, promo),
    'a negative cooldown is refused'
  );
  perform test.raises(
    format($q$ insert into promotions (vendor_org_id, island_id, title, terms, value_kind, starts_at, ends_at)
               select %L, island_id, 'Backwards', 'T', 'in_kind', now(), now() - interval '1 day'
                 from vendor_organizations where id = %L $q$, org, org),
    'an offer that ends before it starts is refused'
  );
  perform test.raises(
    format($q$ insert into promotions (vendor_org_id, island_id, title, terms, value_kind, starts_at, ends_at)
               select %L, island_id, 'No rate', 'T', 'percentage', now(), now() + interval '1 day'
                 from vendor_organizations where id = %L $q$, org, org),
    'a percentage offer without a rate is refused'
  );
end
$$;

rollback;
