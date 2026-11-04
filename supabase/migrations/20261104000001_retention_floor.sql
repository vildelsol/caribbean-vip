-- Retention floor: a booking or payment younger than 7 years cannot be deleted by accident.
--
-- Decided 2026-11-04: records kept under a legal duty (AML, tax, accounting; GDPR Art 17(3)(b)) are
-- held 7 years from the transaction date. Until now only `bookings.user_id ON DELETE RESTRICT` stood
-- between a bug or a hand-run DELETE and those rows, and `payments` cascades from `bookings`.
--
-- A BEFORE DELETE trigger refuses to remove a row inside the window, for every role including the
-- owner and the service role, and also when the delete arrives as a cascade. The only way through is
-- the future retention job, which must set `cvip.retention_purge` to `on` for its own transaction
-- (`set local`). That job does not exist yet, so today nothing can pass. Past the window, deletes are
-- allowed so the job can purge.
--
-- Not covered: TRUNCATE and DROP TABLE. Both need the table owner; do not grant that to application
-- roles.

create or replace function enforce_retention_floor() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('cvip.retention_purge', true), '') = 'on'
     and old.created_at <= now() - interval '7 years' then
    return old;
  end if;
  if old.created_at > now() - interval '7 years' then
    raise exception 'retention floor: % rows are kept 7 years (legal duty)', tg_table_name
      using errcode = 'restrict_violation';
  end if;
  raise exception 'retention floor: % rows past 7 years are removed only by the retention job', tg_table_name
    using errcode = 'restrict_violation';
end
$$;

create trigger bookings_retention_floor before delete on bookings
  for each row execute function enforce_retention_floor();
create trigger payments_retention_floor before delete on payments
  for each row execute function enforce_retention_floor();
