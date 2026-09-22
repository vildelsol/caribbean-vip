# Implementation Status

Per operating rule 6: no requirement is silently omitted. Every requirement is marked
`complete` · `partial` · `blocked` · `deferred` · `not started`.

**Last updated:** 2026-09-22 · **Current milestone:** M0–M7 complete in demo mode; M3 backend deployed, first live payment test pending; M8 in progress

---

## Milestones

| Milestone | Status | Notes |
|---|---|---|
| First deliverable (docs) | complete | PRD, build prompt, architecture, plan, status, setup, test plan, ERD, traceability, open decisions written. |
| M0 — Repository foundation | complete | pnpm monorepo, shared config, `@cvip/types` with 38 unit tests, `@cvip/ui` tokens with 9 contrast tests, three app shells building, CI, env templates. |
| M1 — Auth and domain foundation | complete | 11 migrations; RLS on all 29 tables; `reserve_availability` and `redeem_voucher`; Jamaica seed; auth in all three apps; 5 SQL test files plus a concurrency suite. |
| M2 — Tourist discovery | complete | Full-text search, Explore sections, Nearby with distance, experience detail, saved items, location adapters. 98 unit tests. |
| M3 — Booking, Stripe, redemption | **backend deployed; first live payment pending** | Edge Functions (`checkout-session`, `stripe-webhook`, `booking-status`, `resolve-slot`) are ACTIVE on `xtyuvtlnfougbjadkull`. Webhook registered. Tourist app live at `https://caribbean-vip-tourist-web.vercel.app`. First end-to-end Stripe payment not yet executed — see HANDOVER §5. |
| M4 — Vendor portal | **complete in demo mode** | `apps/vendor-web`: onboarding, listings (edit/publish/new), availability (editable slots), earnings, billing, scan. Write path runs in local state. |
| M5 — Admin console | **complete in demo mode** | `apps/admin-web`: vendor and listing review, audit log. |
| M6 — Geofenced offers | **wired (2026-09-22)** | Real GPS triggers offer on 250 m entry; 400 m hysteresis; demo timer fallback for simulated/no-consent positions. `data/geofence.ts` pure, needs unit tests. |
| M7 — Irie AI | **complete in demo mode** | `Irie.tsx` itinerary builder, 680 lines. Irie rule-matcher and greeting retypeset. Real model not wired (open decision). |
| M8 — Hardening | **in progress** | 289 tests; a11y pass (checkout live region, touch-action, LCP priority, reduced-motion); token contrast enforced via `tokens.test.ts`. |

---

## Requirements

### Tourist app (T-series)

| Req | Status | Notes |
|---|---|---|
| T-01 Island selection | complete | Explore + Profile switcher. |
| T-02 Browse experiences | complete | Explore sections, category filter, ranked list. |
| T-03 Experience detail | complete | Photos, description, duration, price, availability, save. |
| T-04 Search | complete in demo mode | Full-text search with filters and sort, seeded data. |
| T-05 Booking + payment | partial | Demo path complete. Live Stripe path deployed; first live payment not yet executed. |
| T-06 Confirmation + ticket | complete in demo mode | QR voucher, booking summary, Trips. |
| T-07 Location + geofence | partial | Consent flow complete; geofence wired to real GPS (M6 done). Push channel (background delivery) is M6 deferred. |
| T-08 Irie AI planner | complete in demo mode | Itinerary builder, day plan state, rule-matched suggestions. |
| T-09 Redemption scan | complete in demo mode | QR display and vendor scan path both built. |
| T-10 Guest sign-up / onboarding | **complete (2026-09-22)** | Welcome screen: name + island selection; gates app on first launch; name used on Profile. |

### Vendor portal (V-series)

| Req | Status | Notes |
|---|---|---|
| V-01 Onboarding | complete in demo mode | Business profile form → billing step → dashboard. |
| V-02 Listings | **complete in demo mode (2026-09-22)** | Edit, Publish/Unpublish, New listing — write path in local state. |
| V-03 Availability | **complete in demo mode (2026-09-22)** | Listing selector; tap-to-edit slot capacity; in-memory overrides. |
| V-04 Today manifest | complete in demo mode | Departure order, check-in status, next departure card. |
| V-05 Scan + redeem | complete in demo mode | Camera QR scan, redemption state machine, success/already-used/invalid states. |
| V-06 Billing | complete in demo mode | Billing details form, plan display. |
| V-07 Earnings | complete in demo mode | Gross / platform fee / net, today + weekly, per-listing breakdown. |

---

## Security findings fixed during M1

| Finding | Severity | Fix |
|---|---|---|
| **Privilege escalation via self-update.** `profiles_self_update` let a tourist set their own `role`. | High | `guard_profile_privileges()` trigger: no self-role-change; only super admin may grant/revoke admin roles. |
| **Import-time crash on missing config.** Supabase client threw at module scope, breaking `next build` on a fresh clone. | Medium | `createLazyBrowserClient` defers construction to first use. |

---

## Open decisions (from `open-decisions.md`)

| Decision | Status |
|---|---|
| OD-02 — Stripe Connect vs manual payouts | open — affects vendor onboarding UI and payout reconciliation |
| OD-07 — Irie real model | open — rule-matcher complete; real Claude API call not wired |
| OD-09 — Multi-currency display | resolved — USD minor amounts throughout; island currency display-only |

---

## Known gaps before M3 can be marked complete

1. **First live Stripe payment** — test with card `4242 4242 4242 4242` on the Vercel URL.
2. **`data/geofence.ts` unit tests** — 250 m / 400 m hysteresis logic needs guard tests.
3. **Reseed drift** — `packages/demo/src/dataset.ts` dropped `[Demo]` prefix; `supabase/seed/seed.sql` still carries it.
