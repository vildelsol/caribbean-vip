-- Local test harness: a minimal stand-in for the parts of Supabase the migrations depend on.
--
-- Supabase's own stack requires Docker. This harness lets the migrations, the RLS policies and
-- the two atomicity functions be verified against a plain PostgreSQL instance, which means the
-- checks also run in CI without a Docker service. It creates only what the migrations touch:
--
--   auth.users        the table `profiles` references
--   auth.uid()        the identity function every RLS policy calls
--   anon / authenticated / service_role   the Supabase roles the policies name
--
-- It is NOT a Supabase emulator. Storage policies and Auth behaviour are skipped here and must be
-- verified against a real Supabase project before staging (see docs/test-plan.md).

create schema if not exists auth;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- Supabase derives this from the request JWT. Here it reads a session GUC that the tests set,
-- which is exactly how `set local role` + `set local request.jwt.claim.sub` behaves in practice.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

-- Supabase's Auth service owns auth.users. Here the service_role stands in for it so tests can
-- create the users their fixtures need; anon and authenticated deliberately get nothing.
grant select, insert, update, delete on auth.users to service_role;

-- Mirrors Supabase's default grants. RLS, not GRANT, is what actually restricts row access —
-- which is the point of the negative tests.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

-- --------------------------------------------------------------------------
-- Test assertions
-- --------------------------------------------------------------------------
--
-- Raising is the whole mechanism: db-test.sh runs psql with ON_ERROR_STOP=1, so any failed
-- assertion aborts the file and the runner reports it.

create schema if not exists test;

create or replace function test.ok(condition boolean, what text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'ASSERTION FAILED: %', what;
  end if;
  raise notice 'ok: %', what;
end;
$$;

create or replace function test.eq(actual anyelement, expected anyelement, what text)
returns void
language plpgsql
as $$
begin
  if actual is distinct from expected then
    raise exception 'ASSERTION FAILED: % (expected %, got %)', what, expected, actual;
  end if;
  raise notice 'ok: %', what;
end;
$$;

-- Asserts that `sql` fails. Used for the negative cases that matter most: append-only tables,
-- illegal state transitions, and RLS refusing a write.
create or replace function test.raises(sql text, what text)
returns void
language plpgsql
as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok: % (%)', what, sqlerrm;
    return;
  end;
  raise exception 'ASSERTION FAILED: % — expected an error but the statement succeeded', what;
end;
$$;

-- Impersonate a signed-in user, the way Supabase sets the JWT claim per request.
create or replace function test.become(user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

create or replace function test.become_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
end;
$$;

grant usage on schema test to anon, authenticated, service_role;
