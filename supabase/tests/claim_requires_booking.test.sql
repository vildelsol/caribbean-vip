-- A promotion that requires a booking issues an 'issued' voucher at claim; a standalone one 'active'.
--
-- 20261103000003 made standalone claims scannable (they used to sit 'issued' and scan as
-- not_yet_valid). Only the standalone half was tested. The other half matters as much: if
-- requires_booking = true ever produced an 'active' voucher, a guest could redeem the offer at the
-- door without having booked, which is the condition the flag exists to enforce.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;
set local role service_role;

do $$
declare
  org uuid; guest_a uuid; guest_b uuid; scanner uuid;
  p_booking uuid; p_standalone uuid;
  r record; st voucher_state;
begin
  insert into auth.users (email) values ('rb-a@test.local') returning id into guest_a;
  insert into auth.users (email) values ('rb-b@test.local') returning id into guest_b;
  insert into auth.users (email) values ('rb-scan@test.local') returning id into scanner;
  select id into org from vendor_organizations where trading_name = '[Demo] Unverified Excursions' limit 1;
  insert into vendor_members (vendor_org_id, user_id, role) values (org, scanner, 'vendor_staff');

  insert into promotions (vendor_org_id, island_id, title, terms, value_kind, starts_at, ends_at,
                          inventory_limit, approval_state, requires_booking)
  select org, o.island_id, t.title, 'T', 'in_kind', now() - interval '1 day', now() + interval '30 days', 5,
         'approved', t.rb
    from vendor_organizations o, (values ('RB needs booking', true), ('RB standalone', false)) as t(title, rb)
   where o.id = org;
  select id into p_booking    from promotions where title = 'RB needs booking';
  select id into p_standalone from promotions where title = 'RB standalone';

  -- Requires a booking: the voucher is issued, not active, and a scan is refused.
  select * into r from claim_promotion_voucher(p_booking, guest_a, 'rb-hash-booking', now() + interval '7 days');
  perform test.eq(r.outcome, 'claimed', 'a requires_booking promotion can be claimed');
  select state into st from vouchers where id = r.voucher_id;
  perform test.eq(st, 'issued'::voucher_state, 'its voucher is issued, not active');
  select * into r from redeem_voucher_by_hash('rb-hash-booking', org, scanner);
  perform test.eq(r.result, 'not_yet_valid'::redemption_result, 'it cannot be redeemed at the door before a booking attaches it');
  select state into st from vouchers where token_hash = 'rb-hash-booking';
  perform test.eq(st, 'issued'::voucher_state, 'and the refused scan did not activate it');

  -- Standalone (positive control for the same machinery): active, and redeemable.
  select * into r from claim_promotion_voucher(p_standalone, guest_b, 'rb-hash-standalone', now() + interval '7 days');
  select state into st from vouchers where id = r.voucher_id;
  perform test.eq(st, 'active'::voucher_state, 'a standalone promotion issues an active voucher (control)');
  select * into r from redeem_voucher_by_hash('rb-hash-standalone', org, scanner);
  perform test.eq(r.result, 'ok'::redemption_result, 'and it redeems (control)');
end $$;

rollback;
