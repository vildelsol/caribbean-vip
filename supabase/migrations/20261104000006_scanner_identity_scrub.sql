-- voucher_redemptions: let a scanner's identity be removed, and remove it after 2 years.
--
-- The trap: `scanner_user_id` is `ON DELETE SET NULL`, but setting it null is an UPDATE and the
-- append-only trigger refused every update. So deleting the Auth user of anyone who had scanned a
-- voucher failed. Staff removal and the erasure cascade were blocked.
--
-- The fix keeps the table a log. The new guard allows exactly one kind of update: the same row with
-- `scanner_user_id` set to null, with `device_meta` left as it was or emptied (nothing else changed). The result,
-- the voucher, the vendor, the token hash and the time cannot change, and DELETE is still refused.
-- That one update is both what the foreign key does and what the retention scrub does.
--
-- Retention: scanner and device fields are cleared 2 years after the scan (decided 2026-11-04 as a
-- working default for fraud control; counsel to confirm). The row stays, so counts and patterns
-- still read true; only who and which device goes. The scrub runs inside `purge_expired_records()`.

create or replace function voucher_redemptions_guard() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'voucher_redemptions is append-only';
  end if;
  -- Only identity may go: same row, scanner nulled, device details kept or emptied. The foreign key
  -- nulls the scanner alone, so that case must pass.
  if new.scanner_user_id is null
     and (new.device_meta = '{}'::jsonb or new.device_meta = old.device_meta)
     and (to_jsonb(new) - 'scanner_user_id' - 'device_meta') = (to_jsonb(old) - 'scanner_user_id' - 'device_meta') then
    return new;
  end if;
  raise exception 'voucher_redemptions is append-only';
end;
$$;

drop trigger voucher_redemptions_append_only on voucher_redemptions;
create trigger voucher_redemptions_append_only
  before update or delete on voucher_redemptions
  for each row execute function voucher_redemptions_guard();

create or replace function purge_expired_records() returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cutoff timestamptz := now() - interval '7 years';
  scrub_cutoff timestamptz := now() - interval '2 years';
  n_pay integer;
  n_bk integer;
  n_scan integer;
begin
  perform set_config('cvip.retention_purge', 'on', true);

  delete from payments where created_at <= cutoff;
  get diagnostics n_pay = row_count;

  delete from bookings where created_at <= cutoff;
  get diagnostics n_bk = row_count;

  perform set_config('cvip.retention_purge', '', true);

  update voucher_redemptions set scanner_user_id = null, device_meta = '{}'::jsonb
   where scanned_at <= scrub_cutoff and (scanner_user_id is not null or device_meta <> '{}'::jsonb);
  get diagnostics n_scan = row_count;

  insert into audit_logs (action, entity_type, after)
  values ('retention.purge', 'retention', jsonb_build_object(
    'cutoff', cutoff, 'payments_removed', n_pay, 'bookings_removed', n_bk, 'scans_scrubbed', n_scan));

  return jsonb_build_object('payments_removed', n_pay, 'bookings_removed', n_bk, 'scans_scrubbed', n_scan);
end
$$;

revoke execute on function purge_expired_records() from public, anon, authenticated;
grant execute on function purge_expired_records() to service_role;
