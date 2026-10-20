-- redeem_voucher(text, uuid) — who may scan, and whose identity is recorded.
--
-- The old four-argument function took the scanner id and the vendor org as parameters and checked
-- neither against the caller, and was executable by PUBLIC. A tourist with no membership could
-- burn a voucher and name anyone as the scanner. This file asserts that the entry point takes
-- both from the server.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table fixture (k text primary key, v uuid) on commit drop;
grant select on fixture to anon, authenticated;

-- One real voucher, with its hash computed the way the entry point will compute it.
do $$
declare
  scanner uuid; noscan uuid; tourist uuid;
  org uuid; exp_a uuid; slot uuid; bk uuid;
  token text := 'cvip://v1/eyJ2IjoxLCJpZCI6IkFBQUFBQUFBQUFBQUFBQUFBQSJ9.c2lnc2lnc2ln';
begin
  insert into auth.users (email) values ('scan-yes@test.local')  returning id into scanner;
  insert into auth.users (email) values ('scan-no@test.local')   returning id into noscan;
  insert into auth.users (email) values ('scan-none@test.local') returning id into tourist;

  update profiles set display_name = 'Yes Scanner' where id = scanner;

  select id into org from vendor_organizations
   where trading_name = '[Demo] Negril Sunset Cruises';

  insert into vendor_members (vendor_org_id, user_id, role, can_scan_vouchers)
  values (org, scanner, 'vendor_staff', true),
         (org, noscan,  'vendor_staff', false);

  select e.id into exp_a from experiences e where e.vendor_org_id = org limit 1;
  select s.id into slot from availability_slots s where s.experience_id = exp_a limit 1;

  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference,
                        status, currency, subtotal_minor, tax_minor, service_fee_minor,
                        total_minor, commission_minor, seats)
  values (tourist, org, exp_a, slot, 'VIPJ-SCAN-0001', 'confirmed', 'USD',
          10000, 1500, 500, 12000, 1200, 1) returning id into bk;

  insert into vouchers (token_hash, user_id, booking_id, vendor_org_id, state, valid_until)
  values ('je1SoA-NKZ3pWKrYzNELzjvYYPaJXm8EPKU_VFmSM6U', tourist, bk, org, 'active',
          now() + interval '7 days');

  insert into fixture values
    ('scanner', scanner), ('noscan', noscan), ('tourist', tourist), ('org', org);
end
$$;

set local role authenticated;

-- --------------------------------------------------------------------------
-- Refusals
-- --------------------------------------------------------------------------

do $$
declare
  org   uuid := (select v from fixture where k = 'org');
  token text := 'cvip://v1/eyJ2IjoxLCJpZCI6IkFBQUFBQUFBQUFBQUFBQUFBQSJ9.c2lnc2lnc2ln';
begin
  -- The regression: someone with no membership at all.
  perform test.become((select v from fixture where k = 'tourist'));
  perform test.raises(
    format($q$ select * from redeem_voucher(%L, %L) $q$, token, org),
    'a user with no vendor membership cannot redeem'
  );

  -- can_scan_vouchers existed from the first migration and was enforced nowhere.
  perform test.become((select v from fixture where k = 'noscan'));
  perform test.raises(
    format($q$ select * from redeem_voucher(%L, %L) $q$, token, org),
    'a staff member without can_scan_vouchers cannot redeem'
  );
end
$$;

do $$
declare
  org   uuid := (select v from fixture where k = 'org');
  state voucher_state;
begin
  set local role service_role;
  select v.state into state from vouchers v
   where v.token_hash = 'je1SoA-NKZ3pWKrYzNELzjvYYPaJXm8EPKU_VFmSM6U';
  perform test.eq(state, 'active'::voucher_state, 'the refusals burned nothing');
  set local role authenticated;
end
$$;

-- The engine itself must no longer be reachable by a signed-in caller.
do $$
declare
  org uuid := (select v from fixture where k = 'org');
begin
  perform test.become((select v from fixture where k = 'scanner'));
  perform test.raises(
    format(
      $q$ select * from redeem_voucher_by_hash('je1SoA-NKZ3pWKrYzNELzjvYYPaJXm8EPKU_VFmSM6U', %L, auth.uid(), '{}'::jsonb) $q$,
      org
    ),
    'the decision engine is not callable by an authenticated user'
  );
end
$$;

-- --------------------------------------------------------------------------
-- The happy path, and whose name is recorded
-- --------------------------------------------------------------------------

do $$
declare
  org     uuid := (select v from fixture where k = 'org');
  scanner uuid := (select v from fixture where k = 'scanner');
  token   text := 'cvip://v1/eyJ2IjoxLCJpZCI6IkFBQUFBQUFBQUFBQUFBQUFBQSJ9.c2lnc2lnc2ln';
  r       record;
  logged  uuid;
begin
  perform test.become(scanner);

  select * into r from redeem_voucher(token, org);
  perform test.eq(r.result, 'ok'::redemption_result, 'a permitted scanner redeems the voucher');
  perform test.ok(r.redeemed_at is not null, 'the redemption time comes back');

  -- A second scan reports the FIRST one, by name — V-05 is about showing who scanned it, not
  -- merely refusing.
  select * into r from redeem_voucher(token, org);
  perform test.eq(r.result, 'already_redeemed'::redemption_result, 'the second scan is refused');
  perform test.eq(r.original_scanner, 'Yes Scanner', 'the first scanner is named, from profiles');
  perform test.ok(r.original_redeemed_at is not null, 'the first redemption time comes back');

  set local role service_role;
  select redeemed_by into logged from vouchers
   where token_hash = 'je1SoA-NKZ3pWKrYzNELzjvYYPaJXm8EPKU_VFmSM6U';
  perform test.eq(logged, scanner, 'redeemed_by is the authenticated scanner, not a parameter');
  set local role authenticated;
end
$$;

-- An unknown token is a decision, not an error: the scanner must be told, and the attempt logged.
do $$
declare
  org uuid := (select v from fixture where k = 'org');
  r   record;
  n   integer;
begin
  perform test.become((select v from fixture where k = 'scanner'));

  select * into r from redeem_voucher('cvip://v1/bogus.bogus', org);
  perform test.eq(r.result, 'unknown_token'::redemption_result, 'a forged token reports unknown');

  set local role service_role;
  select count(*) into n from voucher_redemptions where result = 'unknown_token';
  perform test.ok(n > 0, 'the bogus scan is still recorded for investigation');
end
$$;

rollback;
