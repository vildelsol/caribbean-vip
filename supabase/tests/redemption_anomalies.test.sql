-- Redemption anomalies: who can read them, when each pattern fires, and that thresholds cannot be
-- set so a pattern is switched off. Each flag is tested at its threshold and one below it, and each
-- denial sits beside a positive control, so "nothing is flagged" cannot pass as "it works".

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table fx (k text primary key, v uuid) on commit drop;
grant select on fx to anon, authenticated;

do $$
declare
  admin_u uuid; staff uuid; tourist uuid;
  s_a uuid; s_b uuid; s_c uuid; s_d uuid; s_e uuid; s_f uuid; s_g uuid; s_h uuid;
  org uuid; promo uuid; v_hot uuid; v_cool uuid;
begin
  insert into auth.users (email) values ('an-admin@test.local')   returning id into admin_u;
  insert into auth.users (email) values ('an-staff@test.local')   returning id into staff;
  insert into auth.users (email) values ('an-tourist@test.local') returning id into tourist;
  insert into auth.users (email) values ('an-sa@test.local') returning id into s_a;
  insert into auth.users (email) values ('an-sb@test.local') returning id into s_b;
  insert into auth.users (email) values ('an-sc@test.local') returning id into s_c;
  insert into auth.users (email) values ('an-sd@test.local') returning id into s_d;
  insert into auth.users (email) values ('an-se@test.local') returning id into s_e;
  insert into auth.users (email) values ('an-sf@test.local') returning id into s_f;
  insert into auth.users (email) values ('an-sg@test.local') returning id into s_g;
  insert into auth.users (email) values ('an-sh@test.local') returning id into s_h;
  update profiles set role = 'admin' where id = admin_u;

  select id into org from vendor_organizations order by trading_name limit 1;
  insert into vendor_members (vendor_org_id, user_id, role, can_scan_vouchers) values (org, staff, 'vendor_staff', true);

  insert into promotions (vendor_org_id, island_id, title, terms, value_kind, starts_at, ends_at, inventory_limit, approval_state)
  select org, o.island_id, 'Anomaly fixture', 't', 'in_kind', now() - interval '1 day', now() + interval '30 days', 5, 'approved'
    from vendor_organizations o where o.id = org
  returning id into promo;

  insert into vouchers (token_hash, user_id, promotion_id, vendor_org_id, state, valid_until)
  values ('an-hot',  tourist, promo, org, 'active', now() + interval '1 day') returning id into v_hot;
  insert into vouchers (token_hash, user_id, promotion_id, vendor_org_id, state, valid_until)
  values ('an-cool', admin_u, promo, org, 'active', now() + interval '1 day') returning id into v_cool;

  -- A: 10 unknown tokens inside an hour (at default) for s_a; 9 for s_b (one below).
  insert into voucher_redemptions (token_hash, scanner_user_id, vendor_org_id, result, scanned_at)
  select 'a' || g, s_a, org, 'unknown_token', now() - interval '50 minutes' + g * interval '1 minute' from generate_series(1, 10) g;
  insert into voucher_redemptions (token_hash, scanner_user_id, vendor_org_id, result, scanned_at)
  select 'b' || g, s_b, org, 'unknown_token', now() - interval '50 minutes' + g * interval '1 minute' from generate_series(1, 9) g;
  -- Rolling window, not a total: 10 unknown tokens spread over 10 hours must not flag s_e.
  insert into voucher_redemptions (token_hash, scanner_user_id, vendor_org_id, result, scanned_at)
  select 'e' || g, s_e, org, 'unknown_token', now() - g * interval '1 hour' from generate_series(1, 10) g;

  -- B: 3 wrong_vendor inside a day for s_c; 2 for s_d.
  insert into voucher_redemptions (token_hash, scanner_user_id, vendor_org_id, result, scanned_at)
  select 'c' || g, s_c, org, 'wrong_vendor', now() - g * interval '1 hour' from generate_series(1, 3) g;
  insert into voucher_redemptions (token_hash, scanner_user_id, vendor_org_id, result, scanned_at)
  select 'd' || g, s_d, org, 'wrong_vendor', now() - g * interval '1 hour' from generate_series(1, 2) g;

  -- C: v_hot scanned again twice after redemption (at default 2); v_cool once (below).
  insert into voucher_redemptions (voucher_id, scanner_user_id, vendor_org_id, result, scanned_at)
  select v_hot, s_f, org, 'already_redeemed', now() - g * interval '1 hour' from generate_series(1, 2) g;
  insert into voucher_redemptions (voucher_id, scanner_user_id, vendor_org_id, result, scanned_at)
  values (v_cool, s_f, org, 'already_redeemed', now() - interval '1 hour');

  -- D: 20 ok scans inside a minute for s_g (at default); 19 for s_h (below).
  insert into voucher_redemptions (scanner_user_id, vendor_org_id, result, scanned_at)
  select s_g, org, 'ok', now() - interval '30 minutes' + g * interval '1 second' from generate_series(1, 20) g;
  insert into voucher_redemptions (scanner_user_id, vendor_org_id, result, scanned_at)
  select s_h, org, 'ok', now() - interval '30 minutes' + g * interval '1 second' from generate_series(1, 19) g;

  insert into fx values ('admin', admin_u), ('staff', staff), ('tourist', tourist),
    ('sa', s_a), ('sb', s_b), ('sc', s_c), ('sd', s_d), ('se', s_e), ('sg', s_g), ('sh', s_h),
    ('hot', v_hot), ('cool', v_cool);
