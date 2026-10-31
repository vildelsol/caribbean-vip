-- Log every change to a promotion's approval state.
--
-- `audit_status_change()` (20260802000009) covers vendor organisations and listings, but it reads
-- `status` and `review_notes`, and `promotions` has neither: its gate is `approval_state`. Without
-- this trigger a vendor taking their own live offer down (allowed by guard_promotion_review_fields)
-- would leave no trace, and an admin decision would be logged only if the console remembers to.
-- As for the other two tables, the database writes the row so no code path can forget; the console
-- adds its own row through write_audit_log() to carry the reason.
--
-- The entity type is the table name, matching the trigger rows for organisations and listings.

create or replace function audit_promotion_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.approval_state is distinct from new.approval_state then
    insert into audit_logs (actor_user_id, action, entity_type, entity_id, before, after)
    values (
      auth.uid(),
      'promotions.approval_state_changed',
      'promotions',
      new.id,
      jsonb_build_object('approval_state', old.approval_state),
      jsonb_build_object('approval_state', new.approval_state)
    );
  end if;
  return new;
end;
$$;

comment on function audit_promotion_approval() is
  'Writes an audit_logs row when promotions.approval_state changes. audit_status_change() cannot: promotions has no status or review_notes column.';

create trigger promotions_audit
  after update of approval_state on promotions
  for each row execute function audit_promotion_approval();
