# Requirement Traceability

Maps every PRD requirement ID and core business rule to the code area that implements it and the test
that proves it. Updated at every milestone gate.

Status values: `complete` · `partial` · `blocked` · `deferred` · `not started`

## Tourist requirements (PRD §5)

| ID | Requirement | Milestone | Code area | Test | Status |
|---|---|---|---|---|---|
| T-01 | Browse Jamaica content without an account | M1–M2 | `apps/mobile/lib/session.tsx` guest state; `experiences_public_read` policy | `rls_public_read.test.sql` (guest reads islands, destinations, catalogue) | **complete** |
| T-02 | Select/change island and destination manually | M2 | `apps/mobile/lib/island.tsx`; `app/select-destination.tsx`; `profiles.selected_island_id` | `rls_public_read.test.sql` (inactive islands hidden); UI e2e pending M2 | **partial** |
| T-03 | Search/filters return only active approved listings | M2 | `experiences_public_read` policy joining vendor status (AD-10) | `rls_public_read.test.sql`: draft listing hidden, listing under unapproved vendor hidden, child rows hidden | **partial** (search UI in M2) |
| T-04 | Date/time/party selection shows calculated total | M3 | `packages/types/pricing.ts`; `quote` Edge Fn | `pricing.test.ts` (table-driven) | not started |
| T-05 | Stripe test payment creates a booking exactly once | M3 | `supabase/functions/checkout-session`, `stripe-webhook`; unique `payments.stripe_event_id` | `webhook-idempotency.test.ts` (replay same event) | not started |
| T-06 | Paid booking in Trips with scannable QR voucher | M3 | `voucher.ts` codec; Trips screens | `voucher-codec.test.ts`; e2e `book-and-view-voucher` | not started |
| T-07 | Geofenced notifications only after consent | M6 | `profiles.location_consent` + `offer_consent`; `mayTriggerGeofencedOffer()`; Profile switches | `states.test.ts` (both flags required); `nearby-offers` Edge Fn in M6 | **partial** |
| T-08 | Save an offer voucher without booking | M6 | `vouchers` state `saved`; offer wallet | `voucher-state-machine.test.ts` | not started |
| T-09 | Cancel per policy, see status/refund result | M3 | cancellation policy eval; refund path | `cancellation-policy.test.ts` | not started |

## Vendor requirements (PRD §6)

| ID | Requirement | Milestone | Code area | Test | Status |
|---|---|---|---|---|---|
| V-01 | Submit onboarding application with documents | M4 | `apps/vendor-web/onboarding`; `vendor_documents` + private bucket | e2e `vendor-onboarding`; `signed-url-ownership.test.ts` | not started |
| V-02 | Only approved vendors publish public listings | M4–M5 | `experiences_public_read` joined to `vendor_organizations.status` | `rls_public_read.test.sql` (approved listing under pending vendor stays invisible) | **partial** (portal UI in M4) |
| V-03 | Capacity/availability by date-time, no oversell | M4 | `reserve_availability()` with `SELECT … FOR UPDATE` (AD-03) | `atomicity.test.sql`; **`db-concurrency-test.sh`: 16 racers, 1 winner** | **partial** (UI in M4) |
| V-04 | Scan and validate a QR voucher | M4 | `redeem_voucher()` Postgres fn; scanner UI in M4 | `atomicity.test.sql` happy path | **partial** |
| V-05 | Second scan rejected with original timestamp | M4 | `redeem_voucher()` row lock; terminal `redeemed` state enforced by trigger | `atomicity.test.sql` (2nd and 3rd scan return the ORIGINAL timestamp); **concurrency: 1 ok / 15 already_redeemed** | **partial** (UI in M4) |
| V-06 | Geofenced promotion with expiry and rules | M6 | `promotions` + `geofences` | `geofence-eligibility.test.ts` | not started |
| V-07 | Dashboard separates gross, fee, net | M4 | `bookings` fee columns; vendor dashboard | `vendor-earnings.test.ts` (reconciles to payments) | not started |

