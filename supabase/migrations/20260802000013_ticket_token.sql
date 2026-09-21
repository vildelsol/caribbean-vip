-- M3: store the signed ticket token on the booking so the guest app can fetch it after
-- the Stripe webhook confirms payment. The token is the signed HMAC JWT the QR code carries;
-- only the server ever writes it.
--
-- RLS note: the existing bookings RLS (`bookings_owner_read`) already allows the booking owner
-- to select all columns, so no new policy is needed here. The column is never written through
-- PostgREST — only the stripe-webhook Edge Function (service role) sets it.
alter table bookings add column ticket_token text;
