-- Only an admin may move a vendor's review state.
--
-- `vendor_orgs_owner_update` grants an owner `for update using (is_vendor_owner(id))`, and RLS has
-- no column-level control, so that policy covered `status` along with the trading name. A vendor
-- owner could therefore approve their own organisation.
--
-- Verified before this migration: as the owner of a `pending_review` organisation, a plain
-- `update vendor_organizations set status = 'approved'` succeeded. Since onboarding makes the
-- applicant a `vendor_owner`, anyone who completed it could make themselves publicly visible
-- without review — and PRD §1 sells the marketplace on verified vendors, with every public policy
-- gating on `status = 'approved'`.
--
-- A trigger rather than a policy, because the privilege is per-column and RLS is per-row. This
-- mirrors `guard_profile_privileges()`, which exists for exactly the same reason: a tourist must
-- not be able to set their own `profiles.role` even though they may update their own profile row.
--
-- Column privileges would not work here either. Admins and vendors are both the `authenticated`
-- database role, so `grant update (…) on vendor_organizations to authenticated` cannot tell them
-- apart. The caller's identity is only visible to a function.

create or replace function guard_vendor_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No end-user context means a service-role caller: an Edge Function, a migration or the seed,
  -- all of which already hold the service key and sit inside the trust boundary. `anon` also has
  -- no uid, but has no UPDATE policy on this table, so RLS refuses it before this runs.
  if auth.uid() is null then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.review_notes is distinct from old.review_notes
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
  then
    if not is_admin() then
      raise exception 'only a platform administrator may change a vendor''s review state';
    end if;
  end if;

  return new;
end;
$$;

comment on function guard_vendor_review_fields() is
  'Blocks non-admin writes to vendor_organizations.status and its review columns. RLS cannot express a per-column rule.';

create trigger vendor_organizations_review_guard
  before update on vendor_organizations
  for each row execute function guard_vendor_review_fields();

-- `reviewed_by` should name the admin who decided, and the console has no business being trusted
-- to send the right id. Stamp it from the authenticated identity instead.
create or replace function stamp_vendor_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and auth.uid() is not null then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

-- Postgres fires same-timing triggers in alphabetical order by name, so `…_review_guard` runs
-- before `…_review_stamp`: a refused update raises before this one can stamp anything. The names
-- carry that ordering, so do not rename either without checking the other.
create trigger vendor_organizations_review_stamp
  before update on vendor_organizations
  for each row execute function stamp_vendor_review();
