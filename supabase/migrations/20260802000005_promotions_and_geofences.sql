-- M1 · Promotions and geofences
--
-- PRD §9. The geofence column list is taken directly from the PRD: centre lat/lng, radius in
-- metres, active dates/times, destination and optional vendor/location, plus cooldown.

create table promotions (
  id             uuid primary key default gen_random_uuid(),
  vendor_org_id  uuid not null references vendor_organizations(id) on delete cascade,
  island_id      uuid not null references islands(id) on delete restrict,

  title          text not null,
  description    text,
  -- PRD §9 requires eligibility, expiry, distance and terms be shown to the tourist. Terms are
  -- mandatory, not optional, so an offer cannot ship without them.
  terms          text not null,

  value_kind     promotion_value_kind not null,
  -- Null for 'in_kind' (e.g. a free rum punch has no monetary effect on the total; it is
  -- fulfilled at redemption). Required otherwise.
  value_amount_minor bigint check (value_amount_minor is null or value_amount_minor >= 0),
  value_rate     numeric(5,4) check (value_rate is null or (value_rate >= 0 and value_rate <= 1)),
  currency       currency_code,

  starts_at      timestamptz not null,
  ends_at        timestamptz not null,

  -- PRD §9: do not trigger when out of inventory.
  inventory_limit integer check (inventory_limit is null or inventory_limit >= 0),
  issued_count   integer not null default 0 check (issued_count >= 0),

  -- OD-07: PRD §9 supports both standalone saved offers (T-08) and offers linked to a paid
  -- booking (Journey B step 6), so this is configurable rather than assumed.
  requires_booking boolean not null default false,

  approval_state approval_state not null default 'pending',
  reviewed_by    uuid references profiles(id) on delete set null,
  reviewed_at    timestamptz,

  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint promotions_time_order check (ends_at > starts_at),
  constraint promotions_inventory_not_exceeded
    check (inventory_limit is null or issued_count <= inventory_limit),
  constraint promotions_value_matches_kind check (
    (value_kind = 'percentage' and value_rate is not null)
    or (value_kind = 'fixed' and value_amount_minor is not null and currency is not null)
    or (value_kind = 'in_kind')
  )
);

create index promotions_active_idx
  on promotions (island_id, starts_at, ends_at)
  where approval_state = 'approved';

create index promotions_vendor_idx on promotions (vendor_org_id);

create trigger promotions_set_updated_at
  before update on promotions
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- promotion_experiences — which listings an offer applies to
-- --------------------------------------------------------------------------
--
-- Empty set means the offer applies to every listing from that vendor.

create table promotion_experiences (
  promotion_id  uuid not null references promotions(id) on delete cascade,
  experience_id uuid not null references experiences(id) on delete cascade,
  primary key (promotion_id, experience_id)
);

-- --------------------------------------------------------------------------
-- geofences
-- --------------------------------------------------------------------------

create table geofences (
  id                 uuid primary key default gen_random_uuid(),
  promotion_id       uuid not null references promotions(id) on delete cascade,
  destination_id     uuid references destinations(id) on delete set null,
  vendor_location_id uuid references vendor_locations(id) on delete set null,

  centre_lat         double precision not null check (centre_lat between -90 and 90),
  centre_lng         double precision not null check (centre_lng between -180 and 180),
  -- A radius under ~50m is inside consumer GPS error and would fire unpredictably; over 20km it
  -- is not "nearby" in any meaningful sense.
  radius_m           integer not null check (radius_m between 50 and 20000),

  -- 0 = Sunday .. 6 = Saturday. Empty means every day.
  active_days        smallint[] not null default '{}',
  active_from_time   time,
  active_to_time     time,

  -- PRD §9: "Apply cooldowns to prevent repeated notifications."
  cooldown_minutes   integer not null default 1440 check (cooldown_minutes >= 0),

  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index geofences_promotion_idx on geofences (promotion_id) where is_active;

create trigger geofences_set_updated_at
  before update on geofences
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- promotion_impressions — cooldown state
-- --------------------------------------------------------------------------
--
-- Beyond the PRD's 24 entities. PRD §9 mandates cooldowns but none of the listed entities can
-- hold "when did we last show this offer to this user".

create table promotion_impressions (
  id           uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references promotions(id) on delete cascade,
  geofence_id  uuid references geofences(id) on delete set null,
  user_id      uuid not null references profiles(id) on delete cascade,
  shown_at     timestamptz not null default now()
);

create index promotion_impressions_cooldown_idx
  on promotion_impressions (user_id, promotion_id, shown_at desc);
