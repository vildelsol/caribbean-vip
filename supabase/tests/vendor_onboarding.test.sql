-- Vendor onboarding creates a real organisation with a real owner.
--
-- Before 20261020000001 the onboarding form stored nothing, so a live deployment would have held
-- no vendor_organizations rows — and since every public policy gates on status = 'approved', no
-- visible listings either.
--
-- Three things shape how this file asserts:
--
-- 1. The claim that justifies the function existing is negative and has to be tested: the
--    two-insert client path is IMPOSSIBLE, not merely risky. vendor_members_owner_manage checks
--    is_vendor_owner(), which reads vendor_members for an existing owner row, so the insert that
--    would create the first owner is refused. That is asserted directly below.
--
-- 2. `security definer` bypasses RLS, so EXECUTE is the only guard on the function. The grant is
--    read from the catalogue, because a PUBLIC grant applies to every role and revoking only
--    anon/authenticated would read as a fix and change nothing (see rpc_execute_grants.test.sql).
--
-- 3. Every refusal is paired with a positive control. A test.raises that passes because of a
--    not-null column or a bad enum proves nothing about the thing it names.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

-- --------------------------------------------------------------------------
-- Fixtures
-- --------------------------------------------------------------------------

set local role service_role;

create temporary table fixture (k text primary key, v uuid) on commit drop;
-- insert too: a couple of the ids below are only known inside an authenticated block.
grant select, insert on fixture to anon, authenticated;

do $$
declare
  applicant_u uuid; second_u uuid; nameless_u uuid; anon_u uuid;
  active_i uuid; inactive_i uuid;
begin
  insert into auth.users (email) values ('vendor-applicant@test.local') returning id into applicant_u;
  insert into auth.users (email) values ('vendor-second@test.local')    returning id into second_u;
  insert into auth.users (email) values ('vendor-nameless@test.local')  returning id into nameless_u;
  -- An anonymous Supabase session has a user row with no email. The tourist app signs in this way
  -- (signInAnonymously), and such a session must not be able to file an application: contact_email
  -- is not null and is the only address the approval mail can reach.
  insert into auth.users (email) values (null) returning id into anon_u;

  select id into active_i   from islands where code = 'JM';
  select id into inactive_i from islands where code = 'AG';

  perform test.ok(active_i is not null,   'fixture: Jamaica is seeded');
  perform test.ok(inactive_i is not null, 'fixture: the inactive island fixture is seeded');
  perform test.ok(
    not (select is_active from islands where id = inactive_i),
    'fixture: Antigua is still the inactive negative fixture'
  );

  insert into fixture values
    ('applicant', applicant_u), ('second', second_u), ('nameless', nameless_u),
    ('anon', anon_u), ('active_island', active_i), ('inactive_island', inactive_i);
end
$$;

-- --------------------------------------------------------------------------
-- The grant
-- --------------------------------------------------------------------------

do $$
declare sig text := 'create_vendor_organization(uuid,text,text,text,text,text,text)';
begin
  perform test.ok(
    not has_function_privilege('anon', sig, 'execute'),
    'anon holds no EXECUTE on create_vendor_organization'
  );
  perform test.ok(
    has_function_privilege('authenticated', sig, 'execute'),
    'authenticated holds EXECUTE — the onboarding form is the only caller'
  );
  perform test.ok(
    (select prosecdef from pg_proc where oid = sig::regprocedure),
    'the function is security definer, which is why the grant above is the whole guard'
  );
end
$$;

-- --------------------------------------------------------------------------
-- Why the function has to exist: the client cannot make itself an owner
-- --------------------------------------------------------------------------

set local role authenticated;

do $$
declare
  u       uuid := (select v from fixture where k = 'applicant');
  isl     uuid := (select v from fixture where k = 'active_island');
  org     uuid;
