-- bookings.ticket_token is not readable by clients.
--
-- The token is the credential behind the QR at the gate. RLS is per-row, so `bookings_self_read`
-- (owner, any member of the vendor, admin) handed out every column of every row it allowed:
--   - vendor staff WITHOUT can_scan_vouchers could read the ticket token of every booking for their
--     vendor, which defeats the scan permission;
--   - a guest could read the token of their own cancelled booking straight from the table,
--     bypassing the status rule in my_bookings().
-- The only privilege that works per column is a column privilege, and a column revoke does nothing
-- while a table-level SELECT exists, so the migration revokes the table grant and re-grants every
-- column except ticket_token.
--
-- THE TRAP THIS FILE GUARDS: after that migration a column added to bookings later is NOT readable
-- by clients until someone grants it. The last section fails when a column has no decision, so
-- the author is told to make one instead of shipping a client that gets "permission denied".
--
-- Each denial is paired with a positive control, so a table nobody can read could not pass.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table fixture (k text primary key, v uuid) on commit drop;
grant select on fixture to anon, authenticated;

do $$
declare
  guest uuid; staff uuid; stranger uuid;
  org uuid; exp uuid; slot uuid; opt uuid;
  bk uuid; bk_cancelled uuid;
begin
  insert into auth.users (is_anonymous) values (true) returning id into guest;
  insert into auth.users (is_anonymous) values (true) returning id into stranger;
  insert into auth.users (email, email_confirmed_at) values ('cp-staff@test.local', now()) returning id into staff;

  select id into org from vendor_organizations where trading_name = '[Demo] Negril Sunset Cruises';
  select e.id into exp from experiences e where e.title = 'Catamaran Snorkel & Sunset';
  select s.id into slot from availability_slots s where s.experience_id = exp and s.status = 'open' order by s.starts_at limit 1;
  select o.id into opt from experience_options o where o.experience_id = exp and o.kind = 'adult';
  if org is null or exp is null or slot is null or opt is null then
    raise exception 'fixture: seed is missing the listing, slot or option this file depends on';
  end if;

  -- Staff who may NOT scan: the case the scan permission exists to cover.
  insert into vendor_members (vendor_org_id, user_id, role, can_manage_listings, can_view_payouts, can_scan_vouchers)
  values (org, staff, 'vendor_staff', false, false, false);

  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference, status, currency,
                        subtotal_minor, total_minor, seats, ticket_token)
  values (guest, org, exp, slot, 'VIPJ-CP-OK', 'confirmed', 'USD', 8900, 8900, 1, 'SECRET-CONFIRMED') returning id into bk;
  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference, status, currency,
                        subtotal_minor, total_minor, seats, ticket_token)
  values (guest, org, exp, slot, 'VIPJ-CP-CANC', 'cancelled', 'USD', 8900, 8900, 1, 'SECRET-CANCELLED') returning id into bk_cancelled;

  insert into booking_guests (booking_id, experience_option_id, quantity, unit_amount_minor) values (bk, opt, 1, 8900);
  insert into payments (booking_id, currency, amount_minor) values (bk, 'USD', 8900);

  insert into fixture values ('guest', guest), ('staff', staff), ('stranger', stranger), ('bk', bk);
end
$$;

-- --------------------------------------------------------------------------
-- The privilege, read from the catalogue
-- --------------------------------------------------------------------------

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    perform test.ok(not has_column_privilege(r, 'bookings', 'ticket_token', 'select'),
      r || ' cannot read bookings.ticket_token');
    perform test.ok(not has_table_privilege(r, 'bookings', 'select'),
      r || ' holds no table-wide SELECT on bookings (a table grant would override the column revoke)');
    perform test.ok(has_column_privilege(r, 'bookings', 'reference', 'select'),
      r || ' can still read the other columns (positive control)');
  end loop;
  perform test.ok(has_table_privilege('service_role', 'bookings', 'select') and has_column_privilege('service_role', 'bookings', 'ticket_token', 'select'),
    'service_role still reads everything, including ticket_token — the Edge Functions depend on it');
end
$$;

-- --------------------------------------------------------------------------
-- What each kind of caller actually experiences
-- --------------------------------------------------------------------------

set local role authenticated;
select test.become((select v from fixture where k = 'staff'));

do $$
begin
  perform test.eq((select count(*)::int from bookings where reference like 'VIPJ-CP-%'), 2,
    'control: vendor staff still see their vendor''s booking rows');
  perform test.raises('select ticket_token from bookings', 'vendor staff without scan permission cannot read ticket_token');
  perform test.raises('select * from bookings', 'and `select *` is refused for them too — the whole statement, not just that column');
end
$$;

select test.become((select v from fixture where k = 'guest'));

do $$
begin
  perform test.eq((select count(*)::int from bookings where reference like 'VIPJ-CP-%'), 2,
    'control: the guest still reads their own booking rows');
  perform test.raises('select ticket_token from bookings where reference = ''VIPJ-CP-CANC''',
    'the guest cannot read the token of their own CANCELLED booking from the table');
  perform test.raises('select ticket_token from bookings where reference = ''VIPJ-CP-OK''',
    'nor of a confirmed one — my_bookings() is the only path, and it applies the status rule');

  -- The path that does work, so "nobody can read it" cannot pass.
  perform test.eq((select ticket_token from my_bookings() where reference = 'VIPJ-CP-OK'), 'SECRET-CONFIRMED',
    'control: my_bookings() still returns a confirmed booking''s token to its owner');
  perform test.ok((select ticket_token from my_bookings() where reference = 'VIPJ-CP-CANC') is null,
    'and still withholds a cancelled booking''s token');

  -- Policies on other tables read bookings as the CALLER; they must keep working on the granted columns.
  perform test.eq((select count(*)::int from booking_guests), 1, 'control: booking_guests_read (reads bookings inside its policy) still works');
  perform test.eq((select count(*)::int from payments), 1, 'control: payments_self_read (reads bookings inside its policy) still works');
end
$$;

select test.become((select v from fixture where k = 'stranger'));

do $$
begin
  perform test.eq((select count(*)::int from bookings where reference like 'VIPJ-CP-%'), 0, 'control: RLS still hides the booking rows from another guest');
  perform test.eq((select count(*)::int from booking_guests), 0, 'and booking_guests');
  perform test.eq((select count(*)::int from payments), 0, 'and payments');
end
$$;

set local role anon;
select test.become_anon();
select test.raises('select ticket_token from bookings', 'the anon key cannot read ticket_token');

-- --------------------------------------------------------------------------
-- The trap: every column must have an explicit decision
-- --------------------------------------------------------------------------

set local role service_role;

do $$
declare
  -- Columns deliberately withheld from clients. Adding a column here is a security decision.
  withheld constant text[] := array['ticket_token'];
  col text;
begin
  for col in select column_name from information_schema.columns where table_schema = 'public' and table_name = 'bookings' loop
    perform test.ok(
      col = any(withheld) or has_column_privilege('authenticated', 'bookings', col, 'select'),
      format('bookings.%s has a decision: either clients can read it or it is listed as withheld. '
             'If you just added this column, grant it: grant select (%s) on bookings to anon, authenticated;', col, col)
    );
  end loop;
end
$$;

rollback;
