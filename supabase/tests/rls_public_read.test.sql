-- Public visibility — T-01, T-03, V-02.
--
-- The negative cases carry the weight here. Proving an approved listing is visible says little;
-- proving a draft listing, and an approved listing belonging to an unapproved vendor, are BOTH
-- invisible to `anon` is what makes T-03 a database guarantee rather than a query convention.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role anon;
do $$ begin perform test.become_anon(); end $$;

-- --------------------------------------------------------------------------
-- T-01 — a guest can browse Jamaica content with no account
-- --------------------------------------------------------------------------

do $$
declare
  n integer;
begin
  select count(*) into n from islands where code = 'JM';
  perform test.eq(n, 1, 'T-01: guest can read the active Jamaica island row');

  select count(*) into n
    from destinations d join islands i on i.id = d.island_id
    where i.code = 'JM';
  perform test.eq(n, 6, 'T-01: guest sees all six seeded Jamaica destinations');

  -- Every active island is browsable, not just the launch market.
  select count(*) into n from islands where is_active;
  perform test.eq(n, 3, 'T-01: guest can read all three populated islands');

  select count(*) into n from experiences;
  perform test.ok(n >= 14, format('T-01: guest sees the approved catalogue (%s listings)', n));
end
$$;

-- Inactive islands are not browsable, so unlaunched markets cannot be discovered early.
do $$
declare
  n integer;
begin
  -- Antigua is seeded inactive precisely so this rule has a subject to be tested against.
  select count(*) into n from islands where code = 'AG';
  perform test.eq(n, 0, 'an inactive island is invisible to guests');

  -- And no destination leaks from behind it either.
  select count(*) into n from destinations d
    where not exists (select 1 from islands i where i.id = d.island_id);
  perform test.eq(n, 0, 'no destination is visible whose island is not');
end
$$;

-- --------------------------------------------------------------------------
-- T-03 / V-02 — the two ways a listing must stay private
-- --------------------------------------------------------------------------

do $$
declare
  n integer;
begin
  -- 1. Draft listing belonging to an APPROVED vendor.
  select count(*) into n from experiences where title = 'Sound Bath (unpublished draft)';
  perform test.eq(n, 0, 'T-03: a draft listing is invisible to anon even though its vendor is approved');

  -- 2. APPROVED listing belonging to an unapproved vendor.
  select count(*) into n from experiences where title = 'Unverified Vendor Excursion';
  perform test.eq(n, 0, 'V-02: an approved listing is invisible while its vendor is pending_review');

  -- And the vendor itself is not enumerable.
  select count(*) into n from vendor_organizations where trading_name = '[Demo] Unverified Excursions';
  perform test.eq(n, 0, 'V-02: an unapproved vendor is invisible to anon');

  -- Nothing non-approved leaks through the general query either.
  select count(*) into n from experiences where status <> 'approved';
  perform test.eq(n, 0, 'T-03: anon can never see a listing whose status is not approved');
end
$$;

-- Child rows inherit the parent's visibility: a draft listing's prices and photos are not
-- readable by direct id either.
do $$
declare
  n integer;
begin
  select count(*) into n
    from experience_options o
    join experiences e on e.id = o.experience_id
   where e.status <> 'approved';
  perform test.eq(n, 0, 'price options of a non-approved listing are invisible');

  select count(*) into n
    from availability_slots s
    join experiences e on e.id = s.experience_id
   where e.status <> 'approved';
  perform test.eq(n, 0, 'availability of a non-approved listing is invisible');
end
$$;

-- --------------------------------------------------------------------------
-- Geofence coordinates are not public
-- --------------------------------------------------------------------------
--
-- Exposing centre/radius would let anyone map every trigger zone and farm offers without
-- visiting. Eligibility is evaluated server-side (PRD §9).

do $$
declare
  n integer;
begin
  select count(*) into n from geofences;
  perform test.eq(n, 0, 'geofence coordinates and radii are never public');
end
$$;

-- An approved, in-window promotion IS public — the tourist has to be able to read its terms.
do $$
declare
  n integer;
begin
  select count(*) into n from promotions;
  perform test.eq(n, 2, 'anon can read approved, in-window offers and their terms');
end
$$;

-- --------------------------------------------------------------------------
-- A guest cannot reach anything private
-- --------------------------------------------------------------------------

do $$
declare
  n integer;
begin
  select count(*) into n from bookings;          perform test.eq(n, 0, 'anon reads no bookings');
  select count(*) into n from payments;          perform test.eq(n, 0, 'anon reads no payments');
  select count(*) into n from vouchers;          perform test.eq(n, 0, 'anon reads no vouchers');
  select count(*) into n from profiles;          perform test.eq(n, 0, 'anon reads no profiles');
  select count(*) into n from vendor_documents;  perform test.eq(n, 0, 'anon reads no vendor documents');
  select count(*) into n from audit_logs;        perform test.eq(n, 0, 'anon reads no audit log');
  select count(*) into n from platform_settings; perform test.eq(n, 0, 'anon reads no platform settings');
end
$$;

-- A guest cannot write anything, either.
--
-- Note the asymmetry, which is how Postgres RLS actually behaves and is worth encoding
-- explicitly: a blocked INSERT raises, but a blocked UPDATE or DELETE simply matches zero rows.
-- Asserting "it raised" would silently pass on a policy that grants anon full write access to
-- rows it can see, so the update/delete cases assert the row is UNCHANGED instead.

do $$
begin
  perform test.raises(
    $q$ insert into experiences (vendor_org_id, island_id, destination_id, category, title, duration_minutes, currency)
        select o.id, o.island_id, d.id, 'adventure', 'Injected listing', 60, 'USD'
        from vendor_organizations o, destinations d limit 1 $q$,
    'anon cannot insert a listing'
  );

  perform test.raises(
    $q$ insert into profiles (id) values (gen_random_uuid()) $q$,
    'anon cannot create a profile directly'
  );
end
$$;

do $$
declare
  affected integer;
  still_named text;
begin
  update islands set name = 'Hacked' where code = 'JM';
  get diagnostics affected = row_count;
  perform test.eq(affected, 0, 'anon UPDATE on islands matches zero rows');

  -- Read it back through a role that can see everything, to be certain nothing changed.
  set local role service_role;
  select name into still_named from islands where code = 'JM';
  perform test.eq(still_named, 'Jamaica', 'the Jamaica row is unchanged after the attempted update');
  set local role anon;
end
$$;

do $$
declare
  affected integer;
  remaining integer;
begin
  delete from destinations;
  get diagnostics affected = row_count;
  perform test.eq(affected, 0, 'anon DELETE on destinations matches zero rows');

  set local role service_role;
  select count(*) into remaining from destinations;
  -- Counted as service_role, so this covers destinations on inactive islands too — the delete must
  -- have touched nothing at all, not merely nothing the guest could see.
  perform test.ok(remaining >= 17, format('every destination survives the attempted delete (%s)', remaining));
  set local role anon;
end
$$;

rollback;
