-- my_bookings(): no scannable ticket for a cancelled or refunded booking.
--
-- 20261021000001 returned `b.ticket_token` for every row it returned, including `cancelled` and
-- `refunded`. A booking row can keep the token it was issued after it is cancelled, so a guest
-- (or anyone holding their phone) could recover a QR for a booking that is no longer valid and
-- present it at the gate. The token is now returned only while the booking is `confirmed` or
-- `completed`; otherwise it is null. Everything else about the function is unchanged: same
-- signature, same rows, same ordering, same grants.
--
-- Hardening: search_path is now `public, pg_temp` (pg_temp last, so a temporary object can never
-- shadow a `public` one inside this security definer function).
--
-- `create or replace` keeps the existing grants; they are restated below anyway so this file
-- alone states the privilege model. supabase/tests/my_bookings.test.sql asserts both the token
-- rule (with confirmed/completed positive controls) and the grants.

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
set search_path = public, pg_temp
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
    case when b.status in ('confirmed', 'completed') then b.ticket_token else null end,
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

revoke execute on function my_bookings() from public;
revoke execute on function my_bookings() from anon;

grant execute on function my_bookings() to authenticated;
grant execute on function my_bookings() to service_role;

comment on function my_bookings() is
  'The caller''s confirmed/completed/cancelled/refunded bookings with slot time, listing title, island code and guests. Ticket token only for confirmed/completed, null otherwise. Security definer so slot/listing RLS cannot hide them; filters on auth.uid().';
