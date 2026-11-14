-- Vendor payout accounts: where a vendor is paid, as the vendor is the merchant of record.
--
-- OD-01 leans to a marketplace in which the vendor is the seller (docs/open-decisions.md, 2026-11-14).
-- The payment partner is not chosen and may not be Stripe, so nothing here is Stripe's: a provider
-- name, that provider's opaque account reference, and the status the provider reported.
--
-- Replaces `vendor_organizations.stripe_account_id`, which was null everywhere and wrong in two ways:
--   - `vendor_orgs_public_read` exposes every column of an approved vendor to anyone, and
--   - `vendor_orgs_owner_update` lets a vendor owner write their own row. With payouts routed by that
--     column, an owner could have pointed their bookings at any account they liked.
-- A separate table with no write policy at all closes both: only the service role (the Edge
-- Functions, after the provider has confirmed the account) can set or change a row.
--
-- Nothing personal is stored. The platform never holds the vendor's bank or identity details; the
-- provider does, on its own pages.

create table vendor_payout_accounts (
  vendor_org_id uuid primary key references vendor_organizations(id) on delete cascade,
  provider      text not null check (length(provider) between 1 and 40),
  account_ref   text not null check (length(account_ref) between 1 and 200),
  -- Only the provider's own report may set `ready`; see PayoutAccountPort.status().
  status        text not null default 'onboarding' check (status in ('onboarding', 'ready', 'restricted')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- One provider account belongs to one vendor. A shared reference would route two vendors' money
  -- to the same place.
  unique (provider, account_ref)
);

create trigger vendor_payout_accounts_set_updated_at
  before update on vendor_payout_accounts
  for each row execute function set_updated_at();

alter table vendor_payout_accounts enable row level security;

-- The owner (who has payout visibility by right) and admins may read the row. Nobody may write it
-- through the API: there is deliberately no insert, update or delete policy.
create policy vendor_payout_accounts_read on vendor_payout_accounts
  for select to authenticated
  using (is_vendor_owner(vendor_org_id) or is_admin());

revoke all on vendor_payout_accounts from anon;
revoke insert, update, delete on vendor_payout_accounts from authenticated;

-- Carry over anything the old column held, then drop it.
insert into vendor_payout_accounts (vendor_org_id, provider, account_ref, status)
select id, 'stripe', stripe_account_id, 'onboarding'
  from vendor_organizations
 where stripe_account_id is not null;

alter table vendor_organizations drop column stripe_account_id;
