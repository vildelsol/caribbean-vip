-- M1 · Experiences, media, price options and availability
--
-- AD-05: every monetary column is bigint MINOR UNITS with an explicit currency. No numeric, no
-- float, no implicit currency.

create table experiences (
  id             uuid primary key default gen_random_uuid(),
  vendor_org_id  uuid not null references vendor_organizations(id) on delete cascade,
  island_id      uuid not null references islands(id) on delete restrict,
  destination_id uuid not null references destinations(id) on delete restrict,
  vendor_location_id uuid references vendor_locations(id) on delete set null,

  category       experience_category not null,
  title          text not null,
  summary        text,
  description    text,
  duration_minutes integer not null check (duration_minutes > 0),
  inclusions     text[] not null default '{}',
  exclusions     text[] not null default '{}',
  pickup_info    text,
  meeting_point  text,
  cancellation_policy jsonb not null default '{}'::jsonb,

  -- Denormalized for list rendering and sorting only. The authoritative price is always the sum
  -- of experience_options at quote time (AD-06).
  from_amount_minor bigint not null default 0 check (from_amount_minor >= 0),
  currency       currency_code not null,

  status         listing_status not null default 'draft',
  review_notes   text,
  reviewed_by    uuid references profiles(id) on delete set null,
  reviewed_at    timestamptz,

  -- Operating rule 9: seeded content is labelled demo. Never claim live prices or availability.
  is_demo        boolean not null default false,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index experiences_discovery_idx
  on experiences (island_id, destination_id, category)
  where status = 'approved';

create index experiences_vendor_idx on experiences (vendor_org_id);

create trigger experiences_set_updated_at
  before update on experiences
  for each row execute function set_updated_at();

-- An experience must belong to a destination on its own island. Without this, a Jamaica listing
-- could be filed under a Cayman town and would then appear in the wrong localized discovery.
create or replace function assert_destination_matches_island()
returns trigger
language plpgsql
as $$
declare
  dest_island uuid;
begin
  select island_id into dest_island from destinations where id = new.destination_id;
  if dest_island is null or dest_island <> new.island_id then
    raise exception 'destination % does not belong to island %', new.destination_id, new.island_id;
  end if;
  return new;
end;
$$;

create trigger experiences_destination_island_check
  before insert or update of destination_id, island_id on experiences
  for each row execute function assert_destination_matches_island();

-- --------------------------------------------------------------------------
-- experience_media
-- --------------------------------------------------------------------------

create table experience_media (
  id            uuid primary key default gen_random_uuid(),
  experience_id uuid not null references experiences(id) on delete cascade,
  storage_path  text not null,
  alt_text      text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index experience_media_experience_idx
  on experience_media (experience_id, sort_order);

-- --------------------------------------------------------------------------
-- experience_options
-- --------------------------------------------------------------------------

create table experience_options (
  id                uuid primary key default gen_random_uuid(),
  experience_id     uuid not null references experiences(id) on delete cascade,
  kind              experience_option_kind not null,
  label             text not null,
  unit_amount_minor bigint not null check (unit_amount_minor >= 0),
  currency          currency_code not null,

  -- Add-ons do not consume seats; guest tickets do. calculateBookingTotal() reads the same
  -- distinction as `occupiesCapacity`, so the two must agree.
  occupies_capacity boolean not null default true,

  min_quantity      integer not null default 0 check (min_quantity >= 0),
  max_quantity      integer check (max_quantity is null or max_quantity >= min_quantity),
  sort_order        integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index experience_options_experience_idx on experience_options (experience_id);

create trigger experience_options_set_updated_at
  before update on experience_options
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- availability_slots
-- --------------------------------------------------------------------------
--
-- V-03: "Bookings cannot exceed configured capacity." The CHECK below is the last line of
-- defence; the real guarantee is reserve_availability()'s row lock (AD-03), because a CHECK alone
-- cannot stop two concurrent transactions each reading booked_count = capacity - 1.

create table availability_slots (
  id            uuid primary key default gen_random_uuid(),
  experience_id uuid not null references experiences(id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  capacity      integer not null check (capacity >= 0),
  booked_count  integer not null default 0 check (booked_count >= 0),
  status        slot_status not null default 'open',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint availability_slots_time_order check (ends_at > starts_at),
  constraint availability_slots_not_oversold check (booked_count <= capacity),
  unique (experience_id, starts_at)
);

create index availability_slots_lookup_idx
  on availability_slots (experience_id, starts_at)
  where status = 'open';

create trigger availability_slots_set_updated_at
  before update on availability_slots
  for each row execute function set_updated_at();