end
$$;

set local role authenticated;

-- --------------------------------------------------------------------------
-- Who may read
-- --------------------------------------------------------------------------

do $$
begin
  perform test.become((select v from fx where k = 'tourist'));
  perform test.raises($q$ select * from redemption_anomalies() $q$, 'a tourist cannot read anomalies');
  perform test.become((select v from fx where k = 'staff'));
  perform test.raises($q$ select * from redemption_anomalies() $q$, 'vendor staff cannot read anomalies');
  perform test.become_anon();
  perform test.raises($q$ select * from redemption_anomalies() $q$, 'anon cannot read anomalies');
end
$$;

-- --------------------------------------------------------------------------
-- Each pattern, at the threshold and one below (admin: the positive control)
-- --------------------------------------------------------------------------

do $$
declare
  flagged int;
  is_flag boolean;
begin
  perform test.become((select v from fx where k = 'admin'));

  select count(*) into flagged from redemption_anomalies();
  perform test.ok(flagged = 4, format('admin sees exactly the four flags, got %s', flagged));

  select exists (select 1 from redemption_anomalies() where pattern = 'unknown_token_burst' and scanner_user_id = (select v from fx where k = 'sa')) into is_flag;
  perform test.ok(is_flag, 'A fires at 10 unknown tokens in an hour');
  select exists (select 1 from redemption_anomalies() where scanner_user_id = (select v from fx where k = 'sb')) into is_flag;
  perform test.ok(not is_flag, 'A does not fire at 9');
  select exists (select 1 from redemption_anomalies() where scanner_user_id = (select v from fx where k = 'se')) into is_flag;
  perform test.ok(not is_flag, 'A is a rolling window: 10 over 10 hours does not fire');

  select exists (select 1 from redemption_anomalies() where pattern = 'wrong_vendor_repeat' and scanner_user_id = (select v from fx where k = 'sc')) into is_flag;
  perform test.ok(is_flag, 'B fires at 3 wrong_vendor in a day');
  select exists (select 1 from redemption_anomalies() where scanner_user_id = (select v from fx where k = 'sd')) into is_flag;
  perform test.ok(not is_flag, 'B does not fire at 2');

  select exists (select 1 from redemption_anomalies() where pattern = 'voucher_rescanned' and voucher_id = (select v from fx where k = 'hot')) into is_flag;
  perform test.ok(is_flag, 'C fires at 2 repeat scans of one voucher');
  select exists (select 1 from redemption_anomalies() where voucher_id = (select v from fx where k = 'cool')) into is_flag;
  perform test.ok(not is_flag, 'C does not fire at 1');

  select exists (select 1 from redemption_anomalies() where pattern = 'scan_rate' and scanner_user_id = (select v from fx where k = 'sg')) into is_flag;
  perform test.ok(is_flag, 'D fires at 20 ok scans in a minute');
  select exists (select 1 from redemption_anomalies() where scanner_user_id = (select v from fx where k = 'sh')) into is_flag;
  perform test.ok(not is_flag, 'D does not fire at 19');
