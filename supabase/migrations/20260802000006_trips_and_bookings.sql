-- M1 · Saved items, trips, bookings, guests and payments
--
-- PRD §10. The booking fee columns are stored, not recomputed: V-07 requires gross, platform fee
-- and net to "reconcile to booking/payment records", which is only true if the figures are the
-- ones that were actually charged rather than today's rates applied to yesterday's booking.

create table saved_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  item_type  saved_item_type not null,
  item_id    uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);

create index saved_items_user_idx on saved_items (user_id);

-- --------------------------------------------------------------------------
-- trips
-- --------------------------------------------------------------------------

create table trips (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  island_id      uuid references islands(id) on delete set null,
  destination_id uuid references destinations(id) on delete set null,
  title          text,
  starts_on      date,
  ends_on        date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint trips_date_order check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index trips_user_idx on trips (user_id);

create trigger trips_set_updated_at
  before update on trips
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- bookings
-- --------------------------------------------------------------------------

create table bookings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references profiles(id) on delete restrict,
  vendor_org_id       uuid not null references vendor_organizations(id) on delete restrict,
  experience_id       uuid not null references experiences(id) on delete restrict,
  availability_slot_id uuid not null references availability_slots(id) on delete restrict,
  promotion_id        uuid references promotions(id) on delete set null,

  -- Human-readable, e.g. VIPJ-7M24-83A1. For support and printed confirmations. Deliberately
  -- NOT a redemption credential (AD-04) — it is short, guessable and spoken aloud in public.
  reference           text not null unique,

  status              booking_status not null default 'pending_payment',

  -- All amounts are minor units in `currency`. Itemized per PRD §10.
  currency            currency_code not null,
  subtotal_minor      bigint not null check (subtotal_minor >= 0),
  discount_minor      bigint not null default 0 check (discount_minor >= 0),
  tax_minor           bigint not null default 0 check (tax_minor >= 0),
  service_fee_minor   bigint not null default 0 check (service_fee_minor >= 0),
  total_minor         bigint not null check (total_minor >= 0),
  -- Platform's cut, taken from the vendor's share — already inside total_minor, not added to it.
  commission_minor    bigint not null default 0 check (commission_minor >= 0),

  seats               integer not null check (seats > 0),

  -- PRD §10: "Use idempotency keys for booking/payment creation." A double-tapped checkout
  -- returns the existing booking instead of creating a second one.
  idempotency_key     text unique,

  cancelled_at        timestamptz,
  cancellation_reason text,
  completed_at        timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint bookings_total_is_consistent
    check (total_minor = subtotal_minor - discount_minor + tax_minor + service_fee_minor),
  constraint bookings_discount_within_subtotal check (discount_minor <= subtotal_minor)
);

create index bookings_user_idx on bookings (user_id, created_at desc);
create index bookings_vendor_idx on bookings (vendor_org_id, created_at desc);
create index bookings_slot_idx on bookings (availability_slot_id);

create trigger bookings_set_updated_at
  before update on bookings
  for each row execute function set_updated_at();

-- Mirrors canTransitionBooking() in packages/types/src/states.ts. Enforcing it here as well means
-- a booking cannot be dragged into an impossible state by an Edge Function bug or a manual query.
create or replace function assert_booking_transition()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if not (
    (old.status = 'pending_payment' and new.status in ('confirmed', 'cancelled', 'expired'))
    or (old.status = 'confirmed' and new.status in ('completed', 'cancelled', 'refunded'))
    or (old.status = 'cancelled' and new.status = 'refunded')
    or (old.status = 'completed' and new.status = 'refunded')
  ) then
    raise exception 'illegal booking transition % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

create trigger bookings_transition_check
  before update of status on bookings
  for each row execute function assert_booking_transition();

-- --------------------------------------------------------------------------
-- booking_guests
-- --------------------------------------------------------------------------

create table booking_guests (
  id                   uuid primary key default gen_random_uuid(),
  booking_id           uuid not null references bookings(id) on delete cascade,
  experience_option_id uuid not null references experience_options(id) on delete restrict,
  quantity             integer not null check (quantity > 0),
  unit_amount_minor    bigint not null check (unit_amount_minor >= 0),
  guest_name           text,
  created_at           timestamptz not null default now()
);

create index booking_guests_booking_idx on booking_guests (booking_id);

-- --------------------------------------------------------------------------
-- payments
-- --------------------------------------------------------------------------
--
-- PRD §10: "Store Stripe identifiers, status and amount; never store full card numbers or
-- security codes." There is deliberately no column that could hold a PAN or CVC.

create table payments (
  id                         uuid primary key default gen_random_uuid(),
  booking_id                 uuid not null references bookings(id) on delete cascade,
  provider                   text not null default 'stripe',

  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text unique,

  -- T-05, "exactly once": the unique constraint IS the idempotency guarantee. A replayed webhook
  -- collides here and becomes a no-op, rather than relying on handler code remembering to check.
  stripe_event_id            text unique,

  status                     payment_status not null default 'pending',
  currency                   currency_code not null,
  amount_minor               bigint not null check (amount_minor >= 0),
  refunded_minor             bigint not null default 0 check (refunded_minor >= 0),

  failure_code               text,
  failure_message            text,
  paid_at                    timestamptz,

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  constraint payments_refund_within_amount check (refunded_minor <= amount_minor)
);

create index payments_booking_idx on payments (booking_id);

create trigger payments_set_updated_at
  before update on payments
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- trip_items
-- --------------------------------------------------------------------------

create table trip_items (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references trips(id) on delete cascade,
  kind          trip_item_kind not null,
  booking_id    uuid references bookings(id) on delete cascade,
  experience_id uuid references experiences(id) on delete cascade,
  note          text,
  scheduled_at  timestamptz,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),

  constraint trip_items_kind_has_target check (
    (kind = 'booking' and booking_id is not null)
    or (kind = 'saved' and experience_id is not null)
    or (kind = 'itinerary_note' and note is not null)
  )
);

create index trip_items_trip_idx on trip_items (trip_id, sort_order);
