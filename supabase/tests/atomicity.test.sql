-- reserve_availability and redeem_voucher — V-03, V-04, V-05.
--
-- Sequential branch coverage lives here. The genuinely CONCURRENT cases need two live sessions
-- and are in scripts/db-concurrency-test.sh, because a single psql connection cannot race itself.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;
set local role service_role;

create temporary table fx (k text primary key, v uuid) on commit drop;

do $$
declare
  slot_id uuid;
  org_id  uuid;
  exp_id  uuid;
  scanner uuid;
  guest   uuid;
  booking uuid;
begin
  insert into auth.users (email) values ('scanner@test.local') returning id into scanner;
  insert into auth.users (email) values ('guest@test.local')   returning id into guest;

  select e.id, e.vendor_org_id into exp_id, org_id
    from experiences e where e.title = 'Catamaran Snorkel & Sunset';

  insert into vendor_members (vendor_org_id, user_id, role)
  values (org_id, scanner, 'vendor_staff');

  -- A dedicated slot with capacity 3, so the arithmetic below is unambiguous.
  insert into availability_slots (experience_id, starts_at, ends_at, capacity)
  values (exp_id, now() + interval '400 days', now() + interval '400 days 3 hours', 3)
  returning id into slot_id;

  insert into bookings (
    user_id, vendor_org_id, experience_id, availability_slot_id, reference, status,
    currency, subtotal_minor, total_minor, seats
  ) values (
    guest, org_id, exp_id, slot_id, 'VIPJ-ATOM-0001', 'confirmed', 'USD', 1000, 1000, 1
  ) returning id into booking;

  insert into fx values ('slot', slot_id), ('org', org_id), ('exp', exp_id),
                        ('scanner', scanner), ('guest', guest), ('booking', booking);
end
$$;

-- --------------------------------------------------------------------------
-- reserve_availability — V-03
-- --------------------------------------------------------------------------

do $$
declare
  slot_id uuid := (select v from fx where k = 'slot');
  booked  integer;
begin
  perform test.ok(reserve_availability(slot_id, 2), 'reserving 2 of 3 seats succeeds');
  select booked_count into booked from availability_slots where id = slot_id;
  perform test.eq(booked, 2, 'booked_count is 2');

  perform test.ok(not reserve_availability(slot_id, 2), 'reserving 2 more is refused (only 1 left)');
  select booked_count into booked from availability_slots where id = slot_id;
  perform test.eq(booked, 2, 'a refused reservation leaves booked_count untouched');

  perform test.ok(reserve_availability(slot_id, 1), 'reserving the last seat succeeds');
  perform test.ok(not reserve_availability(slot_id, 1), 'a full slot refuses any further seats');

  select booked_count into booked from availability_slots where id = slot_id;
  perform test.eq(booked, 3, 'the slot is exactly full, never oversold');
end
$$;

-- Release, e.g. on cancellation or when a pending booking expires.
do $$
declare
  slot_id uuid := (select v from fx where k = 'slot');
  booked  integer;
begin
  perform release_availability(slot_id, 1);
  select booked_count into booked from availability_slots where id = slot_id;
  perform test.eq(booked, 2, 'releasing a seat frees capacity');

  -- Clamped at zero, so a double release cannot make the count negative and hand out free seats.
  perform release_availability(slot_id, 99);
  select booked_count into booked from availability_slots where id = slot_id;
  perform test.eq(booked, 0, 'over-releasing clamps at zero rather than going negative');

  perform reserve_availability(slot_id, 3);
end
$$;

do $$
declare
  slot_id uuid := (select v from fx where k = 'slot');
begin
  perform test.raises(
    format('select reserve_availability(%L, 0)', slot_id),
    'reserving zero seats is rejected'
  );
  perform test.raises(
    format('select reserve_availability(%L, -5)', slot_id),
    'reserving a negative number of seats is rejected'
  );
  perform test.ok(
    not reserve_availability(gen_random_uuid(), 1),
    'reserving against an unknown slot returns false rather than raising'
  );
end
$$;

-- A closed slot takes no bookings even with capacity to spare.
do $$
declare
  exp_id  uuid := (select v from fx where k = 'exp');
  closed_slot uuid;
