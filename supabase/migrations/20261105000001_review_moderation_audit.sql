-- Two safeguards the review screens depend on.
--
-- 1. Log every change to a review's moderation state.
--
-- `audit_status_change()` (20260802000009) reads `status` and `review_notes`; `reviews` has neither,
-- its gate is `moderation_state`. So moderation was recorded only if the console remembered to write
-- its own row — and a moderation done from the SQL editor, a script or a future screen left no trace
-- at all. What a review's state decides is the public rating of a listing, so it is logged by the
-- database, as it is for organisations, listings and promotions. The console still adds its own row
-- through `write_audit_log()` to carry the reason.
--
-- `guard_review_fields` already stamps `moderated_by` from `auth.uid()` on the same UPDATE, so the
-- trigger has the actor even when the caller did not send one.
--
-- 2. Bound `reviews.body`.
--
-- It was created as plain `text` with nothing above it: no Zod schema, no form, no cap. Anyone
-- holding the anon key and a signed-in token could insert a review body of whatever fits in a
-- request body, on a product whose guest app is a 390pt phone frame. The limit matches
-- `REVIEW_LIMITS` in `packages/types/src/review.ts` and the textarea in the tourist app. All three
-- move together or the submit button starts failing for a reason the guest cannot see.
--
-- `not valid` is deliberately NOT used: there is no review-writing UI yet, so the table is empty or
-- holds seeded rows well inside the limit, and these should be checked on the rows already here.

create or replace function audit_review_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.moderation_state is distinct from new.moderation_state then
    insert into audit_logs (actor_user_id, action, entity_type, entity_id, before, after)
    values (
      auth.uid(),
      'reviews.moderation_state_changed',
      'reviews',
      new.id,
      jsonb_build_object('moderation_state', old.moderation_state),
      jsonb_build_object('moderation_state', new.moderation_state)
    );
  end if;
  return new;
end;
$$;

comment on function audit_review_moderation() is
  'Writes an audit_logs row when reviews.moderation_state changes. audit_status_change() cannot: reviews has no status or review_notes column.';

create trigger reviews_audit
  after update of moderation_state on reviews
  for each row execute function audit_review_moderation();

-- A review body is optional, so NULL stays allowed; a check constraint passes on NULL.
alter table reviews
  add constraint reviews_body_length check (char_length(body) <= 2000);
