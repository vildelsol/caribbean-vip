-- An offer voucher made by claim_promotion_voucher can be redeemed by the vendor's scanner.
--
-- Each half has its own test (claim_promotion_voucher, redeem_voucher_entry). Nothing joined them:
-- an offer voucher has no booking, and the scanner path was only exercised on booking vouchers.
-- This claims, then scans the QR string exactly as the scanner sends it, so a mismatch in how the
-- two sides hash the token shows up here rather than at a door.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table fx (k text primary key, v uuid) on commit drop;
grant select on fx to anon, authenticated;

do $$
declare
  guest uuid; scanner uuid; other_scanner uuid; org uuid; other_org uuid; promo uuid;
  token text := 'cvip://v1/eyJ2IjoxLCJpZCI6IkJCQkJCQkJCQkJCQkJCQkJCQiJ9.b2ZmZXJzaWc';
begin
  insert into auth.users (email) values ('offer-guest@test.local') returning id into guest;
  insert into auth.users (email) values ('offer-scan@test.local') returning id into scanner;
  insert into auth.users (email) values ('other-scan@test.local') returning id into other_scanner;

  select id into org from vendor_organizations where trading_name = '[Demo] Unverified Excursions' limit 1;
  select id into other_org from vendor_organizations where id <> org order by trading_name limit 1;

  insert into vendor_members (vendor_org_id, user_id, role, can_scan_vouchers)
  values (org, scanner, 'vendor_staff', true),
         (other_org, other_scanner, 'vendor_staff', true);

  insert into promotions (vendor_org_id, island_id, title, terms, value_kind,
                          starts_at, ends_at, inventory_limit, approval_state)
  select org, o.island_id, 'Claim then redeem', 'Test terms', 'in_kind',
         now() - interval '1 day', now() + interval '30 days', 5, 'approved'
    from vendor_organizations o where o.id = org
  returning id into promo;

  -- The hash the Edge Function stores is hashVoucherToken(token); the entry point recomputes it
  -- with voucher_token_hash(). Using the SQL function here is the point: if they disagree the
  -- redemption below reports unknown_token.
  perform claim_promotion_voucher(promo, guest, voucher_token_hash(token), now() + interval '7 days');

  insert into fx values ('guest', guest), ('scanner', scanner), ('other', other_scanner),
                        ('org', org), ('other_org', other_org), ('promo', promo);
end
$$;

set local role authenticated;

do $$
declare
  org   uuid := (select v from fx where k = 'org');
  other uuid := (select v from fx where k = 'other_org');
  token text := 'cvip://v1/eyJ2IjoxLCJpZCI6IkJCQkJCQkJCQkJCQkJCQkJCQiJ9.b2ZmZXJzaWc';
  r record;
begin
  -- Denial: a scanner for a different vendor cannot burn this vendor's offer voucher.
  perform test.become((select v from fx where k = 'other'));
  perform test.raises(
    format($q$ select * from redeem_voucher(%L, %L) $q$, token, org),
    'a scanner from another vendor cannot redeem this vendor''s offer voucher'
  );

  -- Positive control: the right vendor's scanner redeems it, once.
  perform test.become((select v from fx where k = 'scanner'));
  select * into r from redeem_voucher(token, org);
  perform test.eq(r.result, 'ok'::redemption_result, 'the vendor''s scanner redeems a claimed offer voucher');

  select * into r from redeem_voucher(token, org);
  perform test.eq(r.result, 'already_redeemed'::redemption_result, 'a second scan is refused');

  -- Wrong org named by an authorised scanner of that org: the voucher is not theirs.
  perform test.become((select v from fx where k = 'other'));
  select * into r from redeem_voucher(token, other);
  perform test.ok(r.result <> 'ok'::redemption_result, 'naming the right to scan for another org does not redeem it');
end
$$;

rollback;
