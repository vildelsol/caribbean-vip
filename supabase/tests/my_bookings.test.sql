-- my_bookings() — a tourist recovers their own paid bookings on a new device.
--
-- Why an RPC rather than a PostgREST select on `bookings`: the owner can always read the booking
-- row (`bookings_self_read`), but the slot and the listing it points at are readable only while
-- they are public (`availability_slots_public_read` requires `status = 'open'`,
-- `experiences_public_read` requires an approved listing under an approved vendor). A tourist whose
-- departure was cancelled, or whose operator was suspended after they paid, would get a booking
-- with no time and no title back. The last section of this file proves that loss under RLS and
-- that my_bookings() does not suffer it.
--
-- my_bookings() is `security definer`, so RLS no longer protects anything it returns: the
-- `user_id = auth.uid()` filter inside it IS the access control. Every denial here is paired with
-- a positive control so a function that returned nothing to anybody could not pass.

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
  tourist_a uuid; tourist_b uuid; staff_a uuid;
  org_a uuid; org_b uuid;
  exp_a uuid; exp_b uuid;
  slot_a uuid; slot_cancelled uuid; slot_b uuid;
  opt_adult uuid; opt_child uuid;
  bk_confirmed uuid; bk_cancelled_slot uuid; bk_suspended uuid;
begin
  insert into auth.users (email) values ('mb-tourist-a@test.local') returning id into tourist_a;
  insert into auth.users (email) values ('mb-tourist-b@test.local') returning id into tourist_b;
  insert into auth.users (email) values ('mb-staff-a@test.local')   returning id into staff_a;

  select id into org_a from vendor_organizations where trading_name = '[Demo] Negril Sunset Cruises';
  select id into org_b from vendor_organizations where trading_name = '[Demo] Portland River Rafting';

  insert into vendor_members (vendor_org_id, user_id, role, can_manage_listings, can_view_payouts)
  values (org_a, staff_a, 'vendor_owner', true, true);

  select e.id into exp_a from experiences e where e.title = 'Catamaran Snorkel & Sunset';
  select e.id into exp_b from experiences e where e.title = 'Rio Grande Bamboo Rafting';

  select s.id into slot_a from availability_slots s
   where s.experience_id = exp_a and s.status = 'open' order by s.starts_at limit 1;
  select s.id into slot_cancelled from availability_slots s
   where s.experience_id = exp_a and s.status = 'open' and s.id <> slot_a
   order by s.starts_at limit 1;
  select s.id into slot_b from availability_slots s
   where s.experience_id = exp_b and s.status = 'open' order by s.starts_at limit 1;

  select o.id into opt_adult from experience_options o where o.experience_id = exp_a and o.kind = 'adult';
  select o.id into opt_child from experience_options o where o.experience_id = exp_a and o.kind = 'child';

  if exp_a is null or exp_b is null or slot_a is null or slot_cancelled is null or slot_b is null
     or opt_adult is null or opt_child is null then
    raise exception 'fixture: seed is missing the listings, slots or options this file depends on';
  end if;

  -- The four statuses a tourist must get back, and the two they must not.
  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference,
                        status, currency, subtotal_minor, tax_minor, service_fee_minor,
                        total_minor, commission_minor, seats, ticket_token)
  values (tourist_a, org_a, exp_a, slot_a, 'VIPJ-MB-CONF', 'confirmed', 'USD',
          17800, 2670, 890, 21360, 2136, 3, 'tok-confirmed')
  returning id into bk_confirmed;

  insert into booking_guests (booking_id, experience_option_id, quantity, unit_amount_minor)
  values (bk_confirmed, opt_adult, 2, 8900),
         (bk_confirmed, opt_child, 1, 5340);

  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference,
                        status, currency, subtotal_minor, total_minor, seats, ticket_token)
  values (tourist_a, org_a, exp_a, slot_a, 'VIPJ-MB-COMP', 'completed', 'USD', 8900, 8900, 1, 'tok-completed'),
         -- A cancelled/refunded row may still hold the token it was issued; my_bookings must not
         -- hand it back (20261021000003). Non-null here so that guard is what is being tested.
         (tourist_a, org_a, exp_a, slot_a, 'VIPJ-MB-CANC', 'cancelled', 'USD', 8900, 8900, 1, 'tok-cancelled'),
         (tourist_a, org_a, exp_a, slot_a, 'VIPJ-MB-REFD', 'refunded',  'USD', 8900, 8900, 1, 'tok-refunded'),
         (tourist_a, org_a, exp_a, slot_a, 'VIPJ-MB-PEND', 'pending_payment', 'USD', 8900, 8900, 1, null),
         (tourist_a, org_a, exp_a, slot_a, 'VIPJ-MB-EXPD', 'expired',   'USD', 8900, 8900, 1, null);

  -- A departure the vendor later cancelled.
  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference,
                        status, currency, subtotal_minor, total_minor, seats, ticket_token)
  values (tourist_a, org_a, exp_a, slot_cancelled, 'VIPJ-MB-SLOT', 'confirmed', 'USD', 8900, 8900, 1,
          'tok-slot-cancelled')
  returning id into bk_cancelled_slot;
  update availability_slots set status = 'cancelled' where id = slot_cancelled;

  -- An operator suspended after the guest paid.
  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference,
                        status, currency, subtotal_minor, total_minor, seats, ticket_token)
  values (tourist_a, org_b, exp_b, slot_b, 'VIPJ-MB-SUSP', 'confirmed', 'USD', 8800, 8800, 1,
          'tok-suspended')
  returning id into bk_suspended;
  update vendor_organizations set status = 'suspended' where id = org_b;

  insert into fixture values
    ('tourist_a', tourist_a), ('tourist_b', tourist_b), ('staff_a', staff_a),
    ('bk_confirmed', bk_confirmed), ('bk_cancelled_slot', bk_cancelled_slot),
    ('bk_suspended', bk_suspended), ('slot_cancelled', slot_cancelled), ('slot_b', slot_b);
