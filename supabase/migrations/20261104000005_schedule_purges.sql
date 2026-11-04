-- Run the two purges on a schedule (pg_cron).
--
--   cvip-purge-short-lived  daily  03:15 UTC  select purge_short_lived_records()
--   cvip-purge-expired      weekly 03:30 UTC (Sunday)  select purge_expired_records()
--
-- Guarded: where pg_cron is not available (the plain-Postgres test database), this does nothing
-- and the migration still applies. Where it is, the jobs are created by name, so re-running updates
-- them rather than duplicating them. The command of each job is exactly one purge call and nothing
-- else; `purgeSchedule.test.ts` fails if a job runs anything other than those two functions.
--
-- Each purge writes a counts-only audit_logs row, so a missed or failed run is visible as a gap:
-- check `audit_logs where action like 'retention.%'`.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('cvip-purge-short-lived', '15 3 * * *', 'select purge_short_lived_records()');
    perform cron.schedule('cvip-purge-expired', '30 3 * * 0', 'select purge_expired_records()');
  end if;
end
$$;