## Core business rules (build prompt §16)

| Rule | Enforced by | Test | Status |
|---|---|---|---|
| Only approved vendors/listings are public | RLS policy, not query convention | `rls_public_read.test.sql` | **complete** |
| Totals calculated server-side | `checkout-session` recomputes; client amount ignored | `checkout-ignores-client-total.test.ts` | not started |
| Capacity cannot be oversold | `reserve_availability()` `FOR UPDATE` + CHECK constraint | `atomicity.test.sql` + `db-concurrency-test.sh` | **complete** |
| Stripe webhook is authoritative | Booking confirmed only in webhook handler | `webhook-authority.test.ts` | not started |
| Webhook/booking operations idempotent | Unique `stripe_event_id`; booking idempotency key | `webhook-idempotency.test.ts` | not started |
| QR contains opaque signed reference only | `voucher.ts`: random id + HMAC, no PII | `voucher-codec.test.ts` asserts payload shape | not started |
| Redemption atomic, never twice | `redeem_voucher()` row lock + terminal-state trigger | `atomicity.test.sql` + `db-concurrency-test.sh` | **complete** |
| Geofenced offers need consent + cooldown + fallback | `nearby-offers`; `promotion_impressions` | `consent-gate.test.ts`, `cooldown.test.ts` | not started |
| Irie AI recommends only approved inventory | Retrieval restricted to approved rows | `irie-grounding.test.ts` (asks for absent vendor) | not started |
| Admin actions and redemptions audit logged | `audit_status_change()` triggers; every scan writes `voucher_redemptions` | `append_only_and_seed.test.sql` | **partial** (M5 adds the rest of the admin actions) |

## Additional guarantees added in M1

| Guarantee | Enforced by | Test | Status |
|---|---|---|---|
| A user cannot change their own role | `guard_profile_privileges()` trigger | `rls_tenant_isolation.test.sql` | **complete** |
| Only a super admin grants admin roles (PRD §4) | same trigger | `rls_tenant_isolation.test.sql` | **complete** |
| A tourist cannot create their own booking or voucher | no client INSERT policy; checkout is server-side | `rls_tenant_isolation.test.sql` | **complete** |
| Tourist A cannot read tourist B's records | per-user RLS policies | `rls_tenant_isolation.test.sql` | **complete** |
| Vendor X cannot read or edit vendor Y's data | `is_vendor_member()` policies | `rls_tenant_isolation.test.sql` | **complete** |
| Vendors cannot read customer Stripe references | `payments_self_read` excludes vendors | `rls_tenant_isolation.test.sql` | **complete** |
| Geofence coordinates are never public | no `anon` policy on `geofences` | `rls_public_read.test.sql` | **complete** |
| Audit log and redemptions are append-only | `forbid_mutation()` trigger — blocks the service role too | `append_only_and_seed.test.sql` | **complete** |
| Booking/voucher state machines match `packages/types` | transition-check triggers | `atomicity.test.sql` | **complete** |
| Seeded content is labelled demo | `is_demo` + `[Demo]` prefix | `append_only_and_seed.test.sql` | **complete** |
| No column can hold card data | schema shape | `schema.test.sql` | **complete** |

## Security & privacy (PRD §14)

| Requirement | Code area | Test | Status |
|---|---|---|---|
| RLS on every user-accessible table | `20260802000010_rls.sql` | `schema.test.sql` enumerates `pg_tables`; also fails on an RLS table with no policy | **complete** |
| Private buckets with signed access | storage policies | `signed-url-ownership.test.ts` | not started |
| No service-role/Stripe secret client-side | split env schemas; `createBrowserClient` rejects a service-role key | `env.test.ts`, `client.test.ts`; CI committed-secret scan | **complete** |
| Rate limiting on auth, AI, scans | `rate_limit_events` | `rate-limit.test.ts` | not started |
| Graceful degraded states | mobile fallbacks | e2e `degraded-modes` (location denied, AI down, map fail) | not started |
