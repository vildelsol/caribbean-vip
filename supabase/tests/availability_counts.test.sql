-- A vendor must not write availability_slots.booked_count.
--
-- booked_count is the oversell counter, maintained by reserve_availability() under a row lock.
-- Before 20261029000002 the vendor insert and update policies covered every column, so a vendor
-- could lower the counter with bookings standing. Refusals are raised exceptions from a trigger;
-- each has a positive control so a guard that broke vendor self-service would show here too.

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
  org uuid; dest uuid; exp uuid; slot uuid;
begin
  insert into auth.users (email) values ('slot-owner@test.local') returning id into owner_u;
  insert into auth.users (email) values ('slot-admin@test.local') returning id into admin_u;
  update profiles set role = 'admin' where id = admin_u;

  select id into org from vendor_organizations
   where trading_name = '[Demo] Unverified Excursions' limit 1;
  select d.id into dest from destinations d
   join vendor_organizations o on o.island_id = d.island_id where o.id = org limit 1;
  if org is null or dest is null then
    raise exception 'fixture: expected a seeded vendor and a destination on its island';
  end if;

  insert into vendor_members (vendor_org_id, user_id, role) values (org, owner_u, 'vendor_owner');

  insert into experiences (vendor_org_id, island_id, destination_id, category, title,
                           duration_minutes, currency, status)
  select org, o.island_id, dest, (enum_range(null::experience_category))[1], 'Slot fixture',
         60, 'USD', 'draft'
    from vendor_organizations o where o.id = org
  returning id into exp;

  -- Seats already sold: the state the counter exists to protect.
  insert into availability_slots (experience_id, starts_at, ends_at, capacity, booked_count)
  values (exp, now() + interval '2 days', now() + interval '2 days 1 hour', 6, 4)
  returning id into slot;

  insert into fixture values
    ('owner', owner_u), ('admin', admin_u), ('exp', exp), ('slot', slot);
end
$$;

set local role authenticated;

-- --------------------------------------------------------------------------
-- Creating a slot
-- --------------------------------------------------------------------------

do $$
declare
  exp uuid := (select v from fixture where k = 'exp');
  n   integer;
begin
  perform test.become((select v from fixture where k = 'owner'));

  perform test.raises(
    format($q$ insert into availability_slots (experience_id, starts_at, ends_at, capacity, booked_count)
               values (%L, now() + interval '3 days', now() + interval '3 days 1 hour', 5, 2) $q$, exp),
    'a vendor cannot create a slot that already has seats sold'
  );

  insert into availability_slots (experience_id, starts_at, ends_at, capacity)
  values (exp, now() + interval '3 days', now() + interval '3 days 1 hour', 5);
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a vendor can still create an empty slot');
end
$$;

-- --------------------------------------------------------------------------
-- Changing a slot
-- --------------------------------------------------------------------------

do $$
declare
  slot uuid := (select v from fixture where k = 'slot');
  n    integer;
  stored integer;
begin
  perform test.become((select v from fixture where k = 'owner'));

  perform test.raises(
    format($q$ update availability_slots set booked_count = 0 where id = %L $q$, slot),
    'a vendor cannot lower the sold counter'
  );
  perform test.raises(
    format($q$ update availability_slots set booked_count = 6 where id = %L $q$, slot),
    'a vendor cannot raise the sold counter either'
  );

  -- Controls: capacity and status are the vendor's to change.
  update availability_slots set capacity = 8 where id = slot;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a vendor can still change capacity');

  update availability_slots set status = 'closed' where id = slot;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a vendor can still close a departure');

  set local role service_role;
  select booked_count into stored from availability_slots where id = slot;
  perform test.eq(stored, 4, 'the counter is genuinely unchanged');
  set local role authenticated;
end
$$;

-- --------------------------------------------------------------------------
-- The system path and admins still work
-- --------------------------------------------------------------------------

do $$
declare
  slot   uuid := (select v from fixture where k = 'slot');
  stored integer;
begin
  -- The booking functions run on the service role with no user, so clear the one left behind.
  set local role service_role;
  perform test.become_anon();
  update availability_slots set status = 'open' where id = slot;
  perform reserve_availability(slot, 1);
  select booked_count into stored from availability_slots where id = slot;
  perform test.eq(stored, 5, 'reserve_availability still moves the counter');

  set local role authenticated;
  perform test.become((select v from fixture where k = 'admin'));
  update availability_slots set booked_count = 2 where id = slot;
  set local role service_role;
  select booked_count into stored from availability_slots where id = slot;
  perform test.eq(stored, 2, 'an admin can correct the counter');
end
$$;

rollback;
