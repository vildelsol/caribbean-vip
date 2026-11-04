-- The retention job: remove bookings and payments past the 7-year window (decided 2026-11-04).
--
-- The retention floor (previous migration) refuses these deletes for everyone. This function is the
-- one door through it, and it is narrow:
--   * Service role only: revoked from public, anon and authenticated. It takes no argument naming
--     a person or a row, so a caller cannot aim it.
--   * The cutoff is computed inside, from the database clock. It cannot be passed in, so a caller
--     cannot shorten the window.
--   * It sets `cvip.retention_purge` for this transaction only (`set local` semantics), and the floor
--     still refuses any row under 7 years even with the setting on.
--   * Payments go first, then bookings; booking guests, vouchers and trip items follow their booking.
--   * Every run writes one `audit_logs` row with counts only (append-only, no personal data), so a
--     purge is accountable. A run that removes nothing still writes its row.
--
-- Nothing schedules it yet. Run it from a scheduled Edge Function or pg_cron once counsel has
-- confirmed the period.

create or replace function purge_expired_records() returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cutoff timestamptz := now() - interval '7 years';
  n_pay integer;
  n_bk integer;
begin
  perform set_config('cvip.retention_purge', 'on', true);

  delete from payments where created_at <= cutoff;
  get diagnostics n_pay = row_count;

  delete from bookings where created_at <= cutoff;
  get diagnostics n_bk = row_count;

  perform set_config('cvip.retention_purge', '', true);

  insert into audit_logs (action, entity_type, after)
  values ('retention.purge', 'retention', jsonb_build_object(
    'cutoff', cutoff, 'payments_removed', n_pay, 'bookings_removed', n_bk));

  return jsonb_build_object('payments_removed', n_pay, 'bookings_removed', n_bk);
end
$$;

revoke execute on function purge_expired_records() from public, anon, authenticated;
grant execute on function purge_expired_records() to service_role;