begin
  insert into availability_slots (experience_id, starts_at, ends_at, capacity, status)
  values (exp_id, now() + interval '401 days', now() + interval '401 days 2 hours', 10, 'closed')
  returning id into closed_slot;

  perform test.ok(not reserve_availability(closed_slot, 1), 'a closed slot refuses reservations');
end
$$;

-- --------------------------------------------------------------------------
-- redeem_voucher — every branch the scanner must render
-- --------------------------------------------------------------------------

-- Happy path, then the duplicate scan (V-05).
do $$
declare
  org_id  uuid := (select v from fx where k = 'org');
  scanner uuid := (select v from fx where k = 'scanner');
  guest   uuid := (select v from fx where k = 'guest');
  booking uuid := (select v from fx where k = 'booking');
  r       record;
  first_redeemed_at timestamptz;
  scan_count integer;
begin
  insert into vouchers (token_hash, user_id, booking_id, vendor_org_id, state, valid_until)
  values ('hash-happy', guest, booking, org_id, 'active', now() + interval '2 days');

  select * into r from redeem_voucher('hash-happy', org_id, scanner);
  perform test.eq(r.result, 'ok'::redemption_result, 'V-04: a valid voucher redeems');
  perform test.ok(r.redeemed_at is not null, 'V-04: the redemption timestamp is returned');
  first_redeemed_at := r.redeemed_at;

  -- Second scan.
  select * into r from redeem_voucher('hash-happy', org_id, scanner);
  perform test.eq(r.result, 'already_redeemed'::redemption_result,
    'V-05: a second scan is rejected as already_redeemed');
  perform test.eq(r.original_redeemed_at, first_redeemed_at,
    'V-05: the ORIGINAL redemption timestamp is returned, as the PRD requires');
  perform test.eq(r.original_scanner_id, scanner, 'V-05: the original scanner is returned');

  -- Third scan, to be sure the terminal state holds.
  select * into r from redeem_voucher('hash-happy', org_id, scanner);
  perform test.eq(r.result, 'already_redeemed'::redemption_result, 'a third scan is still rejected');

  -- Every attempt is recorded, failures included.
  select count(*) into scan_count from voucher_redemptions where token_hash = 'hash-happy';
  perform test.eq(scan_count, 3, 'all three scans are recorded, not just the successful one');
end
$$;

-- Failure branches.
do $$
declare
  org_id  uuid := (select v from fx where k = 'org');
  scanner uuid := (select v from fx where k = 'scanner');
  guest   uuid := (select v from fx where k = 'guest');
  exp_id  uuid := (select v from fx where k = 'exp');
  slot_id uuid := (select v from fx where k = 'slot');
  other_org uuid;
  pending_booking uuid;
  r record;
