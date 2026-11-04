-- begin_account_removal(): the gate in front of deleting a guest's sign-in.
-- Each refusal sits beside a positive control (the same guest passes once the condition holds), so
-- "always refuses" cannot pass as "the gate works".

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table fx (k text primary key, v uuid) on commit drop;
grant select on fx to anon, authenticated;

do $$
declare
  g_ok uuid; g_fresh uuid; g_old uuid; g_book uuid; staff uuid;
  org uuid; exp_a uuid; slot uuid;
begin
  insert into auth.users (email) values ('rm-ok@test.local')    returning id into g_ok;
  insert into auth.users (email) values ('rm-fresh@test.local') returning id into g_fresh;
  insert into auth.users (email) values ('rm-old@test.local')   returning id into g_old;
  insert into auth.users (email) values ('rm-book@test.local')  returning id into g_book;
  insert into auth.users (email) values ('rm-staff@test.local') returning id into staff;
  update profiles set role = 'admin' where id = staff;

  select id into org from vendor_organizations order by trading_name limit 1;
  select e.id into exp_a from experiences e where e.vendor_org_id = org limit 1;
  select s.id into slot from availability_slots s where s.experience_id = exp_a limit 1;
  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference,
                        status, currency, subtotal_minor, tax_minor, service_fee_minor,
                        total_minor, commission_minor, seats)
  values (g_book, org, exp_a, slot, 'VIPJ-RM00-0001', 'confirmed', 'USD', 10000, 1500, 500, 12000, 1200, 1);

  insert into fx values ('ok', g_ok), ('fresh', g_fresh), ('old', g_old), ('book', g_book), ('staff', staff);
end
$$;

-- Real erasures, made the way a guest makes them, for ok and book.
do $$
declare who text;
begin
  foreach who in array array['ok', 'book'] loop
    set local role authenticated;
    perform test.become((select f.v from fx f where f.k = who));
    perform erase_my_data();
  end loop;
  set local role service_role;
  -- "old": the erasure was two hours ago (the log is append-only, so insert it that way).
  insert into privacy_requests (subject_id, request_type, received_at)
  values ((select v from fx where k = 'old'), 'erasure', now() - interval '2 hours');
end
$$;

do $$
declare
  ok_u uuid := (select v from fx where k = 'ok');
  r text; n int;
begin
  set local role service_role;

  -- Seeded off.
  perform test.eq((select value from platform_settings where key = 'privacy.account_removal_enabled'), 'false'::jsonb, 'the switch is seeded false');
  perform test.eq(begin_account_removal(ok_u), 'disabled', 'disabled by default, even for a guest who erased');

  -- Anything but boolean true is off.
  update platform_settings set value = '"true"'::jsonb where key = 'privacy.account_removal_enabled';
  perform test.eq(begin_account_removal(ok_u), 'disabled', 'the text "true" does not enable it');
  update platform_settings set value = '1'::jsonb where key = 'privacy.account_removal_enabled';
  perform test.eq(begin_account_removal(ok_u), 'disabled', 'the number 1 does not enable it');
  update platform_settings set value = 'null'::jsonb where key = 'privacy.account_removal_enabled';
  perform test.eq(begin_account_removal(ok_u), 'disabled', 'json null does not enable it');
  delete from platform_settings where key = 'privacy.account_removal_enabled';
  perform test.eq(begin_account_removal(ok_u), 'disabled', 'a missing setting is off');
  insert into platform_settings (key, value) values ('privacy.account_removal_enabled', 'true'::jsonb);

  -- Refusals with the switch on.
  perform test.eq(begin_account_removal((select v from fx where k = 'fresh')), 'not_erased', 'a guest who has not erased is refused');
  perform test.eq(begin_account_removal((select v from fx where k = 'old')), 'not_erased', 'an erasure older than an hour does not count');
  perform test.eq(begin_account_removal((select v from fx where k = 'book')), 'has_bookings', 'a guest with bookings is refused');
  perform test.eq(begin_account_removal((select v from fx where k = 'staff')), 'not_tourist', 'a staff account is refused');
  perform test.eq(begin_account_removal(gen_random_uuid()), 'not_tourist', 'an unknown user is refused');
  select count(*) into n from privacy_requests where request_type = 'account_removal';
  perform test.eq(n, 0, 'no refusal is recorded as a removal');

  -- Positive control: the same switch, a guest who erased and holds no bookings.
  perform test.eq(begin_account_removal(ok_u), 'ok', 'a guest who erased, with no bookings, may proceed');
  select count(*) into n from privacy_requests where request_type = 'account_removal' and subject_id = ok_u;
  perform test.eq(n, 1, 'the decision is recorded');
end
$$;

-- Who can call it.
do $$
declare ok_u uuid := (select v from fx where k = 'ok');
begin
  set local role authenticated;
  perform test.become((select v from fx where k = 'fresh'));
  perform test.raises(format($q$ select begin_account_removal(%L) $q$, ok_u), 'a signed-in guest cannot call it, so cannot name another user');
  perform test.become_anon();
  perform test.raises(format($q$ select begin_account_removal(%L) $q$, ok_u), 'anon cannot call it');
end
$$;

-- The database itself backs the gate: a guest with bookings cannot lose the login.
do $$
begin
  set local role service_role;
  perform test.raises(
    format($q$ delete from auth.users where id = %L $q$, (select v from fx where k = 'book')),
    'deleting the Auth user of a guest with bookings is refused (bookings.user_id is RESTRICT)');
  -- Positive control: the erased guest with no bookings can be removed, and the profile goes with it.
  delete from auth.users where id = (select v from fx where k = 'ok');
  perform test.ok(not exists (select 1 from profiles where id = (select v from fx where k = 'ok')),
    'the profile of a removed guest is gone');
  perform test.ok(exists (select 1 from privacy_requests where request_type = 'account_removal' and subject_id = (select v from fx where k = 'ok')),
    'the record of the removal survives the account');
end
$$;

rollback;
