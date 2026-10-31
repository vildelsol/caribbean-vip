-- claim_promotion_voucher: the voucher and the inventory count move together, or not at all.
--
-- Sequential branches only. The race for the last unit needs live sessions and is in
-- scripts/db-concurrency-test.sh. Each refusal sits beside a positive control (the first claim
-- succeeds), and the grant tests pair a denial for anon/authenticated with the service role
-- still working, so "nobody can call it" cannot pass as "locked down".

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table fx (k text primary key, v uuid) on commit drop;
grant select on fx to anon, authenticated;

do $$
declare
  guest_a uuid; guest_b uuid; org uuid;
  promo uuid; promo_pending uuid; promo_expired uuid;
begin
  insert into auth.users (email) values ('claim-a@test.local') returning id into guest_a;
  insert into auth.users (email) values ('claim-b@test.local') returning id into guest_b;

  select id into org from vendor_organizations
   where trading_name = '[Demo] Unverified Excursions' limit 1;
  if org is null then raise exception 'fixture: expected a seeded vendor'; end if;

  insert into promotions (vendor_org_id, island_id, title, terms, value_kind,
                          starts_at, ends_at, inventory_limit, approval_state)
  select org, o.island_id, t.title, 'Test terms', 'in_kind', t.s, t.e, t.lim, t.st::approval_state
    from vendor_organizations o,
         (values ('Claim one',     now() - interval '1 day',  now() + interval '30 days', 1,    'approved'),
                 ('Claim pending', now() - interval '1 day',  now() + interval '30 days', 5,    'pending'),
                 ('Claim expired', now() - interval '30 days', now() - interval '1 day',  5,    'approved')
         ) as t(title, s, e, lim, st)
   where o.id = org;

  select id into promo         from promotions where title = 'Claim one';
  select id into promo_pending from promotions where title = 'Claim pending';
  select id into promo_expired from promotions where title = 'Claim expired';

  insert into fx values ('a', guest_a), ('b', guest_b), ('promo', promo),
                        ('pending', promo_pending), ('expired', promo_expired);
end
$$;

do $$
declare
  promo uuid := (select v from fx where k = 'promo');
  a uuid := (select v from fx where k = 'a');
  b uuid := (select v from fx where k = 'b');
  r record; n integer; issued integer;
begin
  -- Positive control: the first claim works and is counted.
  select * into r from claim_promotion_voucher(promo, a, 'hash-a', now() + interval '7 days');
  perform test.eq(r.outcome, 'claimed', 'the first claim succeeds');
  perform test.ok(r.voucher_id is not null, 'a voucher id comes back');
  select issued_count into issued from promotions where id = promo;
  perform test.eq(issued, 1, 'issued_count moved by exactly one');

  -- Same guest again: refused, and not counted a second time.
  select * into r from claim_promotion_voucher(promo, a, 'hash-a2', now() + interval '7 days');
  perform test.eq(r.outcome, 'already_claimed', 'the same guest cannot claim twice');
  select issued_count into issued from promotions where id = promo;
  perform test.eq(issued, 1, 'a repeat claim does not move issued_count');
  select count(*) into n from vouchers where promotion_id = promo;
  perform test.eq(n, 1, 'a repeat claim inserts no voucher');

  -- Inventory of one is spent: another guest is turned away.
  select * into r from claim_promotion_voucher(promo, b, 'hash-b', now() + interval '7 days');
  perform test.eq(r.outcome, 'sold_out', 'a second guest is refused once inventory is spent');
  select issued_count into issued from promotions where id = promo;
  perform test.eq(issued, 1, 'a sold-out claim does not push issued_count past the limit');

  -- The voucher is capped at the promotion window.
  perform test.ok(
    (select valid_until <= (select ends_at from promotions where id = promo)
       from vouchers where promotion_id = promo),
    'valid_until never outlasts the promotion');
end
$$;

do $$
declare
  a uuid := (select v from fx where k = 'a');
  r record;
begin
  select * into r from claim_promotion_voucher(
    (select v from fx where k = 'pending'), a, 'hash-p', now() + interval '7 days');
  perform test.eq(r.outcome, 'not_available', 'a pending promotion cannot be claimed');
  select * into r from claim_promotion_voucher(
    (select v from fx where k = 'expired'), a, 'hash-e', now() + interval '7 days');
  perform test.eq(r.outcome, 'not_available', 'an expired promotion cannot be claimed');
  select * into r from claim_promotion_voucher(gen_random_uuid(), a, 'hash-x', now() + interval '7 days');
  perform test.eq(r.outcome, 'not_available', 'an unknown promotion cannot be claimed');
  perform test.eq((select count(*)::int from vouchers where token_hash in ('hash-p','hash-e','hash-x')), 0,
    'refused claims leave no voucher behind');
end
$$;

-- Privilege: only the service role may call it.
set local role authenticated;
do $$
begin
  perform test.raises(
    format($q$ select claim_promotion_voucher(%L, %L, 'h', now() + interval '1 day') $q$,
           (select v from fx where k = 'promo'), (select v from fx where k = 'b')),
    'an authenticated caller cannot execute claim_promotion_voucher');
end
$$;

set local role anon;
do $$
begin
  perform test.raises(
    format($q$ select claim_promotion_voucher(%L, %L, 'h', now() + interval '1 day') $q$,
           (select v from fx where k = 'promo'), (select v from fx where k = 'b')),
    'anon cannot execute claim_promotion_voucher');
end
$$;

rollback;
