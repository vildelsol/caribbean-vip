-- Mark a redemption flag reviewed, without letting a review silence anything.
--
-- Reviews are append-only rows. A review hides nothing: `redemption_anomalies()` still returns the
-- flag, with who reviewed it and when. It counts as open again the moment a newer scan feeds the
-- same flag, so a flag cannot be closed once and then ignored forever.
--
-- Safeguards, each proven by a test that fails without it:
--   * `review_redemption_anomaly()` is admin only, takes the reviewer from `auth.uid()` (never a
--     parameter), and reviews only a flag that exists right now, recording that flag's own latest
--     scan time. A review cannot be written ahead of time to pre-silence a future flag.
--   * No insert policy: the function is the only writer. Rows cannot be updated or deleted.
--   * The note is capped, so the table cannot become a store of free text.
--   * Ids carry no foreign key on purpose: a foreign key with ON DELETE SET NULL is an update, and
--     the append-only trigger would block the erasure cascade (see data-inventory.md).

create table redemption_anomaly_reviews (
  id              uuid primary key default gen_random_uuid(),
  pattern         text not null check (pattern in
                    ('unknown_token_burst', 'wrong_vendor_repeat', 'voucher_rescanned', 'scan_rate')),
  scanner_user_id uuid,
  voucher_id      uuid,
  flag_last_at    timestamptz not null,
  reviewed_by     uuid not null,
  note            text check (note is null or char_length(note) <= 500),
  reviewed_at     timestamptz not null default now(),
  -- A flag is about a scanner or a voucher, exactly one of them.
  check ((scanner_user_id is null) <> (voucher_id is null))
);

create index redemption_anomaly_reviews_key_idx
  on redemption_anomaly_reviews (pattern, scanner_user_id, voucher_id, flag_last_at desc);

create trigger redemption_anomaly_reviews_no_update
  before update on redemption_anomaly_reviews
  for each row execute function forbid_mutation();

alter table redemption_anomaly_reviews enable row level security;

create policy redemption_anomaly_reviews_admin_read on redemption_anomaly_reviews
  for select to authenticated
  using (is_admin());

-- No insert, update or delete policy: only review_redemption_anomaly() writes.

-- --------------------------------------------------------------------------
-- The flags, as before but internal, so the public reader can add review state
-- --------------------------------------------------------------------------

drop function redemption_anomalies();

create or replace function redemption_flags_raw()
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

revoke execute on function redemption_flags_raw() from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- The reader: every flag, with its latest review if that review still covers it
-- --------------------------------------------------------------------------

create or replace function redemption_anomalies()
returns table (
  pattern         text,
  scanner_user_id uuid,
  vendor_org_id   uuid,
  voucher_id      uuid,
  scan_count      integer,
  first_at        timestamptz,
  last_at         timestamptz,
  reviewed_at     timestamptz,
  reviewed_by     uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not is_admin() then
    raise exception 'only an admin may read redemption anomalies';
  end if;

  return query
  select f.pattern, f.scanner_user_id, f.vendor_org_id, f.voucher_id, f.scan_count, f.first_at, f.last_at,
         rv.reviewed_at, rv.reviewed_by
    from redemption_flags_raw() f
    left join lateral (
      select r.reviewed_at, r.reviewed_by
        from redemption_anomaly_reviews r
       where r.pattern = f.pattern
         and r.scanner_user_id is not distinct from f.scanner_user_id
         and r.voucher_id is not distinct from f.voucher_id
         -- A review covers the flag only while no newer scan has fed it.
         and r.flag_last_at >= f.last_at
       order by r.reviewed_at desc
       limit 1
    ) rv on true
   order by f.last_at desc;
end;
$$;

comment on function redemption_anomalies() is
  'Redemption anomaly flags from the last 7 days with review state. Admin only. reviewed_at is null while a flag is open, including after a newer scan reopens it.';

revoke execute on function redemption_anomalies() from public, anon;
grant execute on function redemption_anomalies() to authenticated;

-- --------------------------------------------------------------------------
-- Reviewing
-- --------------------------------------------------------------------------

create or replace function review_redemption_anomaly(
  p_pattern         text,
  p_scanner_user_id uuid,
  p_voucher_id      uuid,
  p_note            text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  flag record;
begin
  if not is_admin() then
    raise exception 'only an admin may review redemption anomalies';
  end if;

  -- Only a flag that exists now, and the review records that flag's own latest scan time.
  select f.* into flag
    from redemption_flags_raw() f
   where f.pattern = p_pattern
     and f.scanner_user_id is not distinct from p_scanner_user_id
     and f.voucher_id is not distinct from p_voucher_id;
  if not found then
    raise exception 'there is no open flag to review for this pattern and subject';
  end if;

  insert into redemption_anomaly_reviews (pattern, scanner_user_id, voucher_id, flag_last_at, reviewed_by, note)
  values (flag.pattern, flag.scanner_user_id, flag.voucher_id, flag.last_at, auth.uid(), nullif(btrim(p_note), ''));
end;
$$;

revoke execute on function review_redemption_anomaly(text, uuid, uuid, text) from public, anon;
grant execute on function review_redemption_anomaly(text, uuid, uuid, text) to authenticated;
