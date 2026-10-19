-- The listing text columns are bounded.
--
-- `title`, `summary`, `description` and `pickup_info` were created as plain `text` with nothing
-- above them bounding either — no Zod schema, no `maxLength` on the vendor form. The limits added
-- in 20261014000001 are mirrored in `LISTING_LIMITS` (packages/types/src/listing.ts) and on the
-- vendor inputs, and all three have to agree or the save button fails for reasons a vendor cannot
-- see. This file is the one that fails loudly if the database half drifts.
--
-- The seeded catalogue's longest values are title 35, summary 76, description 297 and pickup 54,
-- so the "existing rows still fit" case is covered by the seed loading at all, above.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

-- --------------------------------------------------------------------------
-- Every constraint is actually present
-- --------------------------------------------------------------------------

do $$
declare
  required text[] := array[
    'experiences_title_length',
    'experiences_title_not_blank',
    'experiences_summary_length',
    'experiences_description_length',
    'experiences_pickup_info_length',
    'vendor_organizations_description_length'
  ];
  c text;
begin
  foreach c in array required loop
    perform test.ok(
      exists (select 1 from pg_constraint where conname = c),
      format('constraint %I exists', c)
    );
  end loop;
end
$$;

-- --------------------------------------------------------------------------
-- They bite
-- --------------------------------------------------------------------------

do $$
declare
  v_vendor uuid;
  v_island uuid;
  v_dest   uuid;
begin
  select id into v_vendor from vendor_organizations limit 1;
  select id into v_island from islands limit 1;
  select id into v_dest from destinations where island_id = v_island limit 1;

  perform test.raises(
    format(
      $sql$insert into experiences (vendor_org_id, island_id, destination_id, category, title,
             duration_minutes, currency)
           values (%L, %L, %L, 'waterfalls', repeat('a', 121), 60, 'USD')$sql$,
      v_vendor, v_island, v_dest
    ),
    'a 121-character title is rejected'
  );

  perform test.raises(
    format(
      $sql$insert into experiences (vendor_org_id, island_id, destination_id, category, title,
             summary, duration_minutes, currency)
           values (%L, %L, %L, 'waterfalls', 'Fine', repeat('b', 281), 60, 'USD')$sql$,
      v_vendor, v_island, v_dest
    ),
    'a 281-character summary is rejected'
  );

  perform test.raises(
    format(
      $sql$insert into experiences (vendor_org_id, island_id, destination_id, category, title,
             duration_minutes, currency)
           values (%L, %L, %L, 'waterfalls', '', 60, 'USD')$sql$,
      v_vendor, v_island, v_dest
    ),
    'an empty title is rejected'
  );

  -- The case the length check could never catch: `char_length('   ') <= 120` is true.
  perform test.raises(
    format(
      $sql$insert into experiences (vendor_org_id, island_id, destination_id, category, title,
             duration_minutes, currency)
           values (%L, %L, %L, 'waterfalls', '   ', 60, 'USD')$sql$,
      v_vendor, v_island, v_dest
    ),
    'a whitespace-only title is rejected'
  );
end
$$;

-- --------------------------------------------------------------------------
-- A row at exactly the limit is accepted, and null still means null
--
-- `char_length(null) <= 120` evaluates to null, and a CHECK passes on null rather than failing —
-- which is what keeps these constraints compatible with the three nullable columns.
-- --------------------------------------------------------------------------

do $$
declare
  v_vendor uuid;
  v_island uuid;
  v_dest   uuid;
  v_id     uuid;
begin
  select id into v_vendor from vendor_organizations limit 1;
  select id into v_island from islands limit 1;
  select id into v_dest from destinations where island_id = v_island limit 1;

  insert into experiences (vendor_org_id, island_id, destination_id, category, title,
         summary, description, pickup_info, duration_minutes, currency)
  values (v_vendor, v_island, v_dest, 'waterfalls', repeat('a', 120),
         null, null, null, 60, 'USD')
  returning id into v_id;

  perform test.ok(v_id is not null, 'a title at exactly 120 characters is accepted');
  perform test.ok(
    (select summary is null from experiences where id = v_id),
    'the nullable columns still accept null under the constraint'
  );

  delete from experiences where id = v_id;
end
$$;
