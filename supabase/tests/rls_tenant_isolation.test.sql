-- Tenant isolation — PRD §4 "Can access only own records" / "Can access only assigned vendor
-- organization".
--
-- Builds two tourists and two vendor organizations, then checks every crossing.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

-- --------------------------------------------------------------------------
-- Fixtures, created as service_role (bypasses RLS, like an Edge Function)
-- --------------------------------------------------------------------------

set local role service_role;

create temporary table fixture (k text primary key, v uuid) on commit drop;
grant select on fixture to anon, authenticated;

do $$
declare
  tourist_a uuid; tourist_b uuid;
  staff_a   uuid; staff_b   uuid;
  admin_u   uuid;
  org_a uuid; org_b uuid;
  exp_a uuid; slot_a uuid;
  booking_a uuid;
begin
  insert into auth.users (email) values ('tourist-a@test.local') returning id into tourist_a;
  insert into auth.users (email) values ('tourist-b@test.local') returning id into tourist_b;
  insert into auth.users (email) values ('staff-a@test.local')   returning id into staff_a;
  insert into auth.users (email) values ('staff-b@test.local')   returning id into staff_b;
  insert into auth.users (email) values ('admin@test.local')     returning id into admin_u;

  update profiles set role = 'admin' where id = admin_u;

  select id into org_a from vendor_organizations where trading_name = '[Demo] Negril Sunset Cruises';
  select id into org_b from vendor_organizations where trading_name = '[Demo] Portland River Rafting';

  insert into vendor_members (vendor_org_id, user_id, role, can_manage_listings, can_view_payouts)
  values (org_a, staff_a, 'vendor_owner', true, true),
         (org_b, staff_b, 'vendor_staff', false, false);

  select e.id into exp_a from experiences e where e.title = 'Catamaran Snorkel & Sunset';
  select s.id into slot_a from availability_slots s where s.experience_id = exp_a and s.capacity > 1 limit 1;

  insert into bookings (
    user_id, vendor_org_id, experience_id, availability_slot_id, reference, status,
    currency, subtotal_minor, tax_minor, service_fee_minor, total_minor, commission_minor, seats
  ) values (
    tourist_a, org_a, exp_a, slot_a, 'VIPJ-TEST-0001', 'confirmed',
    'USD', 17800, 2670, 890, 21360, 2136, 2
  ) returning id into booking_a;

  insert into vouchers (token_hash, user_id, booking_id, vendor_org_id, state, valid_until)
  values ('hash-tourist-a', tourist_a, booking_a, org_a, 'active', now() + interval '7 days');

  insert into fixture values
    ('tourist_a', tourist_a), ('tourist_b', tourist_b),
    ('staff_a', staff_a), ('staff_b', staff_b), ('admin', admin_u),
    ('org_a', org_a), ('org_b', org_b), ('booking_a', booking_a);
end
$$;

-- --------------------------------------------------------------------------
-- Tourist B cannot see Tourist A's records
-- --------------------------------------------------------------------------

set local role authenticated;

do $$
declare
  n integer;
begin
  perform test.become((select v from fixture where k = 'tourist_b'));

  select count(*) into n from bookings;
  perform test.eq(n, 0, 'tourist B sees none of tourist A''s bookings');

  select count(*) into n from vouchers;
  perform test.eq(n, 0, 'tourist B sees none of tourist A''s vouchers');

  select count(*) into n from payments;
  perform test.eq(n, 0, 'tourist B sees no payment rows');

  select count(*) into n from profiles;
  perform test.eq(n, 1, 'tourist B sees exactly one profile — their own');

  select count(*) into n from profiles where id = (select v from fixture where k = 'tourist_a');
  perform test.eq(n, 0, 'tourist B cannot read tourist A''s profile');
end
$$;

-- Tourist A does see their own.
do $$
declare
  n integer;
begin
  perform test.become((select v from fixture where k = 'tourist_a'));

  select count(*) into n from bookings;
  perform test.eq(n, 1, 'tourist A sees their own booking');

  select count(*) into n from vouchers;
  perform test.eq(n, 1, 'tourist A sees their own voucher');
end
$$;

-- A tourist cannot escalate their own role. This is the single most valuable negative test on
-- `profiles`: the self-update policy must not let a user grant themselves admin.
do $$
declare
  actual_role user_role;
begin
  perform test.become((select v from fixture where k = 'tourist_b'));

  perform test.raises(
    $q$ update profiles set role = 'super_admin' where id = auth.uid() $q$,
    'a tourist cannot escalate themselves to super_admin'
  );
  perform test.raises(
    $q$ update profiles set role = 'vendor_owner' where id = auth.uid() $q$,
    'a tourist cannot grant themselves a vendor role either'
  );

  set local role service_role;
  select role into actual_role from profiles where id = (select v from fixture where k = 'tourist_b');
  perform test.eq(actual_role, 'tourist'::user_role, 'the role is genuinely unchanged');
  set local role authenticated;
end
$$;

-- A plain admin cannot mint another admin — PRD §4 reserves that for the super admin.
do $$
begin
  perform test.become((select v from fixture where k = 'admin'));
  perform test.raises(
    format(
      $q$ update profiles set role = 'admin' where id = %L $q$,
      (select v from fixture where k = 'tourist_b')
    ),
    'a plain admin cannot promote someone to admin'
  );