begin
  perform test.become(u);

  -- Step one of the hypothetical client path fails before it even returns. vendor_orgs_insert
  -- (`with check (auth.uid() is not null)`) permits the row, but RETURNING runs the SELECT
  -- policies against it, and the only two are vendor_orgs_public_read (status = 'approved') and
  -- vendor_orgs_member_read (is_vendor_member) — neither of which a brand-new pending row with no
  -- membership can satisfy. PostgREST asks for the inserted representation unless the caller sends
  -- `Prefer: return=minimal`, so `.insert().select()` is refused outright.
  perform test.raises(
    format(
      $q$ insert into vendor_organizations (island_id, legal_name, trading_name, contact_email, status)
          values (%L, 'Orphan Ltd', 'Orphan', 'orphan@test.local', 'pending_review')
          returning id $q$,
      isl
    ),
    'a client insert cannot read back the organisation it just created'
  );

  -- Without RETURNING the write lands, which is the positive control: the refusal above is the
  -- SELECT policies, not the insert check.
  insert into vendor_organizations (island_id, legal_name, trading_name, contact_email, status)
  values (isl, 'Orphan Ltd', 'Orphan', 'orphan@test.local', 'pending_review');

  -- …and the applicant never learns the id, so it has nothing to put in the membership insert.
  perform test.eq(
    (select count(*) from vendor_organizations where trading_name = 'Orphan'),
    0::bigint,
    'the applicant cannot see the organisation it just created, so it has no id to use'
  );

  -- Even handed the id, the membership insert is refused: the only insert policy on
  -- vendor_members requires is_vendor_owner(), which reads vendor_members for an existing owner
  -- row — the row this statement is trying to create. This is the finding the whole design rests
  -- on: the two-call client path does not race, it cannot complete.
  perform test.become(u);
  select id into org from vendor_organizations where trading_name = 'Orphan';
  perform test.ok(org is null, 'and RLS hides it from this query too');
end
$$;

set local role service_role;

do $$
declare
  u   uuid := (select v from fixture where k = 'applicant');
  org uuid := (select id from vendor_organizations where trading_name = 'Orphan');
begin
  perform test.ok(org is not null, 'the orphan row really was written');
  insert into fixture values ('orphan', org);
end
$$;

set local role authenticated;

do $$
declare
  u   uuid := (select v from fixture where k = 'applicant');
  org uuid := (select v from fixture where k = 'orphan');
begin
  perform test.become(u);
  perform test.raises(
    format(
      $q$ insert into vendor_members (vendor_org_id, user_id, role)
          values (%L, %L, 'vendor_owner') $q$,
      org, u
    ),
    'RLS refuses the first owner membership, so two client inserts always leave an ownerless org'
  );

  -- And the ownerless row is unrecoverable: vendor_orgs_owner_update needs is_vendor_owner() too.
  update vendor_organizations set trading_name = 'Rescued' where id = org;
end
$$;

set local role service_role;

do $$
declare org uuid := (select v from fixture where k = 'orphan');
begin
  -- RLS denies UPDATE silently — a `using` clause that excludes the row makes it invisible to the
  -- statement, which then succeeds reporting zero rows. So the value is re-read as service_role
  -- rather than trusting the statement not to have raised.
  perform test.eq(
    (select trading_name from vendor_organizations where id = org), 'Orphan',
    'nothing the applicant can do recovers an ownerless organisation'
  );

  delete from vendor_organizations where id = org;
end
$$;

set local role authenticated;

-- --------------------------------------------------------------------------
-- The function: one call, both rows
-- --------------------------------------------------------------------------

do $$
declare
  u    uuid := (select v from fixture where k = 'applicant');
  isl  uuid := (select v from fixture where k = 'active_island');
  org  uuid;
begin
  perform test.become(u);

  org := create_vendor_organization(
    isl, 'Blue Lagoon Adventures Ltd', 'Blue Lagoon Adventures',
    'Marcia Brown', '+1 876 555 0101', 'tour', 'Boat trips on the Blue Lagoon.'
  );

  perform test.ok(org is not null, 'the application returns an organisation id');
  insert into fixture values ('org', org);
end
$$;

set local role service_role;

do $$
declare
  u uuid := (select v from fixture where k = 'applicant');
  o uuid := (select v from fixture where k = 'org');
  r vendor_organizations;
  m vendor_members;
