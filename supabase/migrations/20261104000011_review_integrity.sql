-- Reviews: a guest may add only a pending review of the experience they actually took.
--
-- `reviews_self_write` checks that the reviewer owns a confirmed or completed booking, and nothing
-- else about the row. Three holes followed, and each one corrupts the rating shown to every guest:
--   1. A guest could insert with moderation_state = 'published', skipping moderation, because the
--      column default is only a default.
--   2. `experience_id` was not tied to the booking, so one real booking was a licence to review any
--      listing (or a competitor's) in the catalogue.
--   3. A review was accepted before the experience had happened ('confirmed' is enough).
--
-- The trigger fixes all three for callers who are neither admin nor the service role, and stamps the
-- moderator from the session when an admin changes the moderation state. The service role (no
-- auth.uid()) is untouched; it is how seed and import code write.

create or replace function guard_review_fields() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b_user uuid; b_exp uuid; b_status booking_status; slot_start timestamptz;
begin
  if tg_op = 'UPDATE' then
    if new.moderation_state is distinct from old.moderation_state and auth.uid() is not null then
      new.moderated_by := auth.uid();
    end if;
    return new;
  end if;

  -- INSERT. Admins and the service role may write what they like.
  if auth.uid() is null or is_admin() then
    return new;
  end if;

  select b.user_id, b.experience_id, b.status, s.starts_at
    into b_user, b_exp, b_status, slot_start
    from bookings b join availability_slots s on s.id = b.availability_slot_id
   where b.id = new.booking_id;

  if b_user is null or b_user <> auth.uid() or new.user_id <> auth.uid() then
    raise exception 'review_denied: not your booking' using errcode = '42501';
  end if;
  if new.experience_id <> b_exp then
    raise exception 'review_denied: a review must be of the experience that was booked' using errcode = '42501';
  end if;
  if b_status not in ('confirmed', 'completed') or slot_start > now() then
    raise exception 'review_denied: the experience has not happened yet' using errcode = '42501';
  end if;

  -- Whatever the client sent, a new review starts unmoderated.
  new.moderation_state := 'pending';
  new.moderated_by := null;
  return new;
end
$$;

revoke execute on function guard_review_fields() from public, anon, authenticated;

create trigger reviews_guard_fields
  before insert or update on reviews
  for each row execute function guard_review_fields();
