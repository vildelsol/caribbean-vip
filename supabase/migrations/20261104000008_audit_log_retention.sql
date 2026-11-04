-- audit_logs: still append-only, but an actor's account can be deleted and rows expire at 7 years.
--
-- Same trap as voucher_redemptions: `actor_user_id` is ON DELETE SET NULL, setting it null is an
-- UPDATE, and the append-only trigger refused every update. Deleting an admin's account failed for as
-- long as they had log rows.
--
-- The guard now allows exactly two things and nothing else:
--   * UPDATE that only nulls `actor_user_id` (what the foreign key does).
--   * DELETE of a row at least 7 years old, and only while `purge_expired_records()` is running
--     (it sets `cvip.retention_purge`). The age is checked here too, so even with the setting on, no
--     caller can remove a younger row.
-- Period decided 2026-11-04; counsel to confirm. Snapshots in `before`/`after` can hold personal
-- data, which is the reason for an end date at all.

create or replace function audit_logs_guard() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('cvip.retention_purge', true) = 'on' and old.created_at <= now() - interval '7 years' then
      return old;
    end if;
    raise exception 'audit_logs is append-only';
  end if;
  if new.actor_user_id is null and (to_jsonb(new) - 'actor_user_id') = (to_jsonb(old) - 'actor_user_id') then
    return new;
  end if;
  raise exception 'audit_logs is append-only';
end;
$$;

drop trigger audit_logs_append_only on audit_logs;
create trigger audit_logs_append_only
  before update or delete on audit_logs
  for each row execute function audit_logs_guard();

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
  n_doc integer;
  n_audit integer;
begin
  perform set_config('cvip.retention_purge', 'on', true);

  delete from payments where created_at <= cutoff;
  get diagnostics n_pay = row_count;

  delete from bookings where created_at <= cutoff;
  get diagnostics n_bk = row_count;

  delete from audit_logs where created_at <= cutoff;
  get diagnostics n_audit = row_count;

  perform set_config('cvip.retention_purge', '', true);

  update voucher_redemptions set scanner_user_id = null, device_meta = '{}'::jsonb
   where scanned_at <= scrub_cutoff and (scanner_user_id is not null or device_meta <> '{}'::jsonb);
  get diagnostics n_scan = row_count;

  delete from vendor_documents d using vendor_organizations o
   where o.id = d.vendor_org_id and o.closed_at <= cutoff and d.file_removed_at is not null;
  get diagnostics n_doc = row_count;

  insert into audit_logs (action, entity_type, after)
  values ('retention.purge', 'retention', jsonb_build_object(
    'cutoff', cutoff, 'payments_removed', n_pay, 'bookings_removed', n_bk, 'scans_scrubbed', n_scan,
    'vendor_documents_removed', n_doc, 'audit_logs_removed', n_audit));

  return jsonb_build_object('payments_removed', n_pay, 'bookings_removed', n_bk, 'scans_scrubbed', n_scan,
                            'vendor_documents_removed', n_doc, 'audit_logs_removed', n_audit);
end
$$;

revoke execute on function purge_expired_records() from public, anon, authenticated;
grant execute on function purge_expired_records() to service_role;
