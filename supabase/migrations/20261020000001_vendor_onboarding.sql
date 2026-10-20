-- Vendor onboarding writes a real organisation.
--
-- apps/vendor-web/app/onboarding/page.tsx collected six fields, slept 800ms and routed to
-- /billing. Nothing was stored, so a live deployment would hold zero vendor_organizations rows —
-- and every public RLS policy gates on status = 'approved', so it would also show zero listings.
--
-- ## Why this has to be a function and not two client inserts
--
-- The obvious shape is two PostgREST calls: insert the organisation under vendor_orgs_insert
-- (`with check (auth.uid() is not null)`), then insert the owner membership. The second call
-- CANNOT SUCCEED. The only insert-side policy on vendor_members is vendor_members_owner_manage,
-- whose check is `is_vendor_owner(vendor_org_id) or is_admin()`, and is_vendor_owner() reads
-- vendor_members for an existing 'vendor_owner' row. Before the first member row exists there is
-- no owner, so the policy refuses the very row that would create one.
--
-- So this is not the usual "two writes might half-fail" argument. The client path does not race;
-- it always lands an ownerless organisation, which is then unreachable forever:
-- vendor_orgs_owner_update needs is_vendor_owner() too, and vendor_orgs_member_read needs
-- is_vendor_member(), so the applicant cannot even see the row they just created. One
-- `security definer` function doing both under one transaction is the only shape that works.
--
-- ## The grant
--
-- `security definer` bypasses RLS, so EXECUTE is the only thing standing between a caller and
-- these tables — see 20261019000002, where two such functions sat on the default PUBLIC grant and
-- let anyone holding the browser's anon key rewrite availability. REVOKE FROM PUBLIC first
-- (revoking from anon/authenticated alone is a no-op while PUBLIC holds the grant), then grant to
-- `authenticated` only.
--
-- The owner is read from auth.uid() rather than taken as a parameter. A p_user_id argument on a
-- definer function is an impersonation primitive: any signed-in caller could make someone else the
-- owner of an organisation, or themselves the owner of a hand-picked id.

-- --------------------------------------------------------------------------
-- The two columns the form had nowhere to put
-- --------------------------------------------------------------------------
--
-- vendor_organizations had contact_email and contact_phone but no contact_name, while the form
-- asks for "Primary contact". business_type had no column at all. Both were discarded on submit;
-- adding them is what makes the write lossless.
--
-- Bounded in all three live layers (see the decision record of 2026-10-19): VENDOR_LIMITS and the
-- schemas in packages/types/src/vendor.ts, the checks here, and maxLength on the inputs.
-- `char_length(null)` is null and a CHECK passes on null, which is what lets these sit on
-- nullable columns; btrim for the non-blank tests, because Zod trims before it measures.

alter table vendor_organizations
  add column contact_name  text,
  add column business_type text;

alter table vendor_organizations
  add constraint vendor_organizations_legal_name_length
    check (char_length(legal_name) <= 120),
  add constraint vendor_organizations_legal_name_not_blank
    check (char_length(btrim(legal_name)) > 0),
  add constraint vendor_organizations_trading_name_length
    check (char_length(trading_name) <= 120),
  add constraint vendor_organizations_trading_name_not_blank
    check (char_length(btrim(trading_name)) > 0),
  add constraint vendor_organizations_contact_name_length
    check (char_length(contact_name) <= 120),
  add constraint vendor_organizations_contact_phone_length
    check (char_length(contact_phone) <= 40),
  -- Mirrors VENDOR_BUSINESS_TYPES. A text column with a check rather than an enum: the taxonomy is
  -- marketing copy that will be re-cut, and a check constraint is one ALTER to change where an
  -- enum value can never be removed.
  add constraint vendor_organizations_business_type
    check (business_type is null or business_type in (
      'tour', 'food', 'wellness', 'water', 'culture', 'transport', 'retail', 'other'
    ));

-- --------------------------------------------------------------------------
-- create_vendor_organization
-- --------------------------------------------------------------------------

create or replace function create_vendor_organization(
  p_island_id     uuid,
  p_legal_name    text,
  p_trading_name  text,
  p_contact_name  text,
  p_contact_phone text,
  p_business_type text,
  p_description   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_email text;
  v_org   uuid;
begin
  if v_user is null then
    raise exception 'Sign in before applying.' using errcode = '42501';
  end if;

  -- An applicant gets one organisation. Without this, a double-submitted form — or a refresh on
  -- /onboarding — leaves two pending applications for one business, and an admin reviewing the
  -- queue has no way to tell which is the real one.
  if exists (select 1 from vendor_members where user_id = v_user) then
    raise exception 'This account already belongs to a vendor organisation.'
      using errcode = '23505';
  end if;

  -- contact_email is not null on the table and is the only address the approval mail can go to, so
  -- it comes from the authenticated identity rather than the form: a self-declared contact address
  -- on a definer function is a way to receive another business's review correspondence. An
  -- anonymous session has no email, which is also why the vendor portal signs in by magic link.
  select email into v_email from auth.users where id = v_user;
  if v_email is null or btrim(v_email) = '' then
    raise exception 'This account has no email address; apply from an email sign-in.'
      using errcode = '42501';
  end if;

  -- The island is a not-null FK, and an application filed under a market that has not launched
  -- would sit in the queue forever. islands_public_read only exposes active islands anyway, so
  -- this is the server-side half of a choice the client could not legitimately make.
  if not exists (select 1 from islands where id = p_island_id and is_active) then
    raise exception 'That island is not open for applications.' using errcode = '23503';
  end if;

  -- 'pending_review', not 'pending' — see the vendor_status enum, whose states are draft,
  -- pending_review, approved, changes_requested, rejected, suspended. The column DEFAULTS to
  -- 'draft', which would leave a completed application looking unsubmitted and absent from any
  -- review queue, so it is set explicitly here.
  insert into vendor_organizations (
    island_id, legal_name, trading_name, contact_email, contact_phone,
    contact_name, business_type, description, status
  )
  values (
    p_island_id, p_legal_name, p_trading_name, v_email, p_contact_phone,
    p_contact_name, p_business_type, p_description, 'pending_review'
  )
  returning id into v_org;

  -- can_manage_listings is false by default and stays false: isListingManager() and the RLS helper
  -- both treat an owner as a manager whatever the flag says, so setting it here would only create a
  -- second source of truth that could disagree. can_view_payouts is the owner's by right.
  insert into vendor_members (vendor_org_id, user_id, role, can_scan_vouchers, can_view_payouts)
  values (v_org, v_user, 'vendor_owner', true, true);

  -- The applicant named a contact; profiles.display_name is where the portal reads a human name
  -- from. Only filled if blank, so this cannot overwrite a name the user chose themselves.
  update profiles
     set display_name = p_contact_name
   where id = v_user
     and p_contact_name is not null
     and coalesce(btrim(display_name), '') = '';

  return v_org;
end;
$$;

revoke execute on function create_vendor_organization(uuid, text, text, text, text, text, text)
  from public;
revoke execute on function create_vendor_organization(uuid, text, text, text, text, text, text)
  from anon;
grant execute on function create_vendor_organization(uuid, text, text, text, text, text, text)
  to authenticated;
