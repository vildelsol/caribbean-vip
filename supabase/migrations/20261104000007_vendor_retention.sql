-- Retention for vendor onboarding documents: 7 years after the vendor relationship ends
-- (decided 2026-11-04, due-diligence records; counsel to confirm).
--
-- Two things were missing: a marker for "the relationship ended", and a way to delete the uploaded
-- FILES, which a database function cannot do (deleting `storage.objects` rows in SQL leaves the
-- files in the bucket). So deletion is two steps and the row never goes before its file:
--   1. `vendor_documents_due()` lists documents of vendors closed 7+ years ago whose file is not yet
--      removed. A storage-capable job deletes each file, then calls
--      `mark_vendor_document_file_removed(id)`.
--   2. `purge_expired_records()` deletes the row only when `file_removed_at` is set.
-- Nothing is lost silently: a document whose file was never removed stays visible in the list.
--
-- `closed_at` is set by an admin when the relationship ends. A vendor must not be able to set or
-- clear it (clearing would stop the clock; setting it would start a purge), and must not be able to
-- mark its own file removed: both are guarded by trigger, because RLS is per row, not per column.
-- Nothing calls the file job yet; no vendor has closed, so the earliest document falls due in 2033.

alter table vendor_organizations add column closed_at timestamptz;
alter table vendor_documents add column file_removed_at timestamptz;

create or replace function guard_vendor_retention_fields() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'vendor_organizations' then
    if (tg_op = 'INSERT' and new.closed_at is not null) or
       (tg_op = 'UPDATE' and new.closed_at is distinct from old.closed_at) then
      -- No uid means the service role (an Edge Function or migration): inside the trust boundary.
      if auth.uid() is not null and not is_admin() then
        raise exception 'only a platform administrator may set when a vendor relationship ended';
      end if;
    end if;
  else
    if (tg_op = 'INSERT' and new.file_removed_at is not null) or
       (tg_op = 'UPDATE' and new.file_removed_at is distinct from old.file_removed_at) then
      -- Only the file-removal job may say a file is gone. Not a vendor, not even an admin.
      if auth.uid() is not null then
        raise exception 'only the file-removal job may mark a document file as removed';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger vendor_organizations_retention_guard
  before insert or update on vendor_organizations
  for each row execute function guard_vendor_retention_fields();
create trigger vendor_documents_retention_guard
  before insert or update on vendor_documents
  for each row execute function guard_vendor_retention_fields();

create or replace function vendor_documents_due() returns table (id uuid, storage_path text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select d.id, d.storage_path
    from vendor_documents d
    join vendor_organizations o on o.id = d.vendor_org_id
   where o.closed_at <= now() - interval '7 years' and d.file_removed_at is null;
$$;

create or replace function mark_vendor_document_file_removed(p_id uuid) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  -- Re-checks the window, so a caller cannot mark a document that is not due.
  update vendor_documents d set file_removed_at = now()
    from vendor_organizations o
   where d.id = p_id and o.id = d.vendor_org_id
     and o.closed_at <= now() - interval '7 years' and d.file_removed_at is null;
  get diagnostics n = row_count;
  return n = 1;
end
$$;

revoke execute on function vendor_documents_due() from public, anon, authenticated;
revoke execute on function mark_vendor_document_file_removed(uuid) from public, anon, authenticated;
grant execute on function vendor_documents_due() to service_role;
grant execute on function mark_vendor_document_file_removed(uuid) to service_role;

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

  -- Only rows whose file is already gone: the row is the last record that the file existed.
  delete from vendor_documents d using vendor_organizations o
   where o.id = d.vendor_org_id and o.closed_at <= cutoff and d.file_removed_at is not null;
  get diagnostics n_doc = row_count;

  insert into audit_logs (action, entity_type, after)
  values ('retention.purge', 'retention', jsonb_build_object(
    'cutoff', cutoff, 'payments_removed', n_pay, 'bookings_removed', n_bk, 'scans_scrubbed', n_scan,
    'vendor_documents_removed', n_doc));

  return jsonb_build_object('payments_removed', n_pay, 'bookings_removed', n_bk, 'scans_scrubbed', n_scan,
                            'vendor_documents_removed', n_doc);
end
$$;

revoke execute on function purge_expired_records() from public, anon, authenticated;
grant execute on function purge_expired_records() to service_role;
