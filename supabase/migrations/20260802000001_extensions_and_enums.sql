-- M1 · Extensions and domain enums
--
-- The enums mirror the vocabulary in packages/types/src/domain.ts and states.ts. Keeping them as
-- real Postgres types (rather than text + CHECK) means an invalid state cannot be written by any
-- client, any Edge Function, or a hand-typed psql session.

create extension if not exists "pgcrypto"; -- gen_random_uuid(), digest()

-- --------------------------------------------------------------------------
-- Roles and lifecycle
-- --------------------------------------------------------------------------

-- PRD §4
create type user_role as enum (
  'tourist',
  'vendor_owner',
  'vendor_staff',
  'admin',
  'super_admin'
);

-- V-02: only 'approved' is ever public.
create type vendor_status as enum (
  'draft',
  'pending_review',
  'approved',
  'changes_requested',
  'rejected',
  'suspended'
);

create type listing_status as enum (
  'draft',
  'pending_review',
  'approved',
  'unpublished',
  'rejected'
);

create type approval_state as enum ('pending', 'approved', 'rejected', 'disabled');

create type document_review_state as enum ('pending', 'accepted', 'rejected');

-- --------------------------------------------------------------------------
-- Catalogue
-- --------------------------------------------------------------------------

-- PRD §16 demo-content categories.
create type experience_category as enum (
  'waterfalls',
  'beaches',
  'adventure',
  'food',
  'culture',
  'nightlife',
  'wellness',
  'transportation',
  'shopping',
  'family',
  'day_trips',
  'water_sports'
);

create type experience_option_kind as enum (
  'adult',
  'child',
  'infant',
  'addon',
  'ticket_type'
);

create type slot_status as enum ('open', 'closed', 'cancelled');

-- --------------------------------------------------------------------------
-- Money and commerce
-- --------------------------------------------------------------------------

-- OD-09: display currency may vary by island; settlement is USD at MVP.
create type currency_code as enum ('USD', 'JMD', 'KYD', 'BBD');

create type booking_status as enum (
  'pending_payment',
  'confirmed',
  'cancelled',
  'completed',
  'refunded',
  'expired'
);

create type payment_status as enum (
  'pending',
  'paid',
  'failed',
  'refunded',
  'partially_refunded'
);

create type promotion_value_kind as enum ('percentage', 'fixed', 'in_kind');

-- --------------------------------------------------------------------------
-- Vouchers — PRD §9 fixes these eight states exactly.
-- --------------------------------------------------------------------------

create type voucher_state as enum (
  'issued',
  'saved',
  'attached_to_booking',
  'active',
  'redeemed',
  'expired',
  'cancelled',
  'invalidated'
);

-- Every branch the scanner UI must render (V-04, V-05). Failures are recorded too, so the audit
-- trail captures attempted fraud, not just successful entries.
create type redemption_result as enum (
  'ok',
  'already_redeemed',
  'expired',
  'not_yet_valid',
  'wrong_vendor',
  'booking_not_paid',
  'cancelled',
  'invalidated',
  'unknown_token',
  'bad_signature'
);

-- --------------------------------------------------------------------------
-- Misc
-- --------------------------------------------------------------------------

create type trip_item_kind as enum ('booking', 'saved', 'itinerary_note');

create type saved_item_type as enum ('experience', 'promotion');

create type moderation_state as enum ('pending', 'published', 'rejected');

create type notification_kind as enum (
  'booking_confirmed',
  'booking_cancelled',
  'nearby_offer',
  'voucher_expiring',
  'vendor_status_changed',
  'listing_status_changed'
);

-- --------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest without trusting the caller.
-- --------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
