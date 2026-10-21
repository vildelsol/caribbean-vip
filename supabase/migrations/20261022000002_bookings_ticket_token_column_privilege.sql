-- Clients cannot read bookings.ticket_token.
--
-- The token is the credential behind the QR at the gate. `bookings_self_read` lets the owner, ANY
-- member of the vendor, and admins read a booking row, and RLS is per-row, so each of them also got
-- the token: vendor staff without can_scan_vouchers could read every token for their vendor, and a
-- guest could read the token of their own cancelled booking straight from the table, bypassing the
-- status rule in my_bookings(). Nothing a client does needs the column: my_bookings() (security
-- definer) returns it to the owner when the booking is confirmed or completed, and the Edge
-- Functions read it as service_role.
--
-- A column privilege is the only per-column control Postgres offers. It cannot be applied as a
-- plain `revoke select (ticket_token)`: while a table-level SELECT exists, that revoke does
-- nothing. So the table-level grant is revoked and every OTHER column is granted back.
--
-- !! THE TRAP: columns added to bookings after this migration are NOT readable by anon or
-- !! authenticated until they are granted. A new migration that adds a column must also say:
-- !!
-- !!     grant select (new_column) on bookings to anon, authenticated;
-- !!
-- !! or withhold it on purpose by adding it to `withheld` in supabase/tests/
-- !! bookings_column_privileges.test.sql. That test fails until one of the two is done. Forgetting
-- !! shows up as "permission denied for table bookings" the first time a client selects `*` or the
-- !! new column; the test turns it into a failure at review time instead.
-- !!
-- !! `select *` from a client is now refused outright (it includes ticket_token). Name the columns.
--
-- Row-level security is unchanged and still decides WHICH rows. Policies on other tables that read
-- bookings as the caller (booking_guests_read, payments_self_read, reviews_self_write) use only
-- id, user_id, vendor_org_id and status, all of which stay readable.

revoke select on bookings from anon, authenticated;

grant select (
  id,
  user_id,
  vendor_org_id,
  experience_id,
  availability_slot_id,
  promotion_id,
  reference,
  status,
  currency,
  subtotal_minor,
  discount_minor,
  tax_minor,
  service_fee_minor,
  total_minor,
  commission_minor,
  seats,
  idempotency_key,
  cancelled_at,
  cancellation_reason,
  completed_at,
  created_at,
  updated_at
) on bookings to anon, authenticated;

comment on column bookings.ticket_token is
  'The QR credential. Not readable by anon or authenticated (column privilege); my_bookings() returns it to the owner at confirmed/completed. See 20261022000002.';
