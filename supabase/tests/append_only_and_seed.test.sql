-- Append-only guarantees, and the demo-labelling rule from operating rule 9.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;
set local role service_role;

-- --------------------------------------------------------------------------
-- Append-only tables
-- --------------------------------------------------------------------------
--
-- Tested as service_role deliberately. RLS already denies these to ordinary users, but a log an
-- Edge Function (or a compromised service key) can rewrite is not a log. The trigger blocks
-- mutation for every role including the table owner.

do $$
declare
  rid uuid;
  aid uuid;
begin
  insert into voucher_redemptions (token_hash, result) values ('append-test', 'unknown_token')
  returning id into rid;

  perform test.raises(
    format($q$ update voucher_redemptions set result = 'ok' where id = %L $q$, rid),
    'voucher_redemptions rejects UPDATE even for the service role'
  );
  perform test.raises(
    format($q$ delete from voucher_redemptions where id = %L $q$, rid),
    'voucher_redemptions rejects DELETE even for the service role'
  );

  insert into audit_logs (action, entity_type) values ('test.action', 'test')
  returning id into aid;

  perform test.raises(
    format($q$ update audit_logs set action = 'tampered' where id = %L $q$, aid),
    'audit_logs rejects UPDATE even for the service role'
  );
  perform test.raises(
    format($q$ delete from audit_logs where id = %L $q$, aid),
    'audit_logs rejects DELETE even for the service role'
  );
end
$$;

-- --------------------------------------------------------------------------
-- Privileged status changes are audit logged automatically
-- --------------------------------------------------------------------------
--
-- Build-prompt rule: "Every privileged admin action and voucher redemption is audit logged."
-- Done by trigger so no admin code path can forget.

do $$
declare
  org_id uuid;
  before_count integer;
  after_count integer;
begin
  select id into org_id from vendor_organizations where trading_name = '[Demo] Unverified Excursions';

  select count(*) into before_count from audit_logs where entity_id = org_id;
  update vendor_organizations set status = 'approved', review_notes = 'test approval' where id = org_id;
  select count(*) into after_count from audit_logs where entity_id = org_id;

  perform test.eq(after_count, before_count + 1, 'approving a vendor writes an audit_logs row');

  perform test.ok(
    exists (
      select 1 from audit_logs
      where entity_id = org_id
        and action = 'vendor_organizations.status_changed'
        and before ->> 'status' = 'pending_review'
        and after  ->> 'status' = 'approved'
    ),
    'the audit row records both the previous and the new status'
  );
end
$$;

-- --------------------------------------------------------------------------
-- Seed integrity — operating rule 9
-- --------------------------------------------------------------------------

do $$
declare
  n integer;
  unlabelled text[];
begin
  -- PRD §16 names six Jamaica destinations.
  select count(*) into n from destinations d join islands i on i.id = d.island_id where i.code = 'JM';
  perform test.eq(n, 6, 'all six PRD-named Jamaica destinations are seeded');

  perform test.ok(
    exists (select 1 from destinations where slug = 'ocho-rios')
      and exists (select 1 from destinations where slug = 'montego-bay')
      and exists (select 1 from destinations where slug = 'negril')
      and exists (select 1 from destinations where slug = 'kingston')
      and exists (select 1 from destinations where slug = 'port-antonio')
      and exists (select 1 from destinations where slug = 'south-coast'),
    'the seeded destinations are exactly the ones the PRD names'
  );

  -- Every demo vendor is unmistakably labelled, so a screenshot cannot be read as a real listing.
  select coalesce(array_agg(trading_name), '{}') into unlabelled
    from vendor_organizations where is_demo and trading_name not like '[Demo]%';
  perform test.eq(cardinality(unlabelled), 0,
    format('every demo vendor is labelled [Demo] (unlabelled: %s)', array_to_string(unlabelled, ', ')));

  select count(*) into n from experiences where not is_demo;
  perform test.eq(n, 0, 'no seeded listing is presented as real content');

  select count(*) into n from promotions where not is_demo;
  perform test.eq(n, 0, 'no seeded offer is presented as real content');
end
$$;

-- All twelve PRD §16 categories are represented, so the demo covers the whole taxonomy.
do $$
declare
  missing text[];
begin
  select coalesce(array_agg(c::text), '{}') into missing
    from unnest(enum_range(null::experience_category)) c
   where not exists (select 1 from experiences e where e.category = c);

  perform test.eq(cardinality(missing), 0,
    format('every experience category has demo content (missing: %s)', array_to_string(missing, ', ')));
end
$$;

-- PRD §16 names this offer specifically.
do $$
declare
  p record;
begin
  select * into p from promotions where title = 'Free rum punch with a qualifying booking';
  perform test.ok(p.id is not null, 'the rum-punch demo offer exists');
  perform test.eq(p.value_kind, 'in_kind'::promotion_value_kind,
    'it is an in-kind offer — fulfilled at redemption, no effect on the total');
  perform test.ok(length(p.terms) > 50, 'it carries explicit terms, as the PRD requires');
  perform test.ok(p.ends_at > now(), 'it carries an expiry');
  perform test.ok(p.terms like 'DEMO%', 'its terms are marked as a demo offer');
  perform test.ok(
    exists (select 1 from geofences g where g.promotion_id = p.id),
    'it has a geofence attached'
  );
end
$$;

-- The negative-case fixtures the RLS tests rely on must actually exist, or those tests would
-- pass vacuously.
do $$
begin
  perform test.ok(
    exists (select 1 from experiences where title = 'Sound Bath (unpublished draft)' and status = 'draft'),
    'the draft-listing fixture exists for the T-03 negative case'
  );
  perform test.ok(
    exists (
      select 1 from experiences e join vendor_organizations o on o.id = e.vendor_org_id
      where e.title = 'Unverified Vendor Excursion' and e.status = 'approved'
    ),
    'the approved-listing-under-unapproved-vendor fixture exists for the V-02 negative case'
  );
end
$$;

-- Pricing configuration is data, not constants (PRD §10).
do $$
begin
  perform test.ok(
    exists (select 1 from platform_settings where key = 'pricing.commission_rate')
      and exists (select 1 from platform_settings where key = 'pricing.tax_rate')
      and exists (select 1 from platform_settings where key = 'pricing.service_fee_rate'),
    'fee, tax and commission rates are configuration rows, not hard-coded values'
  );

  perform test.ok(
    (select value from platform_settings where key = 'subscription.plans') @> '[]'::jsonb,
    'subscription plans are configurable (placeholder values pending OD-03)'
  );
end
$$;

rollback;
