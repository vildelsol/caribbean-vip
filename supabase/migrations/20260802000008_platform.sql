-- M1 · Notifications, reviews, AI conversations, audit log, settings, rate limits

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       notification_kind not null,
  title      text not null,
  body       text,
  payload    jsonb not null default '{}'::jsonb,
  sent_at    timestamptz,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, created_at desc);

-- --------------------------------------------------------------------------
-- reviews
-- --------------------------------------------------------------------------
--
-- PRD §12: "Verified-booking reviews". The UNIQUE on booking_id is what makes that true — one
-- review per real, paid booking, and no review without one.

create table reviews (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null unique references bookings(id) on delete cascade,
  experience_id    uuid not null references experiences(id) on delete cascade,
  user_id          uuid not null references profiles(id) on delete cascade,
  rating           smallint not null check (rating between 1 and 5),
  body             text,
  moderation_state moderation_state not null default 'pending',
  moderated_by     uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index reviews_experience_idx
  on reviews (experience_id)
  where moderation_state = 'published';

create trigger reviews_set_updated_at
  before update on reviews
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- ai_conversations
-- --------------------------------------------------------------------------
--
-- PRD §11/§14: "retain only the minimum conversation data needed" and give the user a control to
-- clear history. expires_at exists so retention is a scheduled delete, not a promise.

create table ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  session_id text not null,
  messages   jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_id)
);

create index ai_conversations_expiry_idx on ai_conversations (expires_at);

create trigger ai_conversations_set_updated_at
  before update on ai_conversations
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- audit_logs
-- --------------------------------------------------------------------------
--
-- PRD §4/§7/§16: every privileged admin action and every redemption is audit logged. Append-only
-- for the same reason as voucher_redemptions — a log an admin can edit is not a log.

create table audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid references profiles(id) on delete set null,
  action        text not null,
  entity_type   text not null,
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  reason        text,
  created_at    timestamptz not null default now()
);

create index audit_logs_entity_idx on audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on audit_logs (actor_user_id, created_at desc);

create trigger audit_logs_append_only
  before update or delete on audit_logs
  for each row execute function forbid_mutation();

-- --------------------------------------------------------------------------
-- platform_settings
-- --------------------------------------------------------------------------
--
-- Beyond the PRD's 24 entities, and required by it: PRD §10 says commission and processing-fee
-- treatment "must be configuration-driven rather than hard-coded". Pricing reads its rates here.

create table platform_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

create trigger platform_settings_set_updated_at
  before update on platform_settings
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- rate_limit_events
-- --------------------------------------------------------------------------
--
-- PRD §14: "basic rate limiting for authentication, AI requests, voucher scans and sensitive
-- mutations". Keyed by actor + action; swept by a scheduled delete.

create table rate_limit_events (
  id         bigserial primary key,
  actor_key  text not null,
  action     text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_lookup_idx on rate_limit_events (actor_key, action, created_at desc);
