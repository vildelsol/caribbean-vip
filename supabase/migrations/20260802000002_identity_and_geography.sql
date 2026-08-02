-- M1 · Identity and geography
--
-- PRD §3: one account, one wallet, one trip history across every island. Island localization is a
-- runtime switch on a shared schema (AD-08) — there is no per-island database or deployment.

-- --------------------------------------------------------------------------
-- islands
-- --------------------------------------------------------------------------

create table islands (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z]{2}$'),
  name          text not null,
  -- PRD §3: the app is never renamed. This is the localized IN-APP identity only
  -- ("VIP Jamaica"); the app-store brand is always "Caribbean VIP".
  in_app_brand  text not null,
  currency      currency_code not null,
  timezone      text not null,
  hero_media_path text,
  is_active     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger islands_set_updated_at
  before update on islands
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- destinations
-- --------------------------------------------------------------------------

create table destinations (
  id          uuid primary key default gen_random_uuid(),
  island_id   uuid not null references islands(id) on delete restrict,
  name        text not null,
  slug        text not null,
  centre_lat  double precision not null check (centre_lat between -90 and 90),
  centre_lng  double precision not null check (centre_lng between -180 and 180),
  editorial_content text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (island_id, slug)
);

create index destinations_island_idx on destinations (island_id) where is_active;

create trigger destinations_set_updated_at
  before update on destinations
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- profiles
-- --------------------------------------------------------------------------
--
-- Extends auth.users. Guests (T-01) have NO row here — browsing is served by the `anon` RLS
-- policies in the RLS migration, not by a throwaway profile.

create table profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  role                    user_role not null default 'tourist',
  display_name            text,
  selected_island_id      uuid references islands(id) on delete set null,
  selected_destination_id uuid references destinations(id) on delete set null,
  interests               experience_category[] not null default '{}',
  party_size              integer check (party_size is null or party_size > 0),
  currency                currency_code not null default 'USD',
  locale                  text not null default 'en',

  -- T-07 / PRD §14. Two INDEPENDENT flags: the OS permission is not consent to marketing, and
  -- the marketing opt-in cannot access location. mayTriggerGeofencedOffer() requires both.
  location_consent        boolean not null default false,
  offer_consent           boolean not null default false,
  notification_consent    boolean not null default false,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- A profile is created automatically on signup so no client code can forget to, and so the role
-- always defaults to 'tourist' — privilege is granted by an admin, never claimed at registration.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
