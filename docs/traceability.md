# Requirement Traceability

Maps every PRD requirement ID and core business rule to the code area that implements it and the test
that proves it. Updated at every milestone gate.

Status values: `complete` · `partial` · `blocked` · `deferred` · `not started`

## Tourist requirements (PRD §5)

| ID | Requirement | Milestone | Code area | Test | Status |
|---|---|---|---|---|---|
| T-01 | Browse Jamaica content without an account | M1–M2 | `apps/mobile` guest mode; RLS `anon` SELECT policy on `experiences` | `supabase/tests/rls_public_read.test.sql`; e2e `guest-browse` | not started |
| T-02 | Select/change island and destination manually | M2 | `apps/mobile/features/location`; `profiles.selected_island_id` | e2e `island-switch`; unit `localization.test.ts` | not started |
| T-03 | Search/filters return only active approved listings | M2 | RLS policy + `search_experiences()` | `rls_unapproved_hidden.test.sql` (negative case) | not started |
| T-04 | Date/time/party selection shows calculated total | M3 | `packages/types/pricing.ts`; `quote` Edge Fn | `pricing.test.ts` (table-driven) | not started |
| T-05 | Stripe test payment creates a booking exactly once | M3 | `supabase/functions/checkout-session`, `stripe-webhook`; unique `payments.stripe_event_id` | `webhook-idempotency.test.ts` (replay same event) | not started |
| T-06 | Paid booking in Trips with scannable QR voucher | M3 | `voucher.ts` codec; Trips screens | `voucher-codec.test.ts`; e2e `book-and-view-voucher` | not started |
| T-07 | Geofenced notifications only after consent | M6 | `nearby-offers` Edge Fn; `profiles.offer_consent` + OS permission | `consent-gate.test.ts` (both flags required) | not started |
| T-08 | Save an offer voucher without booking | M6 | `vouchers` state `saved`; offer wallet | `voucher-state-machine.test.ts` | not started |
| T-09 | Cancel per policy, see status/refund result | M3 | cancellation policy eval; refund path | `cancellation-policy.test.ts` | not started |

## Vendor requirements (PRD §6)

| ID | Requirement | Milestone | Code area | Test | Status |
|---|---|---|---|---|---|
| V-01 | Submit onboarding application with documents | M4 | `apps/vendor-web/onboarding`; `vendor_documents` + private bucket | e2e `vendor-onboarding`; `signed-url-ownership.test.ts` | not started |
| V-02 | Only approved vendors publish public listings | M4–M5 | `experiences` RLS joined to `vendor_organizations.status` | `rls_unapproved_vendor.test.sql` | not started |
| V-03 | Capacity/availability by date-time, no oversell | M4 | `reserve_availability()` Postgres fn | `capacity-race.test.ts` (concurrent reserve) | not started |
| V-04 | Scan and validate a QR voucher | M4 | browser camera scanner; `redeem-voucher` Edge Fn | `redemption.test.ts` valid path | not started |
| V-05 | Second scan rejected with original timestamp | M4 | `redeem_voucher()` row lock | `redemption-duplicate.test.ts` (concurrent + sequential) | not started |
| V-06 | Geofenced promotion with expiry and rules | M6 | `promotions` + `geofences` | `geofence-eligibility.test.ts` | not started |
| V-07 | Dashboard separates gross, fee, net | M4 | `bookings` fee columns; vendor dashboard | `vendor-earnings.test.ts` (reconciles to payments) | not started |

## Core business rules (build prompt §16)

| Rule | Enforced by | Test | Status |
|---|---|---|---|
| Only approved vendors/listings are public | RLS policy, not query convention | `rls_public_read.test.sql` | not started |
| Totals calculated server-side | `checkout-session` recomputes; client amount ignored | `checkout-ignores-client-total.test.ts` | not started |
| Capacity cannot be oversold | `reserve_availability()` `FOR UPDATE` | `capacity-race.test.ts` | not started |
| Stripe webhook is authoritative | Booking confirmed only in webhook handler | `webhook-authority.test.ts` | not started |
| Webhook/booking operations idempotent | Unique `stripe_event_id`; booking idempotency key | `webhook-idempotency.test.ts` | not started |
| QR contains opaque signed reference only | `voucher.ts`: random id + HMAC, no PII | `voucher-codec.test.ts` asserts payload shape | not started |
| Redemption atomic, never twice | `redeem_voucher()` | `redemption-duplicate.test.ts` | not started |
| Geofenced offers need consent + cooldown + fallback | `nearby-offers`; `promotion_impressions` | `consent-gate.test.ts`, `cooldown.test.ts` | not started |
| Irie AI recommends only approved inventory | Retrieval restricted to approved rows | `irie-grounding.test.ts` (asks for absent vendor) | not started |
| Admin actions and redemptions audit logged | Triggers + explicit writes | `audit-log-coverage.test.ts` | not started |

## Security & privacy (PRD §14)

| Requirement | Code area | Test | Status |
|---|---|---|---|
| RLS on every user-accessible table | all migrations | `rls_enabled_everywhere.test.sql` | not started |
| Private buckets with signed access | storage policies | `signed-url-ownership.test.ts` | not started |
| No service-role/Stripe secret client-side | env schema splits public/server vars | CI secret-scan + `env-schema.test.ts` | not started |
| Rate limiting on auth, AI, scans | `rate_limit_events` | `rate-limit.test.ts` | not started |
| Graceful degraded states | mobile fallbacks | e2e `degraded-modes` (location denied, AI down, map fail) | not started |
