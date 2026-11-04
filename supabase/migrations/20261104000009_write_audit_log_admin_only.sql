-- write_audit_log(): admins and the service role only.
--
-- The function is `security definer`, so it inserts into the append-only `audit_logs` table with RLS
-- bypassed. Since 20260802000009 it was executable by PUBLIC, which includes `anon`: anyone holding
-- the anon key that ships in every browser bundle could write an audit row with any action, entity
-- and before/after snapshot. The log is the evidence for admin decisions and for breach review, so
-- a row anyone can forge is worse than no row.
--
-- Two layers, because a revoke alone can be undone by a later `grant`:
--   * EXECUTE is revoked from PUBLIC and anon. `authenticated` keeps it, because the admin console
--     calls this function from the browser as a signed-in admin.
--   * The body refuses any caller who is neither an admin nor the service role. Anonymous tourists
--     are `authenticated` users, so the grant alone would not stop them.
-- Callers are unchanged: every call site in the repo is an admin decision.

create or replace function write_audit_log(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid,
  p_before      jsonb default null,
  p_after       jsonb default null,
  p_reason      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not (is_admin() or auth.role() = 'service_role') then
    raise exception 'audit_write_denied: only an admin or the service role may write the audit log'
      using errcode = '42501';
  end if;

  insert into audit_logs (actor_user_id, action, entity_type, entity_id, before, after, reason)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after, p_reason)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function write_audit_log(text, text, uuid, jsonb, jsonb, text) from public, anon;
grant  execute on function write_audit_log(text, text, uuid, jsonb, jsonb, text) to authenticated, service_role;