begin
  select id into other_org from vendor_organizations
   where trading_name = '[Demo] Portland River Rafting';

  -- unknown token
  select * into r from redeem_voucher('no-such-hash', org_id, scanner);
  perform test.eq(r.result, 'unknown_token'::redemption_result, 'an unknown token is rejected');

  -- expired
  insert into vouchers (token_hash, user_id, vendor_org_id, promotion_id, state, valid_from, valid_until)
  select 'hash-expired', guest, org_id, p.id, 'active', now() - interval '10 days', now() - interval '1 day'
    from promotions p limit 1;
  select * into r from redeem_voucher('hash-expired', org_id, scanner);
  perform test.eq(r.result, 'expired'::redemption_result, 'an expired voucher is rejected');

  -- not yet valid (future window)
  insert into vouchers (token_hash, user_id, vendor_org_id, promotion_id, state, valid_from, valid_until)
  select 'hash-future', guest, org_id, p.id, 'active', now() + interval '5 days', now() + interval '10 days'
    from promotions p limit 1;
  select * into r from redeem_voucher('hash-future', org_id, scanner);
  perform test.eq(r.result, 'not_yet_valid'::redemption_result, 'a voucher outside its window is rejected');

  -- not yet valid (issued but never activated)
  insert into vouchers (token_hash, user_id, vendor_org_id, promotion_id, state, valid_until)
  select 'hash-issued', guest, org_id, p.id, 'issued', now() + interval '5 days'
    from promotions p limit 1;
  select * into r from redeem_voucher('hash-issued', org_id, scanner);
  perform test.eq(r.result, 'not_yet_valid'::redemption_result, 'an issued-but-inactive voucher is rejected');

  -- wrong vendor
  insert into vouchers (token_hash, user_id, vendor_org_id, promotion_id, state, valid_until)
  select 'hash-wrong-vendor', guest, org_id, p.id, 'active', now() + interval '5 days'
    from promotions p limit 1;
  select * into r from redeem_voucher('hash-wrong-vendor', other_org, scanner);
  perform test.eq(r.result, 'wrong_vendor'::redemption_result, 'a voucher presented at the wrong vendor is rejected');

  -- cancelled
  insert into vouchers (token_hash, user_id, vendor_org_id, promotion_id, state, valid_until)
  select 'hash-cancelled', guest, org_id, p.id, 'cancelled', now() + interval '5 days'
    from promotions p limit 1;
  select * into r from redeem_voucher('hash-cancelled', org_id, scanner);
  perform test.eq(r.result, 'cancelled'::redemption_result, 'a cancelled voucher is rejected');

  -- invalidated
  insert into vouchers (token_hash, user_id, vendor_org_id, promotion_id, state, valid_until)
  select 'hash-invalidated', guest, org_id, p.id, 'invalidated', now() + interval '5 days'
    from promotions p limit 1;
  select * into r from redeem_voucher('hash-invalidated', org_id, scanner);
  perform test.eq(r.result, 'invalidated'::redemption_result, 'an invalidated voucher is rejected');

  -- booking not paid: the voucher is fine, but its booking never reached `confirmed`.
  insert into bookings (
    user_id, vendor_org_id, experience_id, availability_slot_id, reference, status,
    currency, subtotal_minor, total_minor, seats
  ) values (
    guest, org_id, exp_id, slot_id, 'VIPJ-ATOM-0002', 'pending_payment', 'USD', 1000, 1000, 1
  ) returning id into pending_booking;

  insert into vouchers (token_hash, user_id, booking_id, vendor_org_id, state, valid_until)
  values ('hash-unpaid', guest, pending_booking, org_id, 'active', now() + interval '5 days');

  select * into r from redeem_voucher('hash-unpaid', org_id, scanner);
  perform test.eq(r.result, 'booking_not_paid'::redemption_result,
    'a voucher whose booking is not paid is rejected');
end
$$;

-- Failures are recorded too — the trail catches attempted fraud, not just successful entries.
do $$
declare
  n integer;
begin
  select count(*) into n from voucher_redemptions where result <> 'ok';
  perform test.ok(n >= 9, format('every failed scan is recorded (%s failure rows)', n));

  select count(*) into n from voucher_redemptions where token_hash = 'no-such-hash';
  perform test.eq(n, 1, 'even a scan of a completely unknown token is recorded');
end
$$;

-- --------------------------------------------------------------------------
-- State machine enforcement in the database (mirrors packages/types)
-- --------------------------------------------------------------------------

do $$
declare
  org_id uuid := (select v from fx where k = 'org');
  guest  uuid := (select v from fx where k = 'guest');
  vid    uuid;
begin
  insert into vouchers (token_hash, user_id, vendor_org_id, promotion_id, state, valid_until)
  select 'hash-sm', guest, org_id, p.id, 'active', now() + interval '5 days' from promotions p limit 1
  returning id into vid;

  update vouchers set state = 'redeemed', redeemed_at = now() where id = vid;

  perform test.raises(
    format($q$ update vouchers set state = 'active' where id = %L $q$, vid),
    'a redeemed voucher cannot be reactivated — redemption is terminal'
  );
  perform test.raises(
    format($q$ update vouchers set state = 'saved' where id = %L $q$, vid),
    'a redeemed voucher cannot move to any other state'
  );
end
$$;

do $$
declare
  bid uuid := (select v from fx where k = 'booking');
begin
  -- 'confirmed' is reachable only from 'pending_payment' — the Stripe webhook is the sole path.
  perform test.raises(
    format($q$ update bookings set status = 'pending_payment' where id = %L $q$, bid),
    'a confirmed booking cannot revert to pending_payment'
  );

  update bookings set status = 'refunded' where id = bid;
  perform test.raises(
    format($q$ update bookings set status = 'confirmed' where id = %L $q$, bid),
    'a refunded booking cannot be re-confirmed'
  );
end
$$;

rollback;