end
$$;

-- --------------------------------------------------------------------------
-- Thresholds: a valid change takes effect; an invalid one is refused
-- --------------------------------------------------------------------------

do $$
declare is_flag boolean;
begin
  set local role service_role;

  -- Positive control: a valid lower threshold makes s_b (9 unknown tokens) fire.
  update platform_settings
     set value = '{"unknown_token_per_hour":9,"wrong_vendor_per_day":3,"repeat_scans_per_voucher":2,"ok_scans_per_minute":20}'
   where key = 'redemption.anomaly_thresholds';
  set local role authenticated;
  perform test.become((select v from fx where k = 'admin'));
  select exists (select 1 from redemption_anomalies() where scanner_user_id = (select v from fx where k = 'sb')) into is_flag;
  perform test.ok(is_flag, 'lowering the threshold to 9 flags the scanner with 9');
end
$$;

do $$
begin
  set local role service_role;
  perform test.raises($q$ update platform_settings set value = '{"unknown_token_per_hour":0,"wrong_vendor_per_day":3,"repeat_scans_per_voucher":2,"ok_scans_per_minute":20}' where key = 'redemption.anomaly_thresholds' $q$, 'a threshold of 0 is refused');
  perform test.raises($q$ update platform_settings set value = '{"unknown_token_per_hour":1000000,"wrong_vendor_per_day":3,"repeat_scans_per_voucher":2,"ok_scans_per_minute":20}' where key = 'redemption.anomaly_thresholds' $q$, 'a threshold above its ceiling (which would switch the pattern off) is refused');
  perform test.raises($q$ update platform_settings set value = '{"unknown_token_per_hour":2.5,"wrong_vendor_per_day":3,"repeat_scans_per_voucher":2,"ok_scans_per_minute":20}' where key = 'redemption.anomaly_thresholds' $q$, 'a fractional threshold is refused');
  perform test.raises($q$ update platform_settings set value = '{"unknown_token_per_hour":"10","wrong_vendor_per_day":3,"repeat_scans_per_voucher":2,"ok_scans_per_minute":20}' where key = 'redemption.anomaly_thresholds' $q$, 'a text threshold is refused');
  perform test.raises($q$ update platform_settings set value = '{"unknown_token_per_hour":10}' where key = 'redemption.anomaly_thresholds' $q$, 'a missing key is refused');
  perform test.raises($q$ update platform_settings set value = '[]' where key = 'redemption.anomaly_thresholds' $q$, 'a non-object is refused');
end
$$;

-- The reader tightens nothing and disables nothing if a bad row exists anyway (written around the
-- trigger): the default stands for each invalid value.
do $$
declare t record;
begin
  reset role;
  alter table platform_settings disable trigger platform_settings_redemption_thresholds;
  update platform_settings
     set value = '{"unknown_token_per_hour":0,"wrong_vendor_per_day":999999,"repeat_scans_per_voucher":"x","ok_scans_per_minute":20}'
   where key = 'redemption.anomaly_thresholds';
  select * into t from redemption_anomaly_thresholds();
  perform test.eq(t.unknown_token_per_hour, 10, 'an invalid 0 falls back to the default 10');
  perform test.eq(t.wrong_vendor_per_day, 3, 'an over-ceiling value falls back to the default 3');
  perform test.eq(t.repeat_scans_per_voucher, 2, 'a text value falls back to the default 2');
  perform test.eq(t.ok_scans_per_minute, 20, 'a valid value is kept');
  delete from platform_settings where key = 'redemption.anomaly_thresholds';
  select * into t from redemption_anomaly_thresholds();
  perform test.eq(t.unknown_token_per_hour, 10, 'a deleted setting falls back to every default');
  reset role;
  alter table platform_settings enable trigger platform_settings_redemption_thresholds;
end
$$;

rollback;
