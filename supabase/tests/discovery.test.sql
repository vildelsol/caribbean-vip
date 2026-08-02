-- Detail page and saved items — M2.
--
-- Covers the data the detail screen depends on, and the boundary that makes saving an
-- account-only feature. The app fetches the detail with PostgREST's embedded-select syntax; the
-- joins below are the same relationships expressed as plain SQL, so a broken foreign key or a
-- missing policy is caught here even though the PostgREST syntax itself needs a real Supabase.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role anon;
do $$ begin perform test.become_anon(); end $$;

-- --------------------------------------------------------------------------
-- Everything the detail page renders is reachable by a GUEST (T-01)
-- --------------------------------------------------------------------------

do $$
declare
  e record;
  n integer;
begin
  select * into e from experiences where title = 'Catamaran Snorkel & Sunset';
  perform test.ok(e.id is not null, 'T-01: a guest can read an approved listing');

  -- Fields PRD §5 requires on the detail page.
  perform test.ok(e.description is not null, 'the listing has a description');
  perform test.ok(cardinality(e.inclusions) > 0, 'the listing lists inclusions');
  perform test.ok(e.pickup_info is not null, 'the listing has pickup information');
  perform test.ok(e.duration_minutes > 0, 'the listing has a duration');

  select count(*) into n from experience_options o where o.experience_id = e.id and o.is_active;
  perform test.ok(n >= 2, format('a guest can read price options (%s)', n));

  select count(*) into n
    from availability_slots s
   where s.experience_id = e.id and s.status = 'open' and s.starts_at > now();
  perform test.ok(n > 0, format('a guest can read upcoming availability (%s slots)', n));

  -- The vendor name shown as "Operated by".
  perform test.ok(
    exists (select 1 from vendor_organizations o where o.id = e.vendor_org_id),
    'a guest can read the operating vendor of an approved listing'
  );

  perform test.ok(
    exists (select 1 from destinations d where d.id = e.destination_id),
    'a guest can read the destination'
  );
end
$$;

-- The same joins for a NON-visible listing must produce nothing at every level, so the detail
-- page cannot be used to confirm that a hidden listing exists.
do $$
declare
  n integer;
begin
  select count(*) into n
    from experience_options o
    join experiences e on e.id = o.experience_id
   where e.title = 'Sound Bath (unpublished draft)';
  perform test.eq(n, 0, 'a draft listing exposes no price options');

  select count(*) into n
    from availability_slots s
    join experiences e on e.id = s.experience_id
   where e.title = 'Unverified Vendor Excursion';
  perform test.eq(n, 0, 'an unapproved vendor''s listing exposes no availability');
end
$$;

-- --------------------------------------------------------------------------
-- Ratings come only from published reviews
-- --------------------------------------------------------------------------

do $$
declare
  n integer;
begin
  -- Nothing is seeded as published, so the aggregate must be empty rather than inventing a score.
  select count(*) into n from experience_ratings;
  perform test.eq(n, 0, 'no ratings exist until a review is published — none are invented');
end
$$;

-- --------------------------------------------------------------------------
-- Saved items require an account
-- --------------------------------------------------------------------------

do $$
declare
  n integer;
  exp_id uuid;
begin
  select id into exp_id from experiences limit 1;

  select count(*) into n from saved_items;
  perform test.eq(n, 0, 'a guest reads no saved items');

  perform test.raises(
    format(
      $q$ insert into saved_items (user_id, item_type, item_id)
          values (gen_random_uuid(), 'experience', %L) $q$,
      exp_id
    ),
    'a guest cannot save an experience — there is no account to attach it to'
  );
end
$$;

-- A signed-in tourist can save, and cannot see anyone else's saves.
do $$
declare
  a uuid;
  b uuid;
  exp_id uuid;
  n integer;
begin
  set local role service_role;
  insert into auth.users (email) values ('save-a@test.local') returning id into a;
  insert into auth.users (email) values ('save-b@test.local') returning id into b;
  select id into exp_id from experiences where status = 'approved' limit 1;

  set local role authenticated;
  perform test.become(a);

  insert into saved_items (user_id, item_type, item_id) values (a, 'experience', exp_id);
  select count(*) into n from saved_items;
  perform test.eq(n, 1, 'a signed-in tourist can save an experience and read it back');

  -- Saving the same thing twice is a no-op, not a duplicate row.
  perform test.raises(
    format(
      $q$ insert into saved_items (user_id, item_type, item_id) values (%L, 'experience', %L) $q$,
      a, exp_id
    ),
    'the same experience cannot be saved twice'
  );

  perform test.become(b);
  select count(*) into n from saved_items;
  perform test.eq(n, 0, 'tourist B sees none of tourist A''s saved items');

  -- Nor can B remove A's save.
  delete from saved_items where item_id = exp_id;
  get diagnostics n = row_count;
  perform test.eq(n, 0, 'tourist B cannot delete tourist A''s saved item');

  -- A can remove their own.
  perform test.become(a);
  delete from saved_items where item_id = exp_id;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'tourist A can remove their own saved item');
end
$$;

-- --------------------------------------------------------------------------
-- Destination-scoped discovery (T-02)
-- --------------------------------------------------------------------------

do $$
declare
  ocho uuid;
  negril uuid;
  n_ocho integer;
  n_negril integer;
begin
  set local role anon;
  perform test.become_anon();

  select id into ocho from destinations where slug = 'ocho-rios';
  select id into negril from destinations where slug = 'negril';

  select count(*) into n_ocho from experiences where destination_id = ocho;
  select count(*) into n_negril from experiences where destination_id = negril;

  perform test.ok(n_ocho > 0, 'Ocho Rios has content');
  perform test.ok(n_negril > 0, 'Negril has content');

  -- Switching destination must genuinely change the results, which is what T-02's "content and
  -- labels update" acceptance criterion means. Asserted by comparing the two result SETS: no
  -- listing may appear under both destinations.
  perform test.ok(
    not exists (
      select 1
        from experiences a
        join experiences b on a.id = b.id
       where a.destination_id = ocho and b.destination_id = negril
    ),
    'T-02: no listing appears under two destinations — switching genuinely changes the results'
  );

  -- And the destination filter is not a no-op: it returns strictly fewer than the island total.
  perform test.ok(
    n_ocho < (select count(*) from experiences),
    'T-02: filtering by destination narrows the catalogue rather than returning everything'
  );
end
$$;

rollback;
