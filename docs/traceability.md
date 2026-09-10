# Requirement Traceability

Maps every PRD requirement ID and core business rule to the code area that implements it and the test
that proves it. Updated at every milestone gate.

Status values: `complete` · `partial` · `blocked` · `deferred` · `not started`

> **The tourist surface was rebuilt.** The Expo app was retired on 2026-08-03 and replaced by
> `apps/tourist-web`; see [`.archive/README.md`](../.archive/README.md). Several tourist rows below
> were **complete in the Expo app and are not yet rebuilt in the web app**, and they are marked
> `regressed` rather than left at their old status. Nothing is silently omitted: a requirement that
> only works in retired code is not a requirement that works.
>
> The database, RLS and domain-logic evidence is unaffected — those tests never depended on which
> client rendered the result.

## Tourist requirements (PRD §5)

| ID | Requirement | Milestone | Code area | Test | Status |
|---|---|---|---|---|---|
| T-01 | Browse Jamaica content without an account | M1–M2 | `apps/tourist-web` browses with no auth at all; `experiences_public_read` policy; `isPubliclyVisibleDemo` mirrors it in demo mode | `rls_public_read.test.sql` (guest reads islands, destinations, catalogue) | **complete** |
| T-02 | Select/change island and destination manually | M2 | `apps/tourist-web/src/state/store.tsx`; the Explore switcher and the Profile island list; `profiles.selected_island_id` | `discovery.test.sql` (destination filter partitions the catalogue and narrows it); `rls_public_read.test.sql` (inactive islands hidden) | **complete** |
| T-03 | Search/filters return only active approved listings | M2 | `search_experiences()` (NOT security definer); `experiences_public_read` (AD-10). `apps/tourist-web/src/screens/Search.tsx` searches `searchCandidates()`, which goes through `visibleExperiences()` — the mirror of that policy. Filters and sort run in memory through the same `@cvip/types` functions the server path uses | `search.test.sql`: draft and unapproved-vendor listings unfindable by exact title, plus an assertion that the function is not `security definer`; `search.test.ts` (27 unit tests); `apps/tourist-web/src/data/search.test.ts` (8 tests) asserts the *screen's own* candidate set excludes both negative fixtures — verified by mutation: bypassing `visibleExperiences()` fails 4 of them | **complete in demo mode** — the rule holds and the UI exercises it; the live path still needs `search_experiences()` wired to a backend |
| T-04 | Date/time/party selection shows calculated total | M3 | `packages/types/pricing.ts`; `apps/tourist-web/src/screens/Checkout.tsx` re-quotes on every change through `priceFor()` | `pricing.test.ts` (table-driven); demo store quote tests; walked in a browser (2 adults US$213.60 → +1 child US$277.68) | **complete in demo mode** — the live path still needs the `checkout-session` Edge Function |
| T-05 | Stripe test payment creates a booking exactly once | M3 | `supabase/functions/checkout-session`, `stripe-webhook`; unique `payments.stripe_event_id` | `webhook-idempotency.test.ts` (replay same event); demo capacity-hold test | **partial** — booking, capacity hold and confirmation work end to end in demo mode; **no Stripe payment has ever been taken**, because the Edge Function adapters are not built |
| T-06 | Paid booking in Trips with scannable QR voucher | M3 | `voucher.ts` codec; `ticket.ts` signs with the real HMAC; `Ticket.tsx` renders a genuinely scannable QR of that token | `voucher.test.ts`; walked in a browser: valid → already-redeemed → invalid-signature | **complete in demo mode** |
| T-07 | Geofenced notifications only after consent | M6 | `states.ts` holds the consent rule. **Location consent is now built and enforced**: `AppState.locationConsent`, `LocationBar` as the only control that can raise the browser prompt, `BrowserLocationProvider` implementing the AD-07 port, and `resolvePosition()` checking consent *before* it reads a fix. Offers still fire on a **simulated** trigger from `Explore.tsx`, and there is no offer-consent switch or real geofence | `states.test.ts` (both flags required); `position.test.ts` (16 tests): a fix is never used without consent, and a fix far from the selected island is refused | **partial** — the location half of the gate is complete and tested; the offer-consent half and the real geofence are not |
| T-08 | Save an offer voucher without booking | M6 | `Offer.tsx` "Save offer" → `saveVoucher`; the wallet on Profile; the voucher attaches to a later booking and releases on cancel | walked in a browser: saved → attached at checkout → redeemed | **complete in demo mode** |
| T-09 | Cancel per policy, see status/refund result | M3 | `cancellationDeadline()` (retired with the Expo app); the web store's `cancelBooking` releases an attached voucher | demo cancel-invalidates-voucher test | **partial** — the state transition is modelled; there is no cancellation UI in the web app, and **no refund is issued**, because there is no payment to refund |

