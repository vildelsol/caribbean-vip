-- my_bookings(): the signed-in tourist's paid bookings, for recovery on a new device.
--
-- A tourist who adds an email and signs in on another phone has an empty local store. Their
-- bookings are on the server, and the owner can already read the `bookings` rows themselves
-- (`bookings_self_read`). What they cannot reliably read is what the booking points at:
--
--   - `availability_slots_public_read` requires `status = 'open'`, so a departure the vendor
--     cancelled after the guest paid loses its `starts_at`.
--   - `experiences_public_read` requires an approved listing under an approved vendor, so a
--     vendor suspended after the guest paid loses the listing title AND (through the same join
--     in the slot policy) the departure time.
--
-- Those are precisely the bookings a guest most needs to see — to know what was cancelled and
-- what they are owed. Widening the public policies to "or you hold a booking against it" would put
-- a bookings subquery on every catalogue read, so this is a narrow `security definer` read instead.
--
-- Because it is security definer, RLS does not protect what it returns. The `user_id = auth.uid()`
-- predicate below IS the access control: with no uid it compares against null and matches nothing,
-- so an anonymous or service-role call returns zero rows rather than every row.
-- supabase/tests/my_bookings.test.sql asserts each of these.
--
-- `pending_payment` and `expired` are excluded: an unpaid checkout is not a booking the guest has,
-- and showing it would put a ticket-less card in Trips.
--
-- Times are returned as `timestamptz`. The tourist app treats slot times as UTC wall-clock (see
-- supabase/functions/resolve-slot/index.ts), and converts back on its side.

create or replace function my_bookings()
returns table (
  id                uuid,
  reference         text,
  status            booking_status,
  seats             integer,
  currency          currency_code,
  subtotal_minor    bigint,
  tax_minor         bigint,
  service_fee_minor bigint,
  total_minor       bigint,
  created_at        timestamptz,
  ticket_token      text,
  experience_title  text,
  island_code       text,
  starts_at         timestamptz,
  guests            jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.reference,
    b.status,
    b.seats,
    b.currency,
    b.subtotal_minor,
    b.tax_minor,
    b.service_fee_minor,
    b.total_minor,
    b.created_at,
    b.ticket_token,
    e.title,
    i.code,
    s.starts_at,
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'kind',              o.kind,
                   'label',             o.label,
                   'quantity',          g.quantity,
                   'unit_amount_minor', g.unit_amount_minor
                 )
                 order by o.sort_order, g.created_at, g.id
               )
          from booking_guests g
          join experience_options o on o.id = g.experience_option_id
         where g.booking_id = b.id
      ),
      '[]'::jsonb
    )
  from bookings b
  join experiences e        on e.id = b.experience_id
  join islands i            on i.id = e.island_id
  join availability_slots s on s.id = b.availability_slot_id
  where b.user_id = auth.uid()
    and b.status in ('confirmed', 'completed', 'cancelled', 'refunded')
  order by s.starts_at desc, b.created_at desc;
$$;

-- REVOKE FROM PUBLIC, not only from anon: a PUBLIC grant applies to every role, so revoking the
-- named role alone changes nothing. The explicit anon revoke covers Supabase projects whose default
-- privileges grant EXECUTE on new functions to anon directly.
revoke execute on function my_bookings() from public;
revoke execute on function my_bookings() from anon;

grant execute on function my_bookings() to authenticated;
-- Edge Functions run as service_role. With no uid they get zero rows, which the test asserts.
grant execute on function my_bookings() to service_role;

comment on function my_bookings() is
  'The caller''s confirmed/completed/cancelled/refunded bookings with slot time, listing title, island code and guests. Security definer so slot/listing RLS cannot hide them; filters on auth.uid().';
