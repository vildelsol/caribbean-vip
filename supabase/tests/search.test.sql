-- search_experiences — T-03.
--
-- The decisive test is the last one: search must not become a route around RLS. A `security
-- definer` search function would return drafts and unapproved vendors' listings while every
-- direct query correctly hid them, and no other test in the suite would notice.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role anon;
do $$ begin perform test.become_anon(); end $$;

-- --------------------------------------------------------------------------
-- Basic retrieval
-- --------------------------------------------------------------------------

do $$
declare
  n integer;
begin
  select count(*) into n from search_experiences();
  perform test.ok(n >= 14, format('an empty query returns the catalogue (%s rows)', n));

  -- Several islands now sell a catamaran trip, so the count is not the point; matching is.
  select count(*) into n from search_experiences('catamaran');
  perform test.ok(n >= 1, format('a full-text query finds the catamaran cruises (%s)', n));

  perform test.eq(
    (select count(*) from search_experiences('CATAMARAN')),
    (select count(*) from search_experiences('catamaran')),
    'search is case-insensitive'
  );

  -- English stemming: "rafting" must find "Rafting", and "climb" must find "Climb".
  select count(*) into n from search_experiences('rafting');
  perform test.ok(n >= 1, 'stemmed full-text matching works');

  select count(*) into n from search_experiences('zzzznotathing');
  perform test.eq(n, 0, 'a query matching nothing returns nothing rather than everything');
end
$$;

-- Partial words matter: a tourist typing on a phone rarely finishes the word.
do $$
declare
  n integer;
begin
  select count(*) into n from search_experiences('catama');
  perform test.ok(n >= 1, 'a partial word still finds the listing (trigram fallback)');
end
$$;

-- Ranking: a title hit must outrank a description-only hit.
do $$
declare
  first_title text;
begin
  select title into first_title from search_experiences('coffee') limit 1;
  perform test.eq(first_title, 'Blue Mountain Coffee Tasting',
    'a title match ranks above a body match');
end
$$;

-- --------------------------------------------------------------------------
-- Filters mirror packages/types/src/search.ts
-- --------------------------------------------------------------------------

do $$
declare
  n integer;
  jm uuid;
  ocho uuid;
begin
  select id into jm from islands where code = 'JM';
  select id into ocho from destinations where slug = 'ocho-rios';

  select count(*) into n from search_experiences('', jm);
  perform test.ok(n >= 14, 'filtering by island returns the Jamaica catalogue');

  select count(*) into n from search_experiences('', jm, ocho);
  perform test.ok(n >= 2, 'filtering by destination narrows the results');

  select count(*) into n
    from search_experiences('', null, null, array['waterfalls']::experience_category[]);
  perform test.ok(n >= 2, 'filtering by category works');

  select count(*) into n
    from search_experiences('', null, null, null, 6000, 9000);
  perform test.ok(n >= 1, 'filtering by price band works');

  select count(*) into n
    from search_experiences('', null, null, null, null, null, 100);
  perform test.ok(n >= 1, 'filtering by maximum duration works');

  -- A band that excludes everything must return nothing, not fall back to unfiltered results.
  select count(*) into n
    from search_experiences('', null, null, null, 99999999, 999999990);
  perform test.eq(n, 0, 'an impossible price band returns nothing');
end
$$;

-- Pagination is clamped so a client cannot ask for the whole table in one call.
do $$
declare
  n integer;
begin
  select count(*) into n from search_experiences('', null, null, null, null, null, null, 5);
  perform test.eq(n, 5, 'the limit is respected');

  select count(*) into n from search_experiences('', null, null, null, null, null, null, 100000);
  perform test.ok(n <= 100, 'an absurd limit is clamped to 100');

  select count(*) into n from search_experiences('', null, null, null, null, null, null, 0);
  perform test.eq(n, 1, 'a zero limit is clamped up to 1 rather than returning nothing');
end
$$;

-- --------------------------------------------------------------------------
-- Search does not bypass RLS — the test this file exists for
-- --------------------------------------------------------------------------

do $$
declare
  n integer;
begin
  -- A draft listing, searched for by its exact title.
  select count(*) into n from search_experiences('Sound Bath');
  perform test.eq(n, 0, 'T-03: a draft listing is not findable by search, even by exact title');

  -- An approved listing whose vendor is still pending review.
  select count(*) into n from search_experiences('Unverified Vendor Excursion');
  perform test.eq(n, 0, 'V-02: an unapproved vendor''s listing is not findable by search');

  -- And nothing non-approved leaks through an unfiltered search either.
  select count(*) into n
    from search_experiences() s
    join experiences e on e.id = s.id
   where e.status <> 'approved';
  perform test.eq(n, 0, 'no non-approved listing appears in any search result');
end
$$;

-- Guard the mechanism, not just the behaviour: if someone later adds `security definer` to this
-- function, the assertions above would still pass under a service-role connection but would leak
-- in production. Assert the function's own definition.
do $$
declare
  is_definer boolean;
begin
  select p.prosecdef into is_definer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'search_experiences';

  perform test.eq(is_definer, false,
    'search_experiences is NOT security definer — making it so would make drafts searchable');
end
$$;

-- The ratings view must not leak unmoderated reviews either.
do $$
declare
  is_invoker text;
begin
  select coalesce((
    select option_value from pg_options_to_table(c.reloptions)
     where option_name = 'security_invoker'
  ), 'false') into is_invoker
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'experience_ratings';

  perform test.ok(is_invoker in ('true', 'on'),
    'experience_ratings is security_invoker, so review RLS still applies through the view');
end
$$;

rollback;
