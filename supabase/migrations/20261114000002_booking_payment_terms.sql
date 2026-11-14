-- Where a booking's payment was sent, fixed when the checkout was created.
--
-- The payee was being worked out again from `vendor_payout_accounts` every time it was needed. That is
-- wrong in two ways: a retry of the same checkout could be sent to a different account if the vendor's
-- row had changed in between (two payable sessions for one booking), and a webhook had nothing to
-- check an event's account against. So the terms are written once, with the booking, and everything
-- later (retry, webhook check, refund) reads these and never the live table.
--
-- Service role only, like `vendor_payout_accounts`: a guest can read their own payment row, and must
-- not be handed the vendor's account reference.

create table booking_payment_terms (
  booking_id         uuid primary key references bookings(id) on delete cascade,
  -- 'vendor_is_merchant' or 'platform_collects': which rule applied when this booking was made.
  payout_model       text not null check (payout_model in ('vendor_is_merchant', 'platform_collects')),
  provider           text not null check (length(provider) between 1 and 40),
  -- Null exactly when the platform collected the money itself.
  payee_account_ref  text check (payee_account_ref is null or length(payee_account_ref) between 1 and 200),
  platform_fee_minor bigint not null default 0 check (platform_fee_minor >= 0),
  -- A retry must send the provider exactly the call it sent the first time, expiry included, or the
  -- provider rejects the reused idempotency key.
  session_expires_at timestamptz not null,
  created_at         timestamptz not null default now(),
  constraint payment_terms_payee_matches_model check (
    (payout_model = 'vendor_is_merchant' and payee_account_ref is not null)
    or (payout_model = 'platform_collects' and payee_account_ref is null and platform_fee_minor = 0)
  )
);

alter table booking_payment_terms enable row level security;

-- No policy at all: nobody reaches it through the API. Edge Functions use the service role.
revoke all on booking_payment_terms from anon, authenticated;
