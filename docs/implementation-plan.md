# Implementation Plan

Milestones M0–M8 per [`PRD.md`](PRD.md) §15. Each milestone must pass the quality gates in
[`build-prompt.md`](build-prompt.md) before the next begins.

**Quality gate (every milestone):** type-check passes · lint passes · relevant tests pass ·
migrations apply cleanly to a fresh database · `setup.md` updated · `implementation-status.md` and
`traceability.md` updated · no known critical security or data-integrity defect carried forward.

---

## M0 — Repository foundation

Monorepo skeleton and the shared foundations everything else compiles against.

1. npm workspaces root; `packages/config` with base tsconfig, ESLint, Prettier.
2. `packages/types` — money primitives, currency, ID branding, the pure pricing function,
   voucher token codec, booking/voucher state machines, Zod env schema. Unit tests from day one.
3. `packages/ui` — the Caribbean VIP design tokens (architecture §4) plus a contrast test.
4. Three app shells that build and run: Expo mobile with the 5-tab navigation stub, two Next.js apps.
5. `.env.example` for every app; nothing secret committed; `.gitignore`.
6. GitHub Actions CI: install → typecheck → lint → test.

**Exit:** `npm run typecheck && npm run lint && npm run test` green from a clean clone; all three apps
start.

## M1 — Auth and domain foundation

1. Migrations for all 24 PRD entities plus `platform_settings`, `rate_limit_events`,
   `promotion_impressions`.
2. RLS on every user-accessible table; `is_admin()` / `is_vendor_member()` helpers; a test that fails
   if any `public` table has RLS disabled.
3. `reserve_availability()` and `redeem_voucher()` Postgres functions.
4. Supabase Auth wiring in all three apps; role-aware routing; guest mode in mobile (T-01).
5. Jamaica seed: 6 destinations, demo vendors and experiences across the 12 required categories, the
   rum-punch geofenced offer — all `is_demo = true`.
6. Navigation shells: mobile 5 tabs (Explore, Nearby, **Irie AI** centre, Trips, Profile), vendor and
   admin layouts.

**Exit:** fresh DB migrates and seeds; RLS test suite passes including negative cases (a tourist
cannot read another tourist's booking; an unapproved listing is invisible to `anon`).

## M2 — Tourist discovery

Explore home with destination-aware sections, search with filters and sort, Nearby list/map with
marker previews, experience detail, saved items, island/destination switcher.

**Exit:** T-01, T-02, T-03 pass. Map failure and location-denied states render usefully.

## M3 — Booking and Stripe

Availability calendar, party/add-on selection, quote endpoint, `checkout-session` and
`stripe-webhook` Edge Functions, booking confirmation, Trips, voucher issuance and QR display.

**Exit:** T-04, T-05, T-06 pass. Webhook replay creates exactly one booking. Concurrent checkout on
the last seat: one succeeds, one fails cleanly.

## M4 — Vendor portal

Onboarding flow with document upload, listing management, availability and blackout dates,
promotions, bookings list, browser-camera QR scanner, `redeem-voucher` integration, gross/fee/net
dashboard, staff invitations.

**Exit:** V-01 through V-05 and V-07 pass. Duplicate scan rejected with the original timestamp.

## M5 — Admin console

Dashboard, vendor review (approve/reject/request changes/suspend with reasons), listing moderation,
booking operations including refund state, content management, promotion oversight, audit log viewer.

**Exit:** admin can take a vendor from application to a live public listing with no database
manipulation. Every privileged action appears in `audit_logs`.

## M6 — Geofenced offers

Consent UI (OS permission + separate offer opt-in), `nearby-offers` eligibility endpoint, restrained
in-app notification, offer detail with eligibility/expiry/distance/terms, offer wallet, cooldowns,
voucher linkage to bookings, manual nearby-offers fallback.

**Exit:** T-07, T-08, V-06 pass. No location leaves the device without both consents. Denying
location leaves manual discovery working.

## M7 — Irie AI

Grounded retrieval restricted to approved inventory and curated content, recommendation cards linked
to real listing IDs, context from destination/party/budget/time/interests, single clarifying
question, save / add-to-trip / view / book actions, simple itinerary builder, rate limits, history
clearing, non-AI search fallback.

**Exit:** with the AI provider disabled the tab degrades to search rather than erroring. A prompt
asking for a non-existent vendor yields "not available", never an invention.

## M8 — Hardening

Full automated suite, security review against PRD §14, accessibility and outdoor-readability pass,
performance, error monitoring and health checks, deployment docs, demo accounts, production-readiness
checklist.

**Exit:** the MVP release gate in PRD §15.

---

## Sequencing risks

| Risk | Mitigation |
|---|---|
| Stripe webhook cannot be exercised without keys | `stripe listen` locally with test keys; a mock payment adapter lets M3 flows be built and tested before any key exists. Webhook idempotency is unit-tested against recorded event fixtures, not a live Stripe. |
| Expo + npm workspaces module resolution | Metro config watching the workspace root, verified in M0 before app code is written. |
| Maps provider undecided (OD-05) | Adapter boundary in M0; M2 ships against the mock and one real provider swappable by env var. |
| RLS mistakes are silent | Negative-case RLS tests are written in M1 as part of the milestone, not deferred to M8. |
| Deferring T-09 (cancellation, Should) | Scheduled into M3 as the refund path since it touches payment state; if it slips it is recorded as `deferred`, never silently dropped. |
