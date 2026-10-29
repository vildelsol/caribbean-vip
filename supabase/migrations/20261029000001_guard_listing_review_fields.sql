-- Only an admin may approve a listing.
--
-- `experiences.status` is the gate the public read policy checks, so whoever can write it decides
-- what tourists see. `experiences_vendor_insert` and `experiences_vendor_update` (20261019000001)
-- let an owner, or staff with can_manage_listings, write any column on their own rows, and RLS has
-- no column-level control. A vendor could therefore create a listing as 'approved' or flip a draft
-- to 'approved', skipping moderation entirely. Verified on staging before this migration: as the
-- owner of an organisation, `insert into experiences (…, status) values (…, 'approved')` succeeded.
--
-- Same fix and same reasoning as `guard_vendor_review_fields()` for organisations: a trigger,
-- because the rule is per-column and the caller's identity is only visible to a function.
--
-- What a vendor may do, because the portal needs it:
--   create a listing                         → only as 'draft'
--   draft / rejected → pending_review        submit for review
--   pending_review / rejected → draft        withdraw, or rework after a rejection
--   approved → unpublished                   take a live listing down
--   unpublished → pending_review / draft     coming back is a new review, not a self-service switch
-- Everything else is refused, and so is any write to review_notes, reviewed_by or reviewed_at.
--
-- Not covered here: editing the content of an already-approved listing does not send it back to
-- review. That is a product decision, not a privilege one; see open-decisions.

create or replace function guard_listing_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No end-user context: a service-role caller (Edge Function, migration, seed). Inside the trust
  -- boundary, as for organisations.
  if auth.uid() is null then
    return new;
  end if;

  if is_admin() then
    -- The console must not be trusted to name the reviewer. Stamp it from the identity.
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'a vendor may only create a listing as a draft';
    end if;
    if new.review_notes is not null or new.reviewed_by is not null or new.reviewed_at is not null then
      raise exception 'only a platform administrator may write a listing''s review fields';
    end if;
    return new;
  end if;

  if new.review_notes is distinct from old.review_notes
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
  then
    raise exception 'only a platform administrator may write a listing''s review fields';
  end if;

  if new.status is distinct from old.status
     and (old.status, new.status) not in (
       ('draft',          'pending_review'),
       ('rejected',       'pending_review'),
       ('pending_review', 'draft'),
       ('rejected',       'draft'),
       ('approved',       'unpublished'),
       ('unpublished',    'pending_review'),
       ('unpublished',    'draft')
     )
  then
    raise exception 'a vendor cannot move a listing from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

comment on function guard_listing_review_fields() is
  'Blocks vendor writes that approve a listing or touch its review fields; stamps the reviewer for admins. RLS cannot express a per-column rule.';

create trigger experiences_review_guard
  before insert or update on experiences
  for each row execute function guard_listing_review_fields();
