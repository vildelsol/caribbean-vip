-- M1 · Authorization helpers and the two atomicity-critical functions
--
-- AD-03. Capacity reservation and voucher redemption are the two places where a race either sells
-- a seat twice or lets a voucher be used twice. Both take a row lock inside a single transaction.
-- Doing either as read-then-write in application code is a time-of-check/time-of-use bug that
-- only appears under real load — which is exactly when it costs money.

-- --------------------------------------------------------------------------
-- Authorization helpers
-- --------------------------------------------------------------------------
--
-- Used inside RLS policies so authorization lives in one place. STABLE + SECURITY DEFINER: they
-- read `profiles` and `vendor_members`, which are themselves RLS-protected, and a policy that
-- recursively consulted its own table would deadlock or recurse.

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function is_vendor_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from vendor_members
    where vendor_org_id = org_id and user_id = auth.uid()
  );
$$;

create or replace function is_vendor_owner(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from vendor_members
    where vendor_org_id = org_id
      and user_id = auth.uid()
      and role = 'vendor_owner'
  );
$$;

create or replace function can_scan_for_vendor(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from vendor_members
    where vendor_org_id = org_id
      and user_id = auth.uid()
      and can_scan_vouchers
  );
$$;

-- --------------------------------------------------------------------------
-- Privilege guard on profiles
-- --------------------------------------------------------------------------
--
-- The `profiles_self_update` policy has to let a user edit their own row — that is how
-- preferences, consents and the selected island are saved. But `role` lives on the same row, so
-- without this guard "update your own profile" also means "make yourself an admin".
--
-- RLS operates per row, not per column, so the restriction has to be a trigger. Caught by
-- supabase/tests/rls_tenant_isolation.test.sql, which asserts a tourist cannot self-escalate.

create or replace function guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No end-user context means this is a service-role call from an Edge Function, a migration or
  -- a seed script — code that already holds the service key and is inside the trust boundary.
  -- An `anon` request also has no uid, but has no UPDATE policy on profiles, so RLS stops it
  -- before this trigger ever runs.
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from old.role then
    -- PRD §4: managing admins is a super-admin capability.
    if new.role in ('admin', 'super_admin') or old.role in ('admin', 'super_admin') then
      if not is_super_admin() then
        raise exception 'only a super admin may grant or revoke admin roles';
      end if;
    elsif not is_admin() then
      raise exception 'you cannot change your own role';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_privilege_guard
  before update on profiles
  for each row execute function guard_profile_privileges();

-- --------------------------------------------------------------------------
-- reserve_availability — V-03
-- --------------------------------------------------------------------------
--
-- Returns true if `seats` were reserved, false if the slot is full, closed or missing.
--
-- The FOR UPDATE is the whole point: two simultaneous checkouts for the last seat serialize
-- here, so the second one sees the first one's increment and fails cleanly. Without it both read
-- booked_count = capacity - 1 and both succeed.

