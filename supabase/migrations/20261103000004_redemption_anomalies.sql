-- Redemption anomalies (OD-10): flags for an admin to look at. Never changes a redemption result.
--
-- Source is `voucher_redemptions`, which is append-only and logs every scan including failures, so
-- a scanner cannot make their own flags disappear. Four patterns, per docs/redemption-anomalies.md:
--   unknown_token_burst  one scanner, many unknown tokens inside an hour (guessing or forging)
--   wrong_vendor_repeat  one scanner, repeated wrong_vendor inside a day
--   voucher_rescanned    one voucher scanned again after it was redeemed (shared screenshot)
--   scan_rate            one scanner, many ok scans inside a minute (scanning with no guests)
--
-- Safeguards, each proven by a test that fails without it:
--   * Thresholds live in platform_settings, written by super_admin only (the existing policy), and
--     a trigger rejects a value that is missing, not an integer, below 1 or above a hard ceiling. A
--     threshold cannot be raised high enough to switch a pattern off.
--   * The reader falls back to the default for any single value that is not valid, so a bad row
--     (written around the trigger) tightens nothing and disables nothing.
--   * redemption_anomalies() refuses anyone who is not an admin, and is revoked from public AND anon.

-- --------------------------------------------------------------------------
-- Thresholds
-- --------------------------------------------------------------------------

insert into platform_settings (key, value, description)
values (
  'redemption.anomaly_thresholds',
  '{"unknown_token_per_hour":10,"wrong_vendor_per_day":3,"repeat_scans_per_voucher":2,"ok_scans_per_minute":20}'::jsonb,
  'Redemption anomaly flags (OD-10). Whole numbers, 1 up to a ceiling. A flag is for an admin to review; it never blocks a scan.'
)
on conflict (key) do nothing;

-- Defaults and ceilings in one place, used by both the trigger and the reader.
create or replace function redemption_anomaly_limits()
returns table (name text, default_value integer, ceiling integer)
language sql
immutable
as $$
  select * from (values
    ('unknown_token_per_hour',     10,  50),
    ('wrong_vendor_per_day',        3,  20),
    ('repeat_scans_per_voucher',    2,  10),
    ('ok_scans_per_minute',        20, 100)
  ) as t(name, default_value, ceiling);
$$;

create or replace function assert_redemption_thresholds()
returns trigger
language plpgsql
as $$
declare
  lim record;
  v   jsonb;
begin
  if new.key <> 'redemption.anomaly_thresholds' then
    return new;
  end if;
  if jsonb_typeof(new.value) <> 'object' then
    raise exception 'redemption.anomaly_thresholds must be an object';
  end if;
  if (select count(*) from jsonb_object_keys(new.value)) <> (select count(*) from redemption_anomaly_limits()) then
    raise exception 'redemption.anomaly_thresholds must hold exactly the four known keys';
  end if;
  for lim in select * from redemption_anomaly_limits() loop
    v := new.value -> lim.name;
    if v is null
       or jsonb_typeof(v) <> 'number'
       or (v #>> '{}') !~ '^[0-9]+$'
       or (v #>> '{}')::numeric < 1
       or (v #>> '{}')::numeric > lim.ceiling then
      raise exception '% must be a whole number from 1 to %', lim.name, lim.ceiling;
    end if;
  end loop;
  return new;
end;
$$;

create trigger platform_settings_redemption_thresholds
  before insert or update on platform_settings
  for each row execute function assert_redemption_thresholds();

-- Each value, or its default when the stored one is not valid.
create or replace function redemption_anomaly_thresholds()
returns table (unknown_token_per_hour integer, wrong_vendor_per_day integer,
               repeat_scans_per_voucher integer, ok_scans_per_minute integer)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select value from platform_settings where key = 'redemption.anomaly_thresholds'),
  pick as (
    select l.name,
           case
             when jsonb_typeof(s.value -> l.name) = 'number'
              and (s.value -> l.name) #>> '{}' ~ '^[0-9]+$'
              and ((s.value -> l.name) #>> '{}')::numeric between 1 and l.ceiling
             then ((s.value -> l.name) #>> '{}')::integer
             else l.default_value
           end as v
      from redemption_anomaly_limits() l
      left join s on true
  )
  select
    (select v from pick where name = 'unknown_token_per_hour'),
    (select v from pick where name = 'wrong_vendor_per_day'),
    (select v from pick where name = 'repeat_scans_per_voucher'),
    (select v from pick where name = 'ok_scans_per_minute');
$$;

revoke execute on function redemption_anomaly_thresholds() from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- The flags
-- --------------------------------------------------------------------------

create or replace function redemption_anomalies()
returns table (
  pattern         text,
  scanner_user_id uuid,
  vendor_org_id   uuid,
  voucher_id      uuid,
  scan_count      integer,
  first_at        timestamptz,
  last_at         timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  t record;
begin
  if not is_admin() then
    raise exception 'only an admin may read redemption anomalies';
  end if;

  select * into t from redemption_anomaly_thresholds();

  return query
  with recent as (
    select r.* from voucher_redemptions r where r.scanned_at > now() - interval '7 days'
  ),
  unknown_w as (
    select r.scanner_user_id, r.vendor_org_id, r.scanned_at,
           count(*) over (partition by r.scanner_user_id order by r.scanned_at
                          range between interval '1 hour' preceding and current row) as n
      from recent r where r.result = 'unknown_token' and r.scanner_user_id is not null
  ),
  wrong_w as (
    select r.scanner_user_id, r.vendor_org_id, r.scanned_at,
           count(*) over (partition by r.scanner_user_id order by r.scanned_at
                          range between interval '1 day' preceding and current row) as n
      from recent r where r.result = 'wrong_vendor' and r.scanner_user_id is not null
  ),
  rate_w as (
    select r.scanner_user_id, r.vendor_org_id, r.scanned_at,
           count(*) over (partition by r.scanner_user_id order by r.scanned_at
                          range between interval '1 minute' preceding and current row) as n
      from recent r where r.result = 'ok' and r.scanner_user_id is not null
  )
  select 'unknown_token_burst'::text, w.scanner_user_id, (array_agg(w.vendor_org_id))[1], null::uuid,
         max(w.n)::integer, min(w.scanned_at), max(w.scanned_at)
    from unknown_w w where w.n >= t.unknown_token_per_hour group by w.scanner_user_id
  union all
  select 'wrong_vendor_repeat', w.scanner_user_id, (array_agg(w.vendor_org_id))[1], null::uuid,
         max(w.n)::integer, min(w.scanned_at), max(w.scanned_at)
    from wrong_w w where w.n >= t.wrong_vendor_per_day group by w.scanner_user_id
  union all
  select 'scan_rate', w.scanner_user_id, (array_agg(w.vendor_org_id))[1], null::uuid,
         max(w.n)::integer, min(w.scanned_at), max(w.scanned_at)
    from rate_w w where w.n >= t.ok_scans_per_minute group by w.scanner_user_id
  union all
  select 'voucher_rescanned', null::uuid, (array_agg(r.vendor_org_id))[1], r.voucher_id,
         count(*)::integer, min(r.scanned_at), max(r.scanned_at)
    from recent r
   where r.result = 'already_redeemed' and r.voucher_id is not null
   group by r.voucher_id
  having count(*) >= t.repeat_scans_per_voucher
  order by 7 desc;
end;
$$;

comment on function redemption_anomalies() is
  'Open redemption anomaly flags from the last 7 days. Admin only. A flag never changes a scan result.';

revoke execute on function redemption_anomalies() from public, anon;
grant execute on function redemption_anomalies() to authenticated;
