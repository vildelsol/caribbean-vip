-- voucher_redemptions stays a log, but a scanner's identity can go: by the foreign key (account
-- deleted) and by the 2-year scrub. Everything else about a row stays frozen. Each denial has a
-- positive control.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;
set local role service_role;

do $$
declare
  u uuid; r_new uuid; r_old uuid; r_keep uuid; res jsonb; n integer;
begin
  insert into auth.users (email) values ('scanner@test.local') returning id into u;

  insert into voucher_redemptions (token_hash, scanner_user_id, result, device_meta)
  values ('scrub-new', u, 'unknown_token', '{"ua":"x"}') returning id into r_new;
  insert into voucher_redemptions (token_hash, scanner_user_id, result, device_meta, scanned_at)
  values ('scrub-old', u, 'unknown_token', '{"ua":"x"}', now() - interval '2 years 1 day') returning id into r_old;
  insert into voucher_redemptions (token_hash, scanner_user_id, result, device_meta, scanned_at)
  values ('scrub-keep', u, 'unknown_token', '{"ua":"x"}', now() - interval '1 year') returning id into r_keep;

  -- still frozen
  perform test.raises(format($q$ update voucher_redemptions set result = 'ok' where id = %L $q$, r_new), 'result cannot change');
  perform test.raises(format($q$ update voucher_redemptions set token_hash = 'x' where id = %L $q$, r_new), 'token hash cannot change');
  perform test.raises(format($q$ update voucher_redemptions set scanned_at = now() where id = %L $q$, r_new), 'time cannot change');
  perform test.raises(format($q$ update voucher_redemptions set scanner_user_id = gen_random_uuid() where id = %L $q$, r_new), 'scanner cannot be swapped for another');
  perform test.raises(format($q$ update voucher_redemptions set scanner_user_id = null, result = 'ok' where id = %L $q$, r_new), 'identity scrub cannot carry another change');
  perform test.raises(format($q$ update voucher_redemptions set scanner_user_id = null, device_meta = '{"ua":"other"}' where id = %L $q$, r_new), 'device details cannot be rewritten, only kept or emptied');
  perform test.raises(format($q$ delete from voucher_redemptions where id = %L $q$, r_new), 'DELETE still refused');

  -- the scrub removes only identity, only past 2 years
  res := purge_expired_records();
  perform test.eq((res ->> 'scans_scrubbed')::int, 1, 'scrubs the one scan older than 2 years');
  select count(*) into n from voucher_redemptions where id = r_old and scanner_user_id is null and device_meta = '{}'::jsonb and result = 'unknown_token' and token_hash = 'scrub-old';
  perform test.eq(n, 1, 'old row keeps result and token hash, loses scanner and device');
  select count(*) into n from voucher_redemptions where id in (r_new, r_keep) and scanner_user_id = u;
  perform test.eq(n, 2, 'newer rows keep their scanner');

  -- the foreign key can now do its job: deleting the account no longer fails
  delete from auth.users where id = u;
  select count(*) into n from voucher_redemptions where id in (r_new, r_keep) and scanner_user_id is null;
  perform test.eq(n, 2, 'deleting the scanner account nulls the scanner on its rows');
  select count(*) into n from voucher_redemptions where id in (r_new, r_keep, r_old);
  perform test.eq(n, 3, 'and no scan row was lost');
end
$$;

rollback;