end
$$;

-- --------------------------------------------------------------------------
-- The privilege, read from the catalogue
-- --------------------------------------------------------------------------

do $$
begin
  perform test.ok(
    not has_function_privilege('anon', 'my_bookings()', 'execute'),
    'anon holds no EXECUTE on my_bookings'
  );
  perform test.ok(
    has_function_privilege('authenticated', 'my_bookings()', 'execute'),
    'authenticated holds EXECUTE on my_bookings — the tourist app depends on it'
  );
  perform test.ok(
    (select p.prosecdef from pg_proc p where p.oid = 'my_bookings()'::regprocedure),
    'my_bookings is security definer — the reason it can read past slot/listing RLS'
  );
  perform test.ok(
    exists (
      select 1 from pg_proc p, unnest(p.proconfig) c
       where p.oid = 'my_bookings()'::regprocedure and c like 'search_path=%'
    ),
    'my_bookings pins its search_path, as every security definer function must'
  );
end
$$;

-- --------------------------------------------------------------------------
-- The owner sees their own paid bookings (positive control)
-- --------------------------------------------------------------------------

set local role authenticated;

do $$
declare
  n      integer;
  r      record;
  refs   text[];
  guests jsonb;
begin
  perform test.become((select v from fixture where k = 'tourist_a'));

  select array_agg(reference order by reference) into refs from my_bookings();
  perform test.eq(
    refs,
    array['VIPJ-MB-CANC', 'VIPJ-MB-COMP', 'VIPJ-MB-CONF', 'VIPJ-MB-REFD', 'VIPJ-MB-SLOT', 'VIPJ-MB-SUSP'],
    'the owner gets confirmed, completed, cancelled and refunded bookings — and nothing else'
  );

  select count(*) into n from my_bookings() where status in ('pending_payment', 'expired');
  perform test.eq(n, 0, 'pending_payment and expired bookings are excluded');

  select * into r from my_bookings() where id = (select v from fixture where k = 'bk_confirmed');
  perform test.eq(r.ticket_token, 'tok-confirmed', 'the owner gets the ticket token back');
  perform test.eq(r.reference, 'VIPJ-MB-CONF', 'reference');
  perform test.eq(r.status, 'confirmed'::booking_status, 'status');
  perform test.eq(r.seats, 3, 'seats');
  perform test.eq(r.currency, 'USD'::currency_code, 'currency');
  perform test.eq(r.subtotal_minor, 17800::bigint, 'subtotal_minor');
  perform test.eq(r.tax_minor, 2670::bigint, 'tax_minor');
  perform test.eq(r.service_fee_minor, 890::bigint, 'service_fee_minor');
  perform test.eq(r.total_minor, 21360::bigint, 'total_minor');
  perform test.ok(r.created_at is not null, 'created_at');
  perform test.eq(r.experience_title, 'Catamaran Snorkel & Sunset', 'experience title');
  perform test.eq(r.island_code, 'JM', 'island code');
  perform test.ok(r.starts_at is not null, 'slot starts_at');

  guests := r.guests;
  perform test.eq(jsonb_typeof(guests), 'array', 'guests is a jsonb array');
  perform test.eq(jsonb_array_length(guests), 2, 'one guests entry per booking_guests row');
  perform test.ok(
    guests @> '[{"kind": "adult", "quantity": 2, "unit_amount_minor": 8900}]'::jsonb
      and guests @> '[{"kind": "child", "quantity": 1, "unit_amount_minor": 5340}]'::jsonb,
    'guests carry option kind, quantity and unit price'
  );
  perform test.ok(
    (select bool_and(g ? 'label' and jsonb_typeof(g -> 'label') = 'string')
       from jsonb_array_elements(guests) g),
    'guests carry the option label'
  );

  select * into r from my_bookings() where reference = 'VIPJ-MB-CANC';
  perform test.eq(jsonb_array_length(r.guests), 0, 'a booking with no guest rows gets an empty array, not null');