## Vendor requirements (PRD §6)

| ID | Requirement | Milestone | Code area | Test | Status |
|---|---|---|---|---|---|
| V-01 | Submit onboarding application with documents | M4 | `apps/vendor-web/onboarding`; `vendor_documents` + private bucket | e2e `vendor-onboarding`; `signed-url-ownership.test.ts` | not started |
| V-02 | Only approved vendors publish public listings | M4–M5 | `experiences_public_read` joined to `vendor_organizations.status` | `rls_public_read.test.sql` (approved listing under pending vendor stays invisible) | **partial** (portal UI in M4) |
| V-03 | Capacity/availability by date-time, no oversell | M4 | `reserve_availability()` with `SELECT … FOR UPDATE` (AD-03) | `atomicity.test.sql`; **`db-concurrency-test.sh`: 16 racers, 1 winner** | **partial** (UI in M4) |
| V-04 | Scan and validate a QR voucher | M3 | `redeem_voucher()` Postgres fn; `apps/vendor-web/components/Scanner.tsx` (camera + paste fallback) | `atomicity.test.sql` happy path; demo scanner tests; walked in a browser | **complete in demo mode** |
| V-05 | Second scan rejected with original timestamp | M3 | `redeem_voucher()` row lock; terminal `redeemed` state enforced by trigger; scanner renders the original scan | `atomicity.test.sql` (2nd and 3rd scan return the ORIGINAL timestamp); **concurrency: 1 ok / 15 already_redeemed**; demo scanner test; walked in a browser | **complete in demo mode** |
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
| Irie AI recommends only approved inventory | Retrieval restricted to approved rows. In the web app both Irie surfaces read the catalogue through `visibleExperiences()`, which applies `isPubliclyVisibleDemo` — the mirror of `experiences_public_read` | `itinerary.test.ts` asserts the builder never places a draft listing or one under an unapproved vendor, on every shape, island and day of the next week; `irie-grounding.test.ts` (asks for absent vendor) still needed against a real backend | **partial** — proven for the demo catalogue, unproven against Supabase |
| Admin actions and redemptions audit logged | `audit_status_change()` triggers; every scan writes `voucher_redemptions` | `append_only_and_seed.test.sql` | **partial** (M5 adds the rest of the admin actions) |

## Additional guarantees added in M2

| Guarantee | Enforced by | Test | Status |
|---|---|---|---|
| Search cannot bypass RLS | `search_experiences` runs as the caller; a test asserts `prosecdef = false` | `search.test.sql` | **complete** |
| Ratings come only from moderated reviews | `experience_ratings` view is `security_invoker` | `search.test.sql`, `discovery.test.sql` | **complete** |
| Saving requires an account | `saved_items` RLS; no `anon` policy | `discovery.test.sql` | **complete** |
| One tourist cannot read or delete another's saved items | per-user RLS | `discovery.test.sql` | **complete** |
| An experience cannot be saved twice | unique `(user_id, item_type, item_id)` | `discovery.test.sql` | **complete** |
| A hidden listing's detail page is indistinguishable from a missing one | RLS returns no row; UI renders one state for both | `discovery.test.sql` (options and slots hidden too) | **complete** |
| Location is never requested on mount | `getPermission()` on mount, `requestPermission()` only on press. `BrowserLocationProvider.getPermission()` reads the Permissions API, which cannot raise a prompt; `getCurrentPosition()` refuses to run without an explicit `prompt` flag unless permission is already granted | `providers.test.ts` (mock defaults to denied); walked in a browser — a fresh load shows "Distances are from Ocho Rios" with no dialogue | **complete** |
| No background or continuous tracking (PRD §9) | `LocationProvider` exposes no watch/background method | `providers.test.ts` asserts the interface surface | **complete** |
| Nearby works with location denied | manual destination fallback, and `resolvePosition()` names which of the two is in use | `providers.test.ts`; `position.test.ts` covers denied, no-fix and off-island; walked in a browser in all four states | **complete in demo mode** |
| Sorting is total and stable | every comparator falls back to title | `search.test.ts` | **complete** |
| Distance display never implies false precision | coarse rounding in `formatDistance` | `search.test.ts` | **complete** |

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
