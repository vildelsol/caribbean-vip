# Payment partners: how a new one slots in

The platform is built so the payment partner is a plug, not a dependency. Stripe is the first adapter.
This page is what someone, a future us or a buyer of the white-label product, needs to add another.

## What the code assumes (OD-01, leaning, pending counsel)

The vendor is the seller and the **merchant of record**. The guest pays the vendor through the partner;
the partner keeps the platform's fee (commission plus service fee) out of the payment. The platform
never holds the vendor's money, and never stores their bank or identity details. Counsel has not
confirmed this on any island (`docs/open-decisions.md`).

## The setting: `PAYOUT_MODEL`

Required by every payment Edge Function, with **no default**; an unset or unknown value makes the
function refuse to run, because a silent default would decide who the seller is.

| Value | Meaning | Used for |
|---|---|---|
| `vendor_is_merchant` | Payment goes to the vendor's account at the partner. A vendor with no `ready` account cannot be booked (`VENDOR_NOT_PAYABLE`), and the platform's own account is never a fallback. | Production |
| `platform_collects` | Every payment lands in the platform's own account. No split. | Demo and staging, where vendors have no real payout account |

## The two ports (`packages/payments`)

1. **`PaymentProvider`** (`ports.ts`): `createCheckoutSession`, `parseWebhook`, `refund`.
   - `createCheckoutSession` receives `payee` and `platformFeeMinor`. With a payee it must route the
     payment to that account and keep exactly `platformFeeMinor`.
   - `parseWebhook` verifies the signature (throw if invalid) and returns a `ParsedWebhook`: either a
     neutral `PaymentEvent` or `{ handled: false }` for events we ignore.
   - `refund` receives the payee, because a refund must come out of the account the payment went to.
2. **`PayoutAccountPort`** (`payoutPort.ts`): `ensureAccount` (safe to repeat), `onboardingLink`, and
   `status`. Only the partner's own report may make a vendor `ready`.

## Adding a partner: the checklist

1. Write `<partner>Provider.ts` in `supabase/functions/_shared/` (the I/O) and `<partner>Events.ts` in
   `packages/payments/src/` (pure event translation, like `stripeEvents.ts`).
2. Unit-test the translation with the partner's real sample payloads. The table to cover is in
   `stripeEvents.test.ts`: paid, pending (delayed methods), failed, expired, full and partial refund.
3. Implement `PayoutAccountPort` for it, and store accounts in `vendor_payout_accounts`
   (`provider` = the adapter's `name`). A vendor's account only counts if its provider matches the
   adapter that will charge it.
4. Register the adapter in `supabase/functions/_shared/deps.ts` and add its webhook endpoint and secret
   to `docs/production-provisioning.md`.
5. Add the partner as a row in `docs/privacy/processor-record.md` and sign its DPA **before** it
   receives any data.
6. Prove it against the partner's test mode before production. The Stripe adapter has not yet been
   proved against live Stripe Connect.

## Known gaps

- **Not built:** the vendor-facing "set up payouts" screen and the function that calls
  `PayoutAccountPort`. Until they exist an admin sets the account by hand, with the service role.
- **Column names:** `payments.stripe_event_id` and friends carry Stripe's name for historical reasons.
  They hold the active partner's ids. Renaming is mechanical and left for a migration of its own.
- **Fee rule:** `platformTake` (commission plus service fee) is an assumption. Whether the platform's
  fee is returned on a refund, and who remits tax, are for the founders and counsel.
- **Country coverage:** whether Stripe Connect can pay vendors in Jamaica, Barbados and Cayman is
  unconfirmed, which is why the partner is swappable.