end
$$;

-- --------------------------------------------------------------------------
-- No scannable ticket for a cancelled or refunded booking (20261021000003)
-- --------------------------------------------------------------------------

do $$
declare
  r record;
begin
  -- Control: the token really is on the row, so a null below is my_bookings withholding it.
  set local role service_role;
  perform test.eq(
    (select ticket_token from bookings where reference = 'VIPJ-MB-CANC'),
    'tok-cancelled',
    'control: the cancelled fixture row holds a token'
  );
  perform test.eq(
    (select ticket_token from bookings where reference = 'VIPJ-MB-REFD'),
    'tok-refunded',
    'control: the refunded fixture row holds a token'
  );
  set local role authenticated;
  perform test.become((select v from fixture where k = 'tourist_a'));

  select * into r from my_bookings() where reference = 'VIPJ-MB-CANC';
  perform test.eq(r.status, 'cancelled'::booking_status, 'the cancelled booking is still returned');
  perform test.ok(r.ticket_token is null, 'a cancelled booking returns no ticket token');

  select * into r from my_bookings() where reference = 'VIPJ-MB-REFD';
  perform test.eq(r.status, 'refunded'::booking_status, 'the refunded booking is still returned');
  perform test.ok(r.ticket_token is null, 'a refunded booking returns no ticket token');

  -- Positive controls: confirmed and completed still get theirs.
  select * into r from my_bookings() where reference = 'VIPJ-MB-CONF';
  perform test.eq(r.ticket_token, 'tok-confirmed', 'control: a confirmed booking returns its token');
  select * into r from my_bookings() where reference = 'VIPJ-MB-COMP';
  perform test.eq(r.ticket_token, 'tok-completed', 'control: a completed booking returns its token');
end
$$;

do $$
begin
  perform test.ok(
    exists (
      select 1 from pg_proc p, unnest(p.proconfig) c
       where p.oid = 'my_bookings()'::regprocedure and c = 'search_path=public, pg_temp'
    ),
    'my_bookings pins search_path to public, pg_temp'
  );
end
$$;

-- --------------------------------------------------------------------------
-- Nobody else sees them
-- --------------------------------------------------------------------------

