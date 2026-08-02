-- M1 · Vouchers and redemption events
--
-- AD-04 / PRD §9. The table stores sha256(token) and never the token itself, so reading the
-- database — as an admin, via a backup, or through a leak — does not let anyone mint a working QR.

create table vouchers (
  id            uuid primary key default gen_random_uuid(),

  -- base64url sha256 of the signed token. Unique so a scan is a single indexed lookup.
  token_hash    text not null unique,

  user_id       uuid references profiles(id) on delete set null,
  booking_id    uuid references bookings(id) on delete cascade,
  promotion_id  uuid references promotions(id) on delete set null,

  -- Denormalized from the booking/promotion so redeem_voucher() can check vendor match without
  -- a join, and so a voucher survives its promotion being deleted.
  vendor_org_id uuid not null references vendor_organizations(id) on delete restrict,

  state         voucher_state not null default 'issued',

  valid_from    timestamptz not null default now(),
  valid_until   timestamptz not null,

  redeemed_at   timestamptz,
  redeemed_by   uuid references profiles(id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint vouchers_validity_order check (valid_until > valid_from),
  -- A voucher must be for something: a booking, an offer, or both (Journey B step 6 produces a
  -- QR carrying both references).
  constraint vouchers_has_subject check (booking_id is not null or promotion_id is not null),
  -- If it is redeemed, we must know when. V-05 requires showing the original timestamp.
  constraint vouchers_redeemed_has_timestamp
    check ((state = 'redeemed') = (redeemed_at is not null))
);

create index vouchers_user_idx on vouchers (user_id, state);
create index vouchers_booking_idx on vouchers (booking_id);
create index vouchers_vendor_idx on vouchers (vendor_org_id, state);

create trigger vouchers_set_updated_at
  before update on vouchers
  for each row execute function set_updated_at();

-- Mirrors canTransitionVoucher() in packages/types/src/states.ts. The critical clause is that
-- 'redeemed' has no outgoing transition — redemption is final (V-05), enforced in the database
-- and not only in application code.
create or replace function assert_voucher_transition()
returns trigger
language plpgsql
as $$
begin
  if old.state = new.state then
    return new;
  end if;

  if old.state in ('redeemed', 'expired', 'cancelled', 'invalidated') then
    raise exception 'voucher state % is terminal; cannot move to %', old.state, new.state;
  end if;

  if new.state = 'redeemed' and old.state <> 'active' then
    raise exception 'only an active voucher can be redeemed (was %)', old.state;
  end if;

  if not (
    (old.state = 'issued' and new.state in ('saved', 'attached_to_booking', 'active', 'expired', 'cancelled', 'invalidated'))
    or (old.state = 'saved' and new.state in ('attached_to_booking', 'active', 'expired', 'cancelled', 'invalidated'))
    or (old.state = 'attached_to_booking' and new.state in ('active', 'expired', 'cancelled', 'invalidated'))
    or (old.state = 'active' and new.state in ('redeemed', 'expired', 'cancelled', 'invalidated'))
  ) then
    raise exception 'illegal voucher transition % -> %', old.state, new.state;
  end if;

  return new;
end;
$$;

create trigger vouchers_transition_check
  before update of state on vouchers
  for each row execute function assert_voucher_transition();

-- --------------------------------------------------------------------------
-- voucher_redemptions
-- --------------------------------------------------------------------------
--
-- PRD §9: "Record scanner user, vendor, timestamp, device/session metadata and result."
--
-- Immutable by design: EVERY scan attempt is recorded, including failures, so the trail shows
-- attempted fraud and not just successful entries. The append-only guarantee is enforced by RLS
-- (no update/delete policy for any role) and by the trigger below, which also blocks the table
-- owner and any SECURITY DEFINER function.

create table voucher_redemptions (
  id             uuid primary key default gen_random_uuid(),
  voucher_id     uuid references vouchers(id) on delete set null,
  -- Kept even when the voucher is unknown, so a stream of bogus scans is still attributable.
  token_hash     text,
  scanner_user_id uuid references profiles(id) on delete set null,
  vendor_org_id  uuid references vendor_organizations(id) on delete set null,
  result         redemption_result not null,
  device_meta    jsonb not null default '{}'::jsonb,
  scanned_at     timestamptz not null default now()
);

create index voucher_redemptions_voucher_idx on voucher_redemptions (voucher_id, scanned_at desc);
create index voucher_redemptions_vendor_idx on voucher_redemptions (vendor_org_id, scanned_at desc);
-- Supports the admin's "investigate suspicious redemption patterns" view (PRD §7).
create index voucher_redemptions_failures_idx
  on voucher_redemptions (scanned_at desc)
  where result <> 'ok';

create or replace function forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create trigger voucher_redemptions_append_only
  before update or delete on voucher_redemptions
  for each row execute function forbid_mutation();
