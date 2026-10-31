-- Only an admin may approve a promotion, and only the system may move its issued counter.
--
-- `promotions.approval_state` is what `promotions_public_read` checks, so whoever can write it
-- decides which offers tourists see. `promotions_vendor_all` (20260802000010) lets any member of
-- the vendor organisation write every column of their own rows, and RLS has no column-level
-- control. A vendor could therefore insert a promotion as 'approved', or flip their own to it,
-- skipping oversight entirely. The same policy covers `issued_count`, the counter behind
-- `inventory_limit`: lower it and the inventory check no longer stops anything. And `is_demo`
-- would let a vendor label a row however suits them.
--
-- Same fix and same reasoning as `guard_listing_review_fields()`: a trigger, because the rule is
-- per-column and the caller's identity is only visible to a function.
--
-- What a vendor may do, because the portal needs it:
--   create a promotion                       → only as 'pending', with issued_count 0
--   rejected → pending                       rework after a rejection
--   approved → disabled                      take their own live offer down
--   disabled → pending                       coming back is a new review, not a self-service switch
-- Everything else is refused, and so is any write to reviewed_by, reviewed_at, issued_count or
-- is_demo. Value, dates, terms and inventory_limit stay vendor-writable.
--
-- Not covered here: editing the value, dates or terms of an already-approved promotion does not
-- send it back to review. That is a product decision, not a privilege one, as for listings.
--
-- Nothing writes `issued_count` yet. When voucher issuing does, it must run as the service role
-- (no auth.uid()), which this guard lets through.

create or replace function guard_promotion_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No end-user context: a service-role caller (Edge Function, migration, seed). Inside the trust
  -- boundary, as for listings.
  if auth.uid() is null then
    return new;
  end if;

  if is_admin() then
    -- The console must not be trusted to name the reviewer. Stamp it from the identity.
    if tg_op = 'UPDATE' and new.approval_state is distinct from old.approval_state then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.approval_state <> 'pending' then
      raise exception 'a vendor may only create a promotion as pending';
    end if;
    if new.reviewed_by is not null or new.reviewed_at is not null then
      raise exception 'only a platform administrator may write a promotion''s review fields';
    end if;
    if new.issued_count <> 0 then
      raise exception 'issued_count is maintained by the system, not by vendors';
    end if;
    if new.is_demo then
      raise exception 'only a platform administrator may mark a promotion as demo';
    end if;
    return new;
  end if;

  if new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
  then
    raise exception 'only a platform administrator may write a promotion''s review fields';
  end if;

  if new.issued_count is distinct from old.issued_count then
    raise exception 'issued_count is maintained by the system, not by vendors';
  end if;

  if new.is_demo is distinct from old.is_demo then
    raise exception 'only a platform administrator may mark a promotion as demo';
  end if;

  if new.approval_state is distinct from old.approval_state
     and (old.approval_state, new.approval_state) not in (
       ('rejected', 'pending'),
       ('approved', 'disabled'),
       ('disabled', 'pending')
     )
  then
    raise exception 'a vendor cannot move a promotion from % to %', old.approval_state, new.approval_state;
  end if;

  return new;
end;
$$;

comment on function guard_promotion_review_fields() is
  'Blocks vendor writes that approve a promotion or touch its review fields, issued_count or is_demo; stamps the reviewer for admins. RLS cannot express a per-column rule.';

create trigger promotions_review_guard
  before insert or update on promotions
  for each row execute function guard_promotion_review_fields();
