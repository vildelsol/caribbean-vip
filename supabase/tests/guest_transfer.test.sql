-- transfer_guest_bookings(from, to) — an anonymous guest's bookings follow them into the account
-- they sign in to.
--
-- Why it exists: signing in replaces the anonymous session, and the bookings stay on the anonymous
-- user id, which only that phone's storage can reach. The function moves them. It is `security
-- definer` and moves ownership of paid bookings, so the whole defence is who may call it and which
-- pair of users it accepts. It takes ids from its caller and trusts them, so it must be callable
-- only by the service role (the Edge Function, which derives both ids from verified tokens).
--
-- Every denial is paired with a positive control, and each refusal re-reads the victim's rows, so
-- "it raised" cannot pass for "it changed nothing".

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table fixture (k text primary key, v uuid) on commit drop;
grant select on fixture to anon, authenticated;

do $$
declare
  anon_a uuid; anon_b uuid; anon_c uuid;
  member_m uuid; member_unconfirmed uuid; member_other uuid;
  org_a uuid; exp_a uuid; slot_a uuid;
  bk1 uuid; bk2 uuid; bk_b uuid; bk_m uuid;
begin
  -- Anonymous guests: no email.
  insert into auth.users (is_anonymous) values (true) returning id into anon_a;
  insert into auth.users (is_anonymous) values (true) returning id into anon_b;
  insert into auth.users (is_anonymous) values (true) returning id into anon_c;
  -- Accounts with a confirmed email, and one whose email was never confirmed.
  insert into auth.users (email, email_confirmed_at) values ('gt-member@test.local', now()) returning id into member_m;
  insert into auth.users (email, email_confirmed_at) values ('gt-other@test.local', now()) returning id into member_other;
  insert into auth.users (email, email_confirmed_at) values ('gt-unconfirmed@test.local', null) returning id into member_unconfirmed;

  select id into org_a from vendor_organizations where trading_name = '[Demo] Negril Sunset Cruises';
  select e.id into exp_a from experiences e where e.title = 'Catamaran Snorkel & Sunset';
  select s.id into slot_a from availability_slots s where s.experience_id = exp_a and s.status = 'open' order by s.starts_at limit 1;
  if org_a is null or exp_a is null or slot_a is null then
    raise exception 'fixture: seed is missing the listing or slot this file depends on';
  end if;

  -- anon_a: a paid booking and an unpaid one, plus a voucher on the paid one.
  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference, status, currency,
                        subtotal_minor, total_minor, seats, ticket_token)
  values (anon_a, org_a, exp_a, slot_a, 'VIPJ-GT-A1', 'confirmed', 'USD', 8900, 8900, 1, 'tok-a1') returning id into bk1;
  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference, status, currency,
                        subtotal_minor, total_minor, seats)
  values (anon_a, org_a, exp_a, slot_a, 'VIPJ-GT-A2', 'pending_payment', 'USD', 8900, 8900, 1) returning id into bk2;
  insert into vouchers (token_hash, user_id, booking_id, vendor_org_id, valid_until)
  values ('gt-hash-a1', anon_a, bk1, org_a, now() + interval '30 days');

  -- anon_b: a different guest, who must never be touched by anyone else's transfer.
  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference, status, currency,
                        subtotal_minor, total_minor, seats, ticket_token)
  values (anon_b, org_a, exp_a, slot_a, 'VIPJ-GT-B1', 'confirmed', 'USD', 8900, 8900, 1, 'tok-b1') returning id into bk_b;

  -- The account that will receive, with a booking of its own.
  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference, status, currency,
                        subtotal_minor, total_minor, seats, ticket_token)
  values (member_m, org_a, exp_a, slot_a, 'VIPJ-GT-M1', 'confirmed', 'USD', 8900, 8900, 1, 'tok-m1') returning id into bk_m;

  insert into fixture values
    ('anon_a', anon_a), ('anon_b', anon_b), ('anon_c', anon_c),
    ('member_m', member_m), ('member_other', member_other), ('member_unconfirmed', member_unconfirmed),
    ('bk1', bk1), ('bk2', bk2), ('bk_b', bk_b), ('bk_m', bk_m);
end
$$;

create function pg_temp.fx(k text) returns uuid language sql stable as $$ select v from fixture where fixture.k = $1 $$;
create function pg_temp.refused_with(sql text, fragment text, what text) returns void language plpgsql as $f$
begin
  begin
    execute sql;
  exception when others then
    if position(fragment in sqlerrm) = 0 then
      raise exception 'ASSERTION FAILED: % refused, but with the wrong error (%)', what, sqlerrm;
    end if;
    raise notice 'ok: refuses % (%)', what, sqlerrm;
    return;
  end;
  raise exception 'ASSERTION FAILED: % — expected an error but the statement succeeded', what;
end;
$f$;
create function pg_temp.owner_of(b uuid) returns uuid language sql stable as $$ select user_id from bookings where id = b $$;

-- --------------------------------------------------------------------------
-- Who may call it, read from the catalogue
-- --------------------------------------------------------------------------

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    perform test.ok(
      not has_function_privilege(r, 'transfer_guest_bookings(uuid,uuid)', 'execute'),
      r || ' holds no EXECUTE on transfer_guest_bookings'
    );
  end loop;
  perform test.ok(
    has_function_privilege('service_role', 'transfer_guest_bookings(uuid,uuid)', 'execute'),
    'service_role holds EXECUTE — the Edge Function depends on it (positive control)'
  );
  -- A PUBLIC grant applies to every role, so revoking from anon/authenticated alone proves nothing.
  perform test.ok(
    not exists (
      select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where p.proname = 'transfer_guest_bookings' and a.grantee = 0 and a.privilege_type = 'EXECUTE'
    ),
    'PUBLIC holds no EXECUTE either'
  );
end
$$;

-- --------------------------------------------------------------------------
-- Refusals first: each leaves the victim's rows exactly where they were
-- --------------------------------------------------------------------------

do $$
declare
  a uuid := pg_temp.fx('anon_a');  b uuid := pg_temp.fx('anon_b');  c uuid := pg_temp.fx('anon_c');
  m uuid := pg_temp.fx('member_m'); o uuid := pg_temp.fx('member_other'); u uuid := pg_temp.fx('member_unconfirmed');
begin
  perform test.raises(format('select transfer_guest_bookings(%L, %L)', m, o),
    'refuses to take bookings OUT of an account that has an email (from must be anonymous)');
  perform test.raises(format('select transfer_guest_bookings(%L, %L)', b, c),
    'refuses to move bookings INTO an anonymous guest (to must have a confirmed email)');
  perform test.raises(format('select transfer_guest_bookings(%L, %L)', b, u),
    'refuses an account whose email was never confirmed');
  -- These two are also refused by the identity checks further down, so "it raised" would pass with
  -- the dedicated checks deleted. Pin them by message: the error must be the specific one.
  perform pg_temp.refused_with(format('select transfer_guest_bookings(%L, %L)', a, a), 'same user', 'from = to');
  perform pg_temp.refused_with(format('select transfer_guest_bookings(null, %L)', m), 'both users are required', 'a null source');
  perform pg_temp.refused_with(format('select transfer_guest_bookings(%L, null)', m), 'both users are required', 'a null target');
  perform test.raises(format('select transfer_guest_bookings(%L, %L)', gen_random_uuid(), m), 'refuses a source that does not exist');
  perform test.raises(format('select transfer_guest_bookings(%L, %L)', a, gen_random_uuid()), 'refuses a target that does not exist');

  perform test.eq(pg_temp.owner_of(pg_temp.fx('bk1')), a, 'after the refusals, anon_a still owns bk1');
  perform test.eq(pg_temp.owner_of(pg_temp.fx('bk_b')), b, 'and anon_b still owns its booking');
  perform test.eq(pg_temp.owner_of(pg_temp.fx('bk_m')), m, 'and the member still owns theirs');
  perform test.eq((select count(*)::int from audit_logs where action = 'guest_bookings_transferred'), 0,
    'and a refusal wrote no audit row');
end
$$;

-- --------------------------------------------------------------------------
-- The transfer
-- --------------------------------------------------------------------------

do $$
declare
  a uuid := pg_temp.fx('anon_a'); m uuid := pg_temp.fx('member_m'); b uuid := pg_temp.fx('anon_b');
  moved integer;
begin
  moved := transfer_guest_bookings(a, m);

  perform test.eq(moved, 2, 'moves both of the guest''s bookings, paid and unpaid');
  perform test.eq(pg_temp.owner_of(pg_temp.fx('bk1')), m, 'the paid booking now belongs to the account');
  perform test.eq(pg_temp.owner_of(pg_temp.fx('bk2')), m, 'and so does the unpaid one (the webhook confirms by booking id)');
  perform test.eq((select count(*)::int from bookings where user_id = a), 0, 'the anonymous guest holds none');
  perform test.eq((select user_id from vouchers where token_hash = 'gt-hash-a1'), m, 'the voucher follows its booking');

  perform test.eq(pg_temp.owner_of(pg_temp.fx('bk_m')), m, 'the account''s own booking is untouched');
  perform test.eq((select count(*)::int from bookings where user_id = m), 3, 'the account now has three');
  perform test.eq(pg_temp.owner_of(pg_temp.fx('bk_b')), b, 'another guest''s booking is untouched');
  perform test.eq((select ticket_token from bookings where id = pg_temp.fx('bk1')), 'tok-a1', 'the ticket token is unchanged');
  perform test.eq((select status::text from bookings where id = pg_temp.fx('bk1')), 'confirmed', 'and so is the status');

  perform test.eq((select count(*)::int from audit_logs where action = 'guest_bookings_transferred'), 1, 'one audit row');
  perform test.eq((select actor_user_id from audit_logs where action = 'guest_bookings_transferred'), m, 'naming the receiving account as actor');
  perform test.eq((select entity_id from audit_logs where action = 'guest_bookings_transferred'), m, 'about that account');
  perform test.eq((select (before->>'from_user')::uuid from audit_logs where action = 'guest_bookings_transferred'), a,
    'recording which guest the bookings came from');
  perform test.eq((select jsonb_array_length(before->'booking_ids') from audit_logs where action = 'guest_bookings_transferred'), 2,
    'and which bookings');
end
$$;

-- --------------------------------------------------------------------------
-- Idempotent: a repeated call is a no-op
-- --------------------------------------------------------------------------

do $$
declare a uuid := pg_temp.fx('anon_a'); m uuid := pg_temp.fx('member_m');
begin
  perform test.eq(transfer_guest_bookings(a, m), 0, 'a second call moves nothing');
  perform test.eq((select count(*)::int from bookings where user_id = m), 3, 'and changes nothing');
  perform test.eq((select count(*)::int from audit_logs where action = 'guest_bookings_transferred'), 1, 'and writes no second audit row');
end
$$;

-- --------------------------------------------------------------------------
-- The roles that must not be able to call it
-- --------------------------------------------------------------------------

set local role authenticated;
select test.become(pg_temp.fx('member_m'));
select test.raises(format('select transfer_guest_bookings(%L, %L)', pg_temp.fx('anon_b'), pg_temp.fx('member_m')),
  'a signed-in account cannot pull another guest''s bookings into itself');
set local role anon;
select test.raises(format('select transfer_guest_bookings(%L, %L)', pg_temp.fx('anon_b'), pg_temp.fx('member_m')),
  'the anon key cannot call it');
set local role service_role;
select test.eq(pg_temp.owner_of(pg_temp.fx('bk_b')), pg_temp.fx('anon_b'), 'and the other guest''s booking never moved');

rollback;
