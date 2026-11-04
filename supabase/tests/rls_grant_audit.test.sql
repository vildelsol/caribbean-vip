-- Catalogue audit: no table without RLS, no anon-callable definer function that writes.
--
-- Written after the audit found write_audit_log() executable by anon (fixed in 20261104000009).
-- Per-table policy tests only cover tables someone remembered to test. This file reads the catalogue,
-- so a NEW table or function that forgets RLS or leaves a definer function open fails here without
-- anyone writing a test for it.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;
set local role service_role;

-- 1. Every public table has row level security on.
do $$
declare t text;
begin
  select string_agg(c.relname, ', ') into t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  perform test.ok(t is null, 'every public table has RLS enabled' || coalesce(' (missing: ' || t || ')', ''));
end $$;

-- 2. Anon-callable SECURITY DEFINER functions: only read-only predicates and trigger functions.
--    A definer function runs as its owner with RLS bypassed, so EXECUTE is the only barrier.
--    Allowlist = the stable role predicates the policies call. Anything else must be revoked.
do $$
declare bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('anon', p.oid, 'execute')
     and pg_get_function_result(p.oid) <> 'trigger'
     and not (p.provolatile = 's' and p.proname in
              ('is_admin', 'is_super_admin', 'is_vendor_member', 'is_vendor_owner',
               'is_vendor_listing_manager', 'can_scan_for_vendor'));
  perform test.ok(bad is null, 'no anon-callable definer function beyond the read-only predicates' || coalesce(' (found: ' || bad || ')', ''));
end $$;

-- 3. Every definer function pins search_path (a definer with a mutable path can be hijacked).
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  perform test.ok(bad is null, 'every definer function pins search_path' || coalesce(' (missing: ' || bad || ')', ''));
end $$;

-- 4. The audit log cannot be forged, with a positive control.
do $$
declare plain_u uuid; adm_u uuid;
begin
  insert into auth.users (email) values ('audit-plain@test.local') returning id into plain_u;
  insert into auth.users (email) values ('audit-admin@test.local') returning id into adm_u;
  update profiles set role = 'admin' where id = adm_u;
  create temporary table af (k text primary key, v uuid) on commit drop;
  grant select on af to anon, authenticated;
  insert into af values ('plain', plain_u), ('admin', adm_u);
end $$;

set local role anon;
do $$ begin
  perform test.become_anon();
  perform test.raises($q$ select write_audit_log('forged', 'listing', gen_random_uuid()) $q$,
                      'anon cannot write an audit row');
end $$;

set local role authenticated;
do $$ begin
  perform test.become((select v from af where k = 'plain'));
  perform test.raises($q$ select write_audit_log('forged', 'listing', gen_random_uuid()) $q$,
                      'a signed-in non-admin cannot write an audit row');
  perform test.become((select v from af where k = 'admin'));
  perform test.ok(write_audit_log('listing.approved', 'experiences', gen_random_uuid()) is not null,
                  'an admin can still write an audit row (control)');
end $$;

rollback;