begin
  select * into r from vendor_organizations where id = o;

  -- 'pending_review', not the column's 'draft' default. A completed application left at 'draft'
  -- looks unsubmitted and appears in no review queue, which is the same invisibility as before.
  perform test.eq(r.status::text, 'pending_review', 'the organisation is awaiting review');
  perform test.eq(r.trading_name, 'Blue Lagoon Adventures', 'the trading name was stored');
  perform test.eq(r.legal_name, 'Blue Lagoon Adventures Ltd', 'the legal name was stored');
  perform test.eq(r.contact_name, 'Marcia Brown', 'the contact name was stored');
  perform test.eq(r.business_type, 'tour', 'the business type was stored');
  perform test.eq(r.contact_phone, '+1 876 555 0101', 'the phone number was stored');

  -- From auth.uid()'s own account, never from the form. A self-declared contact address on a
  -- definer function is a way to receive another business's review correspondence.
  perform test.eq(
    r.contact_email, 'vendor-applicant@test.local',
    'the contact email came from the authenticated identity'
  );

  select * into m from vendor_members where vendor_org_id = o;
  perform test.eq(m.user_id, u, 'the membership belongs to the caller, not to a parameter');
  perform test.eq(m.role::text, 'vendor_owner', 'the caller is the owner');
  perform test.ok(m.can_view_payouts, 'the owner can see payouts');

  -- Deliberately left false: is_vendor_listing_manager() and isListingManager() both treat an
  -- owner as a manager whatever the flag says, so setting it would create a second source of
  -- truth that could disagree with the first.
  perform test.ok(
    not m.can_manage_listings,
    'can_manage_listings stays false — the owner is a manager by role, not by flag'
  );

  perform test.eq(
    (select display_name from profiles where id = u), 'Marcia Brown',
    'the contact name filled the empty profile display_name'
  );
end
$$;

-- --------------------------------------------------------------------------
-- The organisation is now reachable, and still not public
-- --------------------------------------------------------------------------

set local role authenticated;

do $$
declare
  u uuid := (select v from fixture where k = 'applicant');
  o uuid := (select v from fixture where k = 'org');
begin
  perform test.become(u);
  perform test.eq(
    (select count(*) from vendor_organizations where id = o), 1::bigint,
    'the owner can read its own pending organisation — the orphan case above could not'
  );

  -- The owner update policy needs is_vendor_owner(), which is what the ownerless row could never
  -- satisfy. This is the positive control for that refusal.
  update vendor_organizations set description = 'Edited by the owner.' where id = o;
  perform test.eq(
    (select description from vendor_organizations where id = o), 'Edited by the owner.',
    'the owner can edit the application while it waits for review'
  );
end
$$;

set local role anon;

do $$
declare o uuid := (select v from fixture where k = 'org');
begin
  perform test.become_anon();
  -- V-02. Nothing about an unapproved vendor is public, including that it applied. Admin approval
  -- is the only thing that changes this, and nothing in the codebase can do it yet.
  perform test.eq(
    (select count(*) from vendor_organizations where id = o), 0::bigint,
    'a pending organisation is invisible to the public'
  );
end
$$;

-- --------------------------------------------------------------------------
-- Refusals, each with its positive control
-- --------------------------------------------------------------------------

set local role authenticated;

do $$
declare
  second_u   uuid := (select v from fixture where k = 'second');
  applicant  uuid := (select v from fixture where k = 'applicant');
  nameless   uuid := (select v from fixture where k = 'nameless');
  anon_u     uuid := (select v from fixture where k = 'anon');
  isl        uuid := (select v from fixture where k = 'active_island');
  dead_isl   uuid := (select v from fixture where k = 'inactive_island');
  org        uuid;