create or replace function reserve_availability(slot_id uuid, seats integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  slot record;
begin
  if seats is null or seats <= 0 then
    raise exception 'seats must be positive, got %', seats;
  end if;

  select id, capacity, booked_count, status
    into slot
    from availability_slots
   where id = slot_id
     for update;   -- serializes concurrent reservations on this slot

  if not found or slot.status <> 'open' then
    return false;
  end if;

  if slot.booked_count + seats > slot.capacity then
    return false;
  end if;

  update availability_slots
     set booked_count = booked_count + seats
   where id = slot_id;

  return true;
end;
$$;

-- Releasing capacity when a booking is cancelled, or when a pending booking expires because its
-- webhook never arrived. Clamped at zero so a double release cannot drive the count negative.
create or replace function release_availability(slot_id uuid, seats integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update availability_slots
     set booked_count = greatest(booked_count - seats, 0)
   where id = slot_id;
end;
$$;

-- --------------------------------------------------------------------------
-- redeem_voucher — V-04, V-05
-- --------------------------------------------------------------------------
--
-- Takes the sha256 hash of a scanned token (the raw token never reaches the database) and the
-- scanning vendor. Returns a typed result for every branch the scanner UI must render.
--
-- Three properties matter:
--   1. The voucher row is locked, so two simultaneous scans cannot both succeed.
--   2. 'redeemed' is terminal, so a later scan reports already_redeemed WITH the original
--      timestamp and scanner — which is what V-05 requires be shown.
--   3. EVERY branch, including failure, writes a voucher_redemptions row.

create or replace function redeem_voucher(
  p_token_hash    text,
  p_vendor_org_id uuid,
  p_scanner_user_id uuid,
  p_device_meta   jsonb default '{}'::jsonb
)
returns table (
  result               redemption_result,
  voucher_id           uuid,
  redeemed_at          timestamptz,
  original_redeemed_at timestamptz,
  original_scanner_id  uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v            record;
  booking_stat booking_status;
  outcome      redemption_result;
  now_ts       timestamptz := now();
begin
  select *
    into v
    from vouchers
   where token_hash = p_token_hash
     for update;   -- serializes simultaneous scans of the same voucher

  if not found then
    insert into voucher_redemptions (voucher_id, token_hash, scanner_user_id, vendor_org_id, result, device_meta)
    values (null, p_token_hash, p_scanner_user_id, p_vendor_org_id, 'unknown_token', p_device_meta);
    return query select 'unknown_token'::redemption_result, null::uuid, null::timestamptz, null::timestamptz, null::uuid;
    return;
  end if;

  -- Order matters. A redeemed voucher reports already_redeemed even if it has since expired,
  -- because that is the more useful truth for the person holding the scanner.
  if v.state = 'redeemed' then
    outcome := 'already_redeemed';
  elsif v.state = 'cancelled' then
    outcome := 'cancelled';
  elsif v.state = 'invalidated' then
    outcome := 'invalidated';
  elsif v.state = 'expired' or v.valid_until <= now_ts then
    outcome := 'expired';
  elsif v.valid_from > now_ts then
    outcome := 'not_yet_valid';
  elsif v.vendor_org_id <> p_vendor_org_id then
    -- A real voucher presented at the wrong vendor. Recorded, because a pattern of these is a
    -- signal worth investigating (PRD §7).
    outcome := 'wrong_vendor';
  else
    if v.booking_id is not null then
      select status into booking_stat from bookings where id = v.booking_id;
      if booking_stat is distinct from 'confirmed' then
        outcome := 'booking_not_paid';
      end if;
    end if;

    if outcome is null then
      if v.state <> 'active' then
        -- Issued/saved/attached but never activated: not yet usable at the gate.
        outcome := 'not_yet_valid';
      else
        outcome := 'ok';
      end if;
    end if;
  end if;

  if outcome = 'ok' then
    update vouchers
       set state       = 'redeemed',
           redeemed_at = now_ts,
           redeemed_by = p_scanner_user_id
     where id = v.id;
  end if;

  insert into voucher_redemptions (voucher_id, token_hash, scanner_user_id, vendor_org_id, result, device_meta)
  values (v.id, p_token_hash, p_scanner_user_id, p_vendor_org_id, outcome, p_device_meta);

  return query
    select outcome,
           v.id,
           case when outcome = 'ok' then now_ts else null end,
           case when outcome = 'already_redeemed' then v.redeemed_at else null end,
           case when outcome = 'already_redeemed' then v.redeemed_by else null end;
end;
$$;

-- --------------------------------------------------------------------------
-- Audit helper
-- --------------------------------------------------------------------------

create or replace function write_audit_log(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid,
  p_before      jsonb default null,
  p_after       jsonb default null,
  p_reason      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into audit_logs (actor_user_id, action, entity_type, entity_id, before, after, reason)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after, p_reason)
  returning id into new_id;
  return new_id;
end;
$$;

-- Vendor and listing approvals are the decisions that put content in front of tourists, so they
-- are logged by the database rather than relying on every admin code path to remember.
create or replace function audit_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    insert into audit_logs (actor_user_id, action, entity_type, entity_id, before, after, reason)
    values (
      auth.uid(),
      tg_table_name || '.status_changed',
      tg_table_name,
      new.id,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status),
      new.review_notes
    );
  end if;
  return new;
end;
$$;

create trigger vendor_organizations_audit
  after update of status on vendor_organizations
  for each row execute function audit_status_change();

create trigger experiences_audit
  after update of status on experiences
  for each row execute function audit_status_change();