do $$
declare
  n integer;
begin
  perform test.become((select v from fixture where k = 'tourist_b'));
  select count(*) into n from my_bookings();
  perform test.eq(n, 0, 'another tourist sees none of tourist A''s bookings');

  -- The vendor member CAN read the booking through RLS (bookings_self_read lets the fulfilling
  -- vendor in). my_bookings() is "mine", so it must still return nothing — a vendor's own
  -- dashboard is not this function's job.
  perform test.become((select v from fixture where k = 'staff_a'));
  select count(*) into n from bookings where id = (select v from fixture where k = 'bk_confirmed');
  perform test.eq(n, 1, 'control: the vendor member can see the booking through RLS');
  select count(*) into n from my_bookings();
  perform test.eq(n, 0, 'a vendor member of the booking''s vendor gets none of the tourist''s bookings');
end
$$;

-- No identity at all must mean no rows, never all rows.
set local role service_role;

do $$
declare
  n integer;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform test.ok(auth.uid() is null, 'control: there really is no uid');

  select count(*) into n from bookings where reference like 'VIPJ-MB-%';
  perform test.eq(n, 8, 'control: service_role can see all eight fixture bookings directly');

  select count(*) into n from my_bookings();
  perform test.eq(n, 0, 'service_role with no uid gets zero rows from my_bookings, not every row');
end
$$;

-- --------------------------------------------------------------------------
-- anon cannot execute; authenticated can (paired)
-- --------------------------------------------------------------------------

set local role anon;

do $$
begin
  perform test.become_anon();
  perform test.raises($q$ select * from my_bookings() $q$, 'anon cannot execute my_bookings');
end
$$;

set local role authenticated;

do $$
declare
  n integer;
begin
  perform test.become((select v from fixture where k = 'tourist_a'));
  select count(*) into n from my_bookings();
  perform test.eq(n, 6, 'control: authenticated can execute my_bookings');
end
$$;

-- --------------------------------------------------------------------------
-- The reason the RPC exists
-- --------------------------------------------------------------------------

do $$
declare
  r record;
begin
  perform test.become((select v from fixture where k = 'tourist_a'));

  -- Cancelled departure: the booking row is visible, the slot is not.
  select b.reference, s.starts_at, e.title into r
    from bookings b
    left join availability_slots s on s.id = b.availability_slot_id
    left join experiences e on e.id = b.experience_id
   where b.id = (select v from fixture where k = 'bk_cancelled_slot');
  perform test.eq(r.reference, 'VIPJ-MB-SLOT', 'control: the owner can read the booking row itself');
  perform test.ok(r.starts_at is null, 'plain join under RLS loses starts_at for a cancelled slot');

  select * into r from my_bookings() where id = (select v from fixture where k = 'bk_cancelled_slot');
  perform test.ok(r.starts_at is not null, 'my_bookings still returns starts_at for a cancelled slot');
  perform test.eq(r.experience_title, 'Catamaran Snorkel & Sunset', 'and its title');

  -- Suspended vendor: the booking row is visible, the listing and slot are not.
  select b.reference, s.starts_at, e.title into r
    from bookings b
    left join availability_slots s on s.id = b.availability_slot_id
    left join experiences e on e.id = b.experience_id
   where b.id = (select v from fixture where k = 'bk_suspended');
  perform test.eq(r.reference, 'VIPJ-MB-SUSP', 'control: the owner can read the suspended vendor''s booking row');
  perform test.ok(r.title is null, 'plain join under RLS loses the title for a suspended vendor');
  perform test.ok(r.starts_at is null, 'and loses starts_at too');

  select * into r from my_bookings() where id = (select v from fixture where k = 'bk_suspended');
  perform test.eq(r.experience_title, 'Rio Grande Bamboo Rafting', 'my_bookings still returns the title for a suspended vendor');
  perform test.ok(r.starts_at is not null, 'and its starts_at');
  perform test.eq(r.island_code, 'JM', 'and its island code');
end
$$;

rollback;