begin
  -- One application per account. A double-submitted form would otherwise leave two pending
  -- applications for one business and an admin with no way to tell which is real.
  perform test.become(applicant);
  perform test.raises(
    format(
      $q$ select create_vendor_organization(%L, 'Again Ltd', 'Again', 'Marcia Brown', '1', 'tour') $q$,
      isl
    ),
    'an account that already belongs to an organisation cannot apply again'
  );

  -- Positive control for that refusal: the same payload from a fresh account succeeds, so the
  -- failure above is the duplicate rule and not something wrong with the arguments.
  perform test.become(second_u);
  org := create_vendor_organization(isl, 'Again Ltd', 'Again', 'Marcia Brown', '1', 'tour');
  perform test.ok(org is not null, 'a fresh account can apply with the same payload');

  -- An application filed under a market that has not launched would wait in the queue forever.
  perform test.become(nameless);
  perform test.raises(
    format(
      $q$ select create_vendor_organization(%L, 'Dead Market Ltd', 'Dead', 'A Name', '1', 'tour') $q$,
      dead_isl
    ),
    'an inactive island is not open for applications'
  );

  -- Same account, active island: proves the refusal above was the island and not the account.
  org := create_vendor_organization(isl, 'Live Market Ltd', 'Live', 'A Name', '1', 'tour');
  perform test.ok(org is not null, 'the same account can apply under an active island');

  -- An anonymous session has no email, and contact_email is not null.
  perform test.become(anon_u);
  perform test.raises(
    format(
      $q$ select create_vendor_organization(%L, 'Ghost Ltd', 'Ghost', 'A Name', '1', 'tour') $q$,
      isl
    ),
    'an account with no email address cannot apply'
  );

  -- No JWT at all. The grant already stops `anon`, but the function must not rely on the grant
  -- alone: a later migration that widens EXECUTE should not silently open this.
  perform test.become_anon();
  perform test.raises(
    format(
      $q$ select create_vendor_organization(%L, 'Nobody Ltd', 'Nobody', 'A Name', '1', 'tour') $q$,
      isl
    ),
    'an unauthenticated caller cannot apply even if it reaches the function'
  );
end
$$;

-- --------------------------------------------------------------------------
-- The length and blank constraints, the Postgres layer under VENDOR_LIMITS
-- --------------------------------------------------------------------------

set local role service_role;

do $$
declare isl uuid := (select v from fixture where k = 'active_island');
begin
  perform test.raises(
    format(
      $q$ insert into vendor_organizations (island_id, legal_name, trading_name, contact_email)
          values (%L, %L, 'ok', 'x@test.local') $q$,
      isl, repeat('a', 121)
    ),
    'legal_name is capped at 120 — VENDOR_LIMITS.businessName'
  );

  perform test.raises(
    format(
      $q$ insert into vendor_organizations (island_id, legal_name, trading_name, contact_email)
          values (%L, 'ok', '   ', 'x@test.local') $q$,
      isl
    ),
    'a whitespace-only trading name is refused — char_length(''   '') <= 120 is true'
  );

  perform test.raises(
    format(
      $q$ insert into vendor_organizations
            (island_id, legal_name, trading_name, contact_email, contact_name)
          values (%L, 'ok', 'ok', 'x@test.local', %L) $q$,
      isl, repeat('n', 121)
    ),
    'contact_name is capped at 120'
  );

  perform test.raises(
    format(
      $q$ insert into vendor_organizations
            (island_id, legal_name, trading_name, contact_email, contact_phone)
          values (%L, 'ok', 'ok', 'x@test.local', %L) $q$,
      isl, repeat('9', 41)
    ),
    'contact_phone is capped at 40 — VENDOR_LIMITS.phone'
  );

  perform test.raises(
    format(
      $q$ insert into vendor_organizations
            (island_id, legal_name, trading_name, contact_email, business_type)
          values (%L, 'ok', 'ok', 'x@test.local', 'mining') $q$,
      isl
    ),
    'business_type outside VENDOR_BUSINESS_TYPE_IDS is refused'
  );

  -- Positive control for all five: the same shape at the limit, with a valid type, is accepted.
  -- Without it each raises above could be passing on an unrelated not-null or FK error.
  insert into vendor_organizations
    (island_id, legal_name, trading_name, contact_email, contact_name, contact_phone, business_type)
  values (
    isl, repeat('a', 120), repeat('t', 120), 'edge@test.local',
    repeat('n', 120), repeat('9', 40), 'other'
  );
  perform test.ok(true, 'values exactly at every limit are accepted');

  -- business_type and contact_name are nullable, and char_length(null) is null so a CHECK passes
  -- on null. That is what lets these constraints sit on optional columns; the seeded rows, which
  -- predate both columns, depend on it.
  insert into vendor_organizations (island_id, legal_name, trading_name, contact_email)
  values (isl, 'Sparse Ltd', 'Sparse', 'sparse@test.local');
  perform test.ok(true, 'the new columns stay optional');
end
$$;

rollback;
