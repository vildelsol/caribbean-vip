-- M1 · Vendor organizations, membership, locations and onboarding documents
--
-- PRD §6, V-01, V-02. `vendor_members` is the basis of every vendor RLS policy — a user reaches
-- vendor data only through a membership row, never through a role claim on their profile.

create table vendor_organizations (
  id                 uuid primary key default gen_random_uuid(),
  island_id          uuid not null references islands(id) on delete restrict,
  legal_name         text not null,
  trading_name       text not null,
  contact_email      text not null,
  contact_phone      text,
  description        text,
  status             vendor_status not null default 'draft',

  -- Filled by admin review (PRD §7: "record reasons").
  review_notes       text,
  reviewed_by        uuid references profiles(id) on delete set null,
  reviewed_at        timestamptz,

  subscription_plan_key text,

  -- AD-09 / OD-02: Connect-ready, but null until Connect is actually adopted. Its presence here
  -- is what lets payouts be added later without touching booking logic.
  stripe_account_id  text unique,

  is_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index vendor_organizations_status_idx on vendor_organizations (status);
create index vendor_organizations_island_idx on vendor_organizations (island_id);

create trigger vendor_organizations_set_updated_at
  before update on vendor_organizations
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- vendor_members
-- --------------------------------------------------------------------------

create table vendor_members (
  id            uuid primary key default gen_random_uuid(),
  vendor_org_id uuid not null references vendor_organizations(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  role          user_role not null check (role in ('vendor_owner', 'vendor_staff')),

  -- PRD §4: vendor staff have "no access to payout or account ownership settings unless granted".
  can_manage_listings boolean not null default false,
  can_scan_vouchers   boolean not null default true,
  can_view_payouts    boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (vendor_org_id, user_id)
);

create index vendor_members_user_idx on vendor_members (user_id);

create trigger vendor_members_set_updated_at
  before update on vendor_members
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- vendor_locations
-- --------------------------------------------------------------------------

create table vendor_locations (
  id              uuid primary key default gen_random_uuid(),
  vendor_org_id   uuid not null references vendor_organizations(id) on delete cascade,
  destination_id  uuid references destinations(id) on delete set null,
  name            text not null,
  address         text,
  lat             double precision not null check (lat between -90 and 90),
  lng             double precision not null check (lng between -180 and 180),
  operating_hours jsonb not null default '{}'::jsonb,
  is_primary      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index vendor_locations_org_idx on vendor_locations (vendor_org_id);

-- At most one primary location per vendor. A partial unique index expresses this without
-- forbidding many non-primary locations.
create unique index vendor_locations_one_primary_idx
  on vendor_locations (vendor_org_id) where is_primary;

create trigger vendor_locations_set_updated_at
  before update on vendor_locations
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- vendor_documents
-- --------------------------------------------------------------------------
--
-- PRD §14: onboarding evidence lives in a NON-PUBLIC bucket. Only the storage path is stored
-- here; access is a short-lived signed URL minted server-side after an ownership check.

create table vendor_documents (
  id            uuid primary key default gen_random_uuid(),
  vendor_org_id uuid not null references vendor_organizations(id) on delete cascade,
  kind          text not null,
  storage_path  text not null,
  original_filename text,
  review_state  document_review_state not null default 'pending',
  review_notes  text,
  reviewed_by   uuid references profiles(id) on delete set null,
  reviewed_at   timestamptz,
  uploaded_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index vendor_documents_org_idx on vendor_documents (vendor_org_id);

create trigger vendor_documents_set_updated_at
  before update on vendor_documents
  for each row execute function set_updated_at();
