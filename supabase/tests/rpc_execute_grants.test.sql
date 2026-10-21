-- The availability RPCs are not part of the public API.
--
-- reserve_availability() and release_availability() are `security definer`, so they write
-- availability_slots with RLS bypassed. Before 20261019000002 both were executable by PUBLIC,
-- which includes `anon` — so anyone holding the anon key that ships in the browser bundle could
-- set booked_count on any slot without an account. The proof was a slot going from 0 booked to
-- 12 booked with no bookings behind it.
--
-- RLS does not help here and a policy test would not catch this. `security definer` is precisely
-- the mechanism that bypasses RLS; the only thing standing between an anonymous caller and the
-- table is the EXECUTE privilege. So this file tests the privilege.
--
-- The trap it guards: revoking from `anon, authenticated` alone is a no-op while PUBLIC still
-- holds the grant, because a PUBLIC grant applies to every role. That reads as a fix and changes
-- nothing. Each denial below is therefore paired with a positive control proving the function
-- still works for the service role, so a passing file cannot mean "nobody can call it".

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table probe (k text primary key, v uuid) on commit drop;
grant select on probe to anon, authenticated;

do $$
declare slot uuid;
begin
  select s.id into slot
    from availability_slots s
   where s.status = 'open' and s.capacity - s.booked_count >= 2
   limit 1;

  if slot is null then
    raise exception 'fixture: no open slot with spare capacity in the seed';
  end if;

  insert into probe values ('slot', slot);
end
$$;

-- --------------------------------------------------------------------------
-- The privilege itself, read from the catalogue
-- --------------------------------------------------------------------------

do $$
declare
  r text;
  f text;
begin
  foreach f in array array['reserve_availability', 'release_availability'] loop
    foreach r in array array['anon', 'authenticated'] loop
      perform test.ok(
        not has_function_privilege(r, f || '(uuid,integer)', 'execute'),
        r || ' holds no EXECUTE on ' || f
      );
    end loop;

    perform test.ok(
      has_function_privilege('service_role', f || '(uuid,integer)', 'execute'),
      'service_role still holds EXECUTE on ' || f || ' — the Edge Functions depend on it'
    );
  end loop;
end
$$;

-- --------------------------------------------------------------------------
-- The behaviour, because a privilege is only as good as the refusal it causes
-- --------------------------------------------------------------------------

set local role anon;

do $$
declare
  slot uuid := (select v from probe where k = 'slot');
begin
  perform test.become_anon();

  perform test.raises(
    format($q$ select reserve_availability(%L, 1) $q$, slot),
    'anon cannot reserve a seat'
  );
  perform test.raises(
    format($q$ select release_availability(%L, 1) $q$, slot),
    'anon cannot release a seat'
  );
end
$$;

set local role authenticated;

do $$
declare
  slot uuid := (select v from probe where k = 'slot');
begin
  perform test.raises(
    format($q$ select reserve_availability(%L, 1) $q$, slot),
    'a signed-in user cannot reserve a seat directly either'
  );
  perform test.raises(
    format($q$ select release_availability(%L, 1) $q$, slot),
    'a signed-in user cannot release a seat directly either'
  );
end
$$;

-- --------------------------------------------------------------------------
-- Positive control: the booking path still works
-- --------------------------------------------------------------------------
--
-- Without this, every assertion above would also pass against a function that had been dropped,
-- renamed or broken. supabase/functions/_shared/supabaseStore.ts calls both of these on the
-- service role, so this is the path that must keep working.

set local role service_role;

do $$
declare
  slot    uuid := (select v from probe where k = 'slot');
  before  integer;
  during  integer;
  after   integer;
begin
  select booked_count into before from availability_slots where id = slot;

  perform test.ok(reserve_availability(slot, 1), 'service_role reserves a seat');
  select booked_count into during from availability_slots where id = slot;
  perform test.eq(during, before + 1, 'the reservation really moved booked_count');

  perform release_availability(slot, 1);
  select booked_count into after from availability_slots where id = slot;
  perform test.eq(after, before, 'the release put the seat back');
end
$$;

-- --------------------------------------------------------------------------
-- my_bookings(): signed-in callers only
-- --------------------------------------------------------------------------
--
-- Unlike the two above, this one IS meant to be called from the browser — by a signed-in
-- tourist. It is `security definer` and filters on auth.uid() itself, so anon gets nothing from
-- it either way; the grant is narrowed anyway so the anon key cannot reach a function that reads
-- past RLS at all. Same PUBLIC trap: revoking only `anon` leaves the PUBLIC grant in force.
-- Ownership and filtering are covered in my_bookings.test.sql.

do $$
begin
  perform test.ok(
    not has_function_privilege('anon', 'my_bookings()', 'execute'),
    'anon holds no EXECUTE on my_bookings'
  );
  perform test.ok(
    has_function_privilege('authenticated', 'my_bookings()', 'execute'),
    'authenticated still holds EXECUTE on my_bookings — the tourist app depends on it'
  );
end
$$;

set local role anon;

do $$
begin
  perform test.become_anon();
  perform test.raises($q$ select * from my_bookings() $q$, 'anon cannot call my_bookings');
end
$$;

set local role authenticated;

do $$
declare
  u uuid := gen_random_uuid();
  n integer;
begin
  -- A uid with no bookings: the call must succeed and return nothing, rather than raise.
  perform test.become(u);
  select count(*) into n from my_bookings();
  perform test.eq(n, 0, 'control: a signed-in caller can call my_bookings');
end
$$;

rollback;
