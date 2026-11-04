-- Reviewing a redemption flag: admin only, never silent, never ahead of time.
-- Each denial sits beside a positive control (an admin's review works).

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table fx (k text primary key, v uuid) on commit drop;
grant select on fx to anon, authenticated;

do $$
declare
  admin_a uuid; admin_b uuid; staff uuid; tourist uuid; s_a uuid; s_b uuid; s_f uuid;
  org uuid; promo uuid; v_hot uuid;
begin
  insert into auth.users (email) values ('rv-admin-a@test.local') returning id into admin_a;
  insert into auth.users (email) values ('rv-admin-b@test.local') returning id into admin_b;
  insert into auth.users (email) values ('rv-staff@test.local')   returning id into staff;
  insert into auth.users (email) values ('rv-tourist@test.local') returning id into tourist;
  insert into auth.users (email) values ('rv-sa@test.local') returning id into s_a;
  insert into auth.users (email) values ('rv-sb@test.local') returning id into s_b;
  insert into auth.users (email) values ('rv-sf@test.local') returning id into s_f;
  update profiles set role = 'admin' where id in (admin_a, admin_b);

  select id into org from vendor_organizations order by trading_name limit 1;
  insert into vendor_members (vendor_org_id, user_id, role, can_scan_vouchers) values (org, staff, 'vendor_staff', true);
  insert into promotions (vendor_org_id, island_id, title, terms, value_kind, starts_at, ends_at, inventory_limit, approval_state)
  select org, o.island_id, 'Review fixture', 't', 'in_kind', now() - interval '1 day', now() + interval '30 days', 5, 'approved'
    from vendor_organizations o where o.id = org returning id into promo;
  insert into vouchers (token_hash, user_id, promotion_id, vendor_org_id, state, valid_until)
  values ('rv-hot', tourist, promo, org, 'active', now() + interval '1 day') returning id into v_hot;

  -- s_a: 10 unknown tokens inside an hour: flagged. s_b: 9: not flagged.
  insert into voucher_redemptions (token_hash, scanner_user_id, vendor_org_id, result, scanned_at)
  select 'ra' || g, s_a, org, 'unknown_token', now() - interval '50 minutes' + g * interval '1 minute' from generate_series(1, 10) g;
  insert into voucher_redemptions (token_hash, scanner_user_id, vendor_org_id, result, scanned_at)
  select 'rb' || g, s_b, org, 'unknown_token', now() - interval '50 minutes' + g * interval '1 minute' from generate_series(1, 9) g;
  -- v_hot rescanned twice: flagged by voucher.
  insert into voucher_redemptions (voucher_id, scanner_user_id, vendor_org_id, result, scanned_at)
  select v_hot, s_f, org, 'already_redeemed', now() - g * interval '1 hour' from generate_series(1, 2) g;

  insert into fx values ('admin_a', admin_a), ('admin_b', admin_b), ('staff', staff), ('tourist', tourist),
    ('sa', s_a), ('sb', s_b), ('org', org), ('hot', v_hot);
end
$$;

set local role authenticated;

-- Denials, each beside the admin positive control further down.
do $$
declare sa uuid := (select v from fx where k = 'sa');
begin
  perform test.become((select v from fx where k = 'tourist'));
  perform test.raises(format($q$ select review_redemption_anomaly('unknown_token_burst', %L, null, null) $q$, sa), 'a tourist cannot review');
  perform test.become((select v from fx where k = 'staff'));
  perform test.raises(format($q$ select review_redemption_anomaly('unknown_token_burst', %L, null, null) $q$, sa), 'vendor staff cannot review');
  perform test.become_anon();
  perform test.raises(format($q$ select review_redemption_anomaly('unknown_token_burst', %L, null, null) $q$, sa), 'anon cannot review');

  -- An admin may not insert review rows directly either: no insert policy.
  perform test.become((select v from fx where k = 'admin_a'));
  perform test.raises(
    format($q$ insert into redemption_anomaly_reviews (pattern, scanner_user_id, flag_last_at, reviewed_by)
              values ('unknown_token_burst', %L, now() + interval '100 years', %L) $q$, sa, (select v from fx where k = 'admin_a')),
    'no direct insert, so a review cannot be written ahead of time');
end
$$;

do $$
declare
  admin_a uuid := (select v from fx where k = 'admin_a');
  admin_b uuid := (select v from fx where k = 'admin_b');
  sa uuid := (select v from fx where k = 'sa');
  sb uuid := (select v from fx where k = 'sb');
  hot uuid := (select v from fx where k = 'hot');
  org uuid := (select v from fx where k = 'org');
  r record; n int; who uuid;
begin
  perform test.become(admin_a);

  -- No flag exists for s_b (9 scans): nothing to review, so a flag cannot be pre-silenced.
  perform test.raises(format($q$ select review_redemption_anomaly('unknown_token_burst', %L, null, null) $q$, sb),
    'cannot review a flag that does not exist');
  -- Wrong shape: both a scanner and a voucher.
  perform test.raises(format($q$ select review_redemption_anomaly('unknown_token_burst', %L, %L, null) $q$, sa, hot),
    'a review names a scanner or a voucher, not both');
  perform test.raises(format($q$ select review_redemption_anomaly('made_up', %L, null, null) $q$, sa),
    'an unknown pattern is refused');
  perform test.raises(format($q$ select review_redemption_anomaly('unknown_token_burst', %L, null, %L) $q$, sa, repeat('x', 501)),
    'a note over 500 characters is refused');

  -- Open before review.
  select * into r from redemption_anomalies() where pattern = 'unknown_token_burst' and scanner_user_id = sa;
  perform test.ok(r.reviewed_at is null, 'the flag starts open');

  -- Positive control: an admin reviews it.
  perform review_redemption_anomaly('unknown_token_burst', sa, null, '  checked with the vendor  ');
  select * into r from redemption_anomalies() where pattern = 'unknown_token_burst' and scanner_user_id = sa;
  perform test.ok(r.reviewed_at is not null, 'the flag shows as reviewed');
  perform test.eq(r.reviewed_by, admin_a, 'the reviewer is the caller');
  select count(*) into n from redemption_anomalies() where pattern = 'unknown_token_burst';
  perform test.eq(n, 1, 'a reviewed flag is still listed, not hidden');

  -- The reviewer comes from auth.uid(): a second admin is recorded as themselves.
  perform test.become(admin_b);
  perform review_redemption_anomaly('voucher_rescanned', null, hot, null);
  select reviewed_by into who from redemption_anomalies() where pattern = 'voucher_rescanned' and voucher_id = hot;
  perform test.eq(who, admin_b, 'a second admin is recorded as the reviewer');

  -- A newer scan reopens a reviewed flag.
  set local role service_role;
  insert into voucher_redemptions (token_hash, scanner_user_id, vendor_org_id, result, scanned_at)
  values ('rnew', sa, org, 'unknown_token', now() + interval '1 minute');
  set local role authenticated;
  perform test.become(admin_a);
  select * into r from redemption_anomalies() where pattern = 'unknown_token_burst' and scanner_user_id = sa;
  perform test.ok(r.reviewed_at is null, 'a newer scan reopens the reviewed flag');
  perform review_redemption_anomaly('unknown_token_burst', sa, null, null);
  select * into r from redemption_anomalies() where pattern = 'unknown_token_burst' and scanner_user_id = sa;
  perform test.ok(r.reviewed_at is not null, 'it can be reviewed again');

  -- A blank note is stored as null; the note and reviewer are what the table holds.
  set local role service_role;
  select count(*) into n from redemption_anomaly_reviews where note is null;
  perform test.ok(n >= 1, 'a blank note is stored as null');
  select count(*) into n from redemption_anomaly_reviews where note = 'checked with the vendor';
  perform test.eq(n, 1, 'a note is trimmed');
end
$$;

-- Append-only: not even the system can change a review.
do $$
begin
  set local role service_role;
  perform test.raises($q$ update redemption_anomaly_reviews set note = 'edited' $q$, 'a review cannot be edited');
end
$$;

rollback;
