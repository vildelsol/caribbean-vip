-- Bookings and payments inside the 7-year window cannot be deleted, by any role, directly or by
-- cascade. Each denial is paired with a positive control (an old row IS purgeable, but only by the
-- job's setting).

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;
set local role service_role;

do $$
declare
  u uuid; org uuid; slot uuid; exp uuid;
  young uuid; old uuid; ypay uuid;
begin
  insert into auth.users (email) values ('floor@test.local') returning id into u;
  select s.id, s.experience_id into slot, exp from availability_slots s limit 1;
  select e.vendor_org_id into org from experiences e where e.id = exp;

  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference, currency,
                        subtotal_minor, total_minor, seats)
  values (u, org, exp, slot, 'FLOOR-Y-' || substr(gen_random_uuid()::text, 1, 6), 'USD', 1000, 1000, 1)
  returning id into young;
  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference, currency,
                        subtotal_minor, total_minor, seats, created_at)
  values (u, org, exp, slot, 'FLOOR-O-' || substr(gen_random_uuid()::text, 1, 6), 'USD', 1000, 1000, 1,
          now() - interval '8 years')
  returning id into old;
  insert into payments (booking_id, currency, amount_minor) values (young, 'USD', 1000) returning id into ypay;

  perform test.raises(format($q$ delete from payments where id = %L $q$, ypay),
    'a payment inside 7 years cannot be deleted');
  perform test.raises(format($q$ delete from bookings where id = %L $q$, young),
    'a booking inside 7 years cannot be deleted (and its payment cascade is blocked too)');
  perform test.eq((select count(*)::int from payments where id = ypay), 1, 'the payment is still there');

  -- The purge setting alone does not unlock a young row.
  perform set_config('cvip.retention_purge', 'on', true);
  perform test.raises(format($q$ delete from bookings where id = %L $q$, young),
    'the purge setting does not unlock a row inside 7 years');
  perform set_config('cvip.retention_purge', '', true);

  -- Old row: refused without the setting, allowed with it (positive control).
  perform test.raises(format($q$ delete from bookings where id = %L $q$, old),
    'an old booking is still refused without the purge setting');
  perform set_config('cvip.retention_purge', 'on', true);
  delete from bookings where id = old;
  perform test.eq((select count(*)::int from bookings where id = old), 0, 'the job can purge an old booking');
end
$$;

rollback;
