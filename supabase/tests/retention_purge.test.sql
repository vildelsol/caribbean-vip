-- purge_expired_records(): removes only rows past 7 years, only for the service role, and says so
-- in the audit log. Each denial has a positive control.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;
set local role service_role;

create temporary table fixture (k text primary key, v uuid) on commit drop;
grant select on fixture to anon, authenticated;

do $$
declare
  u uuid; org uuid; slot uuid; exp uuid; young uuid; old uuid; res jsonb; logs integer;
begin
  insert into auth.users (email) values ('purge@test.local') returning id into u;
  select s.id, s.experience_id into slot, exp from availability_slots s limit 1;
  select e.vendor_org_id into org from experiences e where e.id = exp;

  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference, currency,
                        subtotal_minor, total_minor, seats)
  values (u, org, exp, slot, 'PURGE-Y-' || substr(gen_random_uuid()::text, 1, 6), 'USD', 1000, 1000, 1)
  returning id into young;
  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference, currency,
                        subtotal_minor, total_minor, seats, created_at)
  values (u, org, exp, slot, 'PURGE-O-' || substr(gen_random_uuid()::text, 1, 6), 'USD', 1000, 1000, 1,
          now() - interval '7 years 1 day')
  returning id into old;
  insert into payments (booking_id, currency, amount_minor) values (young, 'USD', 1000);
  insert into payments (booking_id, currency, amount_minor, created_at)
  values (old, 'USD', 1000, now() - interval '7 years 1 day');
  insert into fixture values ('young', young), ('old', old);

  select count(*) into logs from audit_logs where action = 'retention.purge';
  res := purge_expired_records();

  perform test.eq((res ->> 'bookings_removed')::int, 1, 'removes the one old booking');
  perform test.eq((res ->> 'payments_removed')::int, 1, 'removes the one old payment');
  perform test.eq((select count(*)::int from bookings where id = old), 0, 'old booking is gone');
  perform test.eq((select count(*)::int from bookings where id = young), 1, 'young booking is kept');
  perform test.eq((select count(*)::int from payments where booking_id = young), 1, 'young payment is kept');
  perform test.eq((select count(*)::int from audit_logs where action = 'retention.purge'), logs + 1,
    'the run is written to the audit log');
  perform test.eq(coalesce(current_setting('cvip.retention_purge', true), ''), '',
    'the purge setting is switched off again afterwards');
  perform test.raises(format($q$ delete from bookings where id = %L $q$, young),
    'the floor still protects young rows after a purge ran');
end
$$;

set local role authenticated;
do $$
begin
  perform test.raises('select purge_expired_records()', 'an authenticated user cannot run the purge');
end
$$;

set local role anon;
do $$
begin
  perform test.raises('select purge_expired_records()', 'anon cannot run the purge');
end
$$;

rollback;