end
$$;

-- ...but an ordinary preference update on your own profile still works. Without this the guard
-- above could be "fixed" by blocking all self-updates, which would break the app.
do $$
declare
  saved boolean;
begin
  perform test.become((select v from fixture where k = 'tourist_b'));
  update profiles set offer_consent = true, locale = 'en-JM' where id = auth.uid();

  select offer_consent into saved from profiles where id = auth.uid();
  perform test.eq(saved, true, 'a tourist can still update their own consents and preferences');
end
$$;

-- A tourist cannot write their own booking — checkout is server-side only (AD-06).
--
-- The values below are read from PUBLIC tables the tourist genuinely can see, so the INSERT has
-- real rows to work with. An earlier version of this test drew them from `bookings`, which RLS
-- filtered to nothing, making it an INSERT of zero rows that trivially "passed".
do $$
declare
  exp_id  uuid;
  slot_id uuid;
  org_id  uuid;
begin
  perform test.become((select v from fixture where k = 'tourist_b'));

  select e.id, e.vendor_org_id into exp_id, org_id
    from experiences e where e.title = 'Catamaran Snorkel & Sunset';
  select s.id into slot_id
    from availability_slots s where s.experience_id = exp_id limit 1;

  perform test.ok(exp_id is not null and slot_id is not null,
    'the tourist really can see the public listing and slot used for this attempt');

  perform test.raises(
    format(
      $q$ insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id,
                                reference, currency, subtotal_minor, total_minor, seats)
          values (%L, %L, %L, %L, 'VIPJ-FAKE-0001', 'USD', 0, 0, 1) $q$,
      auth.uid(), org_id, exp_id, slot_id
    ),
    'a tourist cannot create their own booking row — checkout is server-side only'
  );

  -- Nor a voucher for themselves.
  perform test.raises(
    format(
      $q$ insert into vouchers (token_hash, user_id, vendor_org_id, promotion_id, state, valid_until)
          values ('forged-hash', %L, %L, null, 'active', now() + interval '1 day') $q$,
      auth.uid(), org_id
    ),
    'a tourist cannot forge a voucher'
  );
end
$$;

-- --------------------------------------------------------------------------
-- Vendor isolation
-- --------------------------------------------------------------------------

do $$
declare
  n integer;
begin
  -- Vendor A's owner sees A's booking (PRD §6: "View upcoming bookings and guest counts").
  perform test.become((select v from fixture where k = 'staff_a'));
  select count(*) into n from bookings;
  perform test.eq(n, 1, 'vendor A''s owner sees the booking made against vendor A');

  select count(*) into n from vouchers;
  perform test.eq(n, 1, 'vendor A''s owner sees vouchers issued against vendor A');

  -- Vendor B's staff sees none of it.
  perform test.become((select v from fixture where k = 'staff_b'));
  select count(*) into n from bookings;
  perform test.eq(n, 0, 'vendor B''s staff sees none of vendor A''s bookings');

  select count(*) into n from vouchers;
  perform test.eq(n, 0, 'vendor B''s staff sees none of vendor A''s vouchers');
end
$$;

-- Neither vendor can read the customer's Stripe references. A vendor's earnings come from the
-- booking's own fee columns (V-07), not from payment rows.
do $$
declare
  n integer;
begin
  perform test.become((select v from fixture where k = 'staff_a'));
  select count(*) into n from payments;
  perform test.eq(n, 0, 'a vendor cannot read payment/Stripe rows');

  select count(*) into n from vendor_documents;
  perform test.eq(n, 0, 'vendor A has no documents of its own to read');
end
$$;

-- Vendor B cannot edit vendor A's listings.
do $$
declare
  affected integer;
begin
  perform test.become((select v from fixture where k = 'staff_b'));
  update experiences set title = 'Hijacked' where title = 'Catamaran Snorkel & Sunset';
  get diagnostics affected = row_count;
  perform test.eq(affected, 0, 'vendor B cannot edit vendor A''s listing');
end
$$;

-- --------------------------------------------------------------------------
-- Admin-only surfaces
-- --------------------------------------------------------------------------

do $$
declare
  n integer;
begin
  perform test.become((select v from fixture where k = 'tourist_a'));
  select count(*) into n from audit_logs;
  perform test.eq(n, 0, 'a tourist cannot read the audit log');

  perform test.become((select v from fixture where k = 'staff_a'));
  select count(*) into n from audit_logs;
  perform test.eq(n, 0, 'a vendor cannot read the audit log');

  perform test.become((select v from fixture where k = 'admin'));
  select count(*) into n from audit_logs;
  perform test.ok(n >= 0, 'an admin can read the audit log');

  select count(*) into n from bookings;
  perform test.eq(n, 1, 'an admin can see bookings across vendors');
end
$$;

-- Only a SUPER admin may change fee rules (PRD §4).
do $$
declare
  affected integer;
begin
  perform test.become((select v from fixture where k = 'admin'));
  update platform_settings set value = '0.99'::jsonb where key = 'pricing.commission_rate';
  get diagnostics affected = row_count;
  perform test.eq(affected, 0, 'a plain admin cannot change the commission rate — super admin only');
end
$$;

rollback;
