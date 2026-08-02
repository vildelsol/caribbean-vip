-- Schema coverage and the RLS blanket check.
--
-- The second test here is the important one: PRD §14 says RLS on EVERY user-accessible table, and
-- the failure mode is a new table added in a later milestone with RLS quietly left off. Testing
-- each policy individually would never catch that; enumerating pg_tables does.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

-- --------------------------------------------------------------------------
-- All 24 PRD §12 entities exist, plus the 3 additions §9/§10/§14 require
-- --------------------------------------------------------------------------

do $$
declare
  required text[] := array[
    -- PRD §12, verbatim
    'profiles','islands','destinations','vendor_organizations','vendor_members',
    'vendor_locations','vendor_documents','experiences','experience_media',
    'experience_options','availability_slots','promotions','geofences','saved_items',
    'trips','trip_items','bookings','booking_guests','payments','vouchers',
    'voucher_redemptions','notifications','reviews','ai_conversations','audit_logs',
    -- Additions documented in docs/erd.md
    'platform_settings','rate_limit_events','promotion_impressions'
  ];
  t text;
begin
  foreach t in array required loop
    perform test.ok(
      to_regclass('public.' || t) is not null,
      format('table %I exists', t)
    );
  end loop;
end
$$;

-- --------------------------------------------------------------------------
-- RLS is enabled on every table in `public`
-- --------------------------------------------------------------------------

do $$
declare
  missing text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
    into missing
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity;

  perform test.ok(
    cardinality(missing) = 0,
    format('every public table has RLS enabled (missing: %s)', array_to_string(missing, ', '))
  );
end
$$;

-- Every RLS-enabled table must also have at least one policy. A table with RLS on and no policy
-- denies everyone, which looks secure but silently breaks the feature that reads it.
do $$
declare
  policyless text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
    into policyless
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relrowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname);

  perform test.ok(
    cardinality(policyless) = 0,
    format('every RLS table has at least one policy (bare: %s)', array_to_string(policyless, ', '))
  );
end
$$;

-- --------------------------------------------------------------------------
-- Money columns are integer minor units (AD-05)
-- --------------------------------------------------------------------------

do $$
declare
  bad text[];
begin
  select coalesce(array_agg(table_name || '.' || column_name), '{}')
    into bad
    from information_schema.columns
   where table_schema = 'public'
     and column_name like '%_minor'
     and data_type not in ('bigint', 'integer');

  perform test.ok(
    cardinality(bad) = 0,
    format('all *_minor columns are integers (bad: %s)', array_to_string(bad, ', '))
  );
end
$$;

-- PRD §10: "never store full card numbers or security codes". Assert no column could hold one.
do $$
declare
  suspicious text[];
begin
  select coalesce(array_agg(table_name || '.' || column_name), '{}')
    into suspicious
    from information_schema.columns
   where table_schema = 'public'
     and (
       column_name ~* '(card_number|cardnumber|^pan$|cvc|cvv|security_code|expiry_month|expiry_year)'
     );

  perform test.ok(
    cardinality(suspicious) = 0,
    format('no card-data columns exist (found: %s)', array_to_string(suspicious, ', '))
  );
end
$$;

-- --------------------------------------------------------------------------
-- Webhook idempotency is a constraint, not a convention (T-05)
-- --------------------------------------------------------------------------

do $$
begin
  perform test.ok(
    exists (
      select 1 from pg_indexes
      where schemaname = 'public' and tablename = 'payments'
        and indexdef ilike '%unique%' and indexdef ilike '%stripe_event_id%'
    ),
    'payments.stripe_event_id is UNIQUE — a replayed webhook cannot create a second booking'
  );

  perform test.ok(
    exists (
      select 1 from pg_indexes
      where schemaname = 'public' and tablename = 'bookings'
        and indexdef ilike '%unique%' and indexdef ilike '%idempotency_key%'
    ),
    'bookings.idempotency_key is UNIQUE — a double-tapped checkout cannot create two bookings'
  );

  perform test.ok(
    exists (
      select 1 from pg_indexes
      where schemaname = 'public' and tablename = 'vouchers'
        and indexdef ilike '%unique%' and indexdef ilike '%token_hash%'
    ),
    'vouchers.token_hash is UNIQUE'
  );

  -- AD-04: the database stores a hash, never the token itself.
  perform test.ok(
    not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'vouchers' and column_name = 'token'
    ),
    'vouchers has no raw token column — only token_hash'
  );
end
$$;

-- --------------------------------------------------------------------------
-- Capacity cannot be oversold, at the constraint level
-- --------------------------------------------------------------------------

do $$
begin
  perform test.ok(
    exists (
      select 1 from pg_constraint
      where conname = 'availability_slots_not_oversold'
    ),
    'availability_slots has a booked_count <= capacity CHECK'
  );
end
$$;
