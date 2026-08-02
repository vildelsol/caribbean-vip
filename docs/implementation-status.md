# Implementation Status

Per operating rule 6: no requirement is silently omitted. Every requirement is marked
`complete` · `partial` · `blocked` · `deferred` · `not started`.

**Last updated:** 2026-08-02 · **Current milestone:** M0–M2 complete, M3 in progress

---

## Milestones

| Milestone | Status | Notes |
|---|---|---|
| First deliverable (docs) | complete | PRD, build prompt, architecture, plan, status, setup, test plan, ERD, traceability, open decisions written. |
| M0 — Repository foundation | complete | pnpm monorepo, shared config, `@cvip/types` with 38 unit tests, `@cvip/ui` tokens with 9 contrast tests, three app shells building, CI, env templates. All gates green — see verification log. |
| M1 — Auth and domain foundation | complete | 11 migrations covering all 24 PRD entities plus 3 additions; RLS on all 29 tables; `reserve_availability` and `redeem_voucher`; Jamaica seed; auth in all three apps; 5 SQL test files plus a concurrency suite. |
| M2 — Tourist discovery | complete | Full-text search with filters and sort, Explore sections, Nearby list with distance, experience detail, saved items, maps/location adapters. 7 SQL test files; 98 unit tests. |
| M3 — Booking, Stripe and redemption | in progress | `packages/payments` core complete (44 tests). Scope revised: vendor QR scanner moved here from M4. Remaining: Edge Function adapters, booking UI, Trips, voucher display, scanner. |
| M4 — Vendor portal | not started | |
| M5 — Admin console | not started | |
| M6 — Geofenced offers | not started | |
| M7 — Irie AI | not started | |
| M8 — Hardening | not started | |

## Requirements

Detailed per-requirement status lives in [`traceability.md`](traceability.md).

After M2: **T-01, T-02, T-03 complete**; V-02, V-03, V-05 **partial** (enforced and tested in the
database, awaiting the vendor UI in M4); T-07 **partial** (both consent flags and their controls
exist; the geofence trigger is M6); the rest `not started`. None are deferred or dropped.

## Security findings fixed during M1

Recorded because both were found by tests rather than by review, which is the argument for writing
the negative cases in the milestone that introduces the schema rather than deferring them to M8.

| Finding | Severity | Fix |
|---|---|---|
| **Privilege escalation via self-update.** `profiles_self_update` let a signed-in tourist set their own `role`, because RLS is per-row and `role` lives on the row the user is allowed to edit. A tourist could have made themselves `super_admin` and walked into the admin console. | High | `guard_profile_privileges()` trigger: no self-role-change, and only a super admin may grant or revoke admin roles (PRD §4). Ordinary preference updates still work — asserted by a test, so the guard cannot be "fixed" later by blocking all self-updates. |
| **Import-time crash on missing configuration.** The Supabase client threw at module scope, which broke `next build` for anyone without a `.env` and would have made the repo unbuildable on a fresh clone. | Medium | `createLazyBrowserClient` defers construction to first use, so an unconfigured app renders its labelled unconfigured state instead of failing to build (operating rule 4). |

Two test defects were also corrected: a blocked `UPDATE`/`DELETE` under RLS matches zero rows
rather than raising, and an `INSERT … SELECT` whose source rows are filtered away by RLS inserts
nothing and trivially "passes". Both assertions now check the actual effect.

## Verification log

Per operating rule 5, no feature is claimed to work without a recorded command and result.

| Date | Command | Result |
|---|---|---|
| 2026-08-02 | `node -v` / `npm -v` | v26.4.0 / 11.17.0 — toolchain present |
| 2026-08-02 | `git init` in `caribbean-vip/` | repository created |
| 2026-08-02 | `pnpm exec vitest run` | **47 passed**, 5 files, 0 failed |
| 2026-08-02 | `pnpm -r run typecheck` | exit 0 across all five workspaces |
| 2026-08-02 | `pnpm exec eslint .` | exit 0 |
| 2026-08-02 | `pnpm --filter @cvip/vendor-web build` | exit 0 — 2 routes prerendered |
| 2026-08-02 | `pnpm --filter @cvip/admin-web build` | exit 0 — 2 routes prerendered |
| 2026-08-02 | `expo export --platform ios` | iOS bundle succeeded, 930 modules |
| 2026-08-02 | Inspected prerendered HTML of both portals | Correct copy and brand tokens present (`#10828A`, `#9E8541`, `#E2D6C2`) |
| 2026-08-02 | `./scripts/db-test.sh` | Fresh DB, 11 migrations applied in order, seed applied, **5/5 SQL test files pass** |
| 2026-08-02 | `./scripts/db-concurrency-test.sh` | **V-03:** 16 concurrent reservations for 1 seat → exactly 1 won, `booked_count` = 1. **V-05:** 16 concurrent scans → exactly 1 `ok`, 15 `already_redeemed`, all 16 recorded |
| 2026-08-02 | `pnpm test` (after M1) | **59 passed**, 6 files |
| 2026-08-02 | `pnpm typecheck` / `pnpm lint` (after M1) | exit 0 across all six workspaces |
| 2026-08-02 | Both Next builds + `expo export` (after M1) | exit 0 / exit 0 / iOS bundle 982 modules |
| 2026-08-02 | `pnpm test` (after M2) | **98 passed**, 8 files |
| 2026-08-02 | `./scripts/db-test.sh` (after M2) | **7/7 SQL test files pass** on a fresh database |
| 2026-08-02 | `pnpm typecheck` / `pnpm lint` (after M2) | exit 0 |
| 2026-08-02 | Both Next builds + `expo export` (after M2) | exit 0 / exit 0 / iOS bundle 999 modules |
| 2026-08-02 | `pnpm test` (payments core) | **142 passed**, 10 files — 44 of them new in `@cvip/payments` |
| 2026-08-02 | `./scripts/db-push.sh` against an empty local DB | 29 tables, RLS enabled everywhere, 16 approved listings, 6 destinations |
| 2026-08-02 | `./scripts/db-push.sh` against a non-empty DB | correctly refused rather than half-applying |

Not yet verified: the mobile app running on a simulator or device (bundling and type-checking are
verified, launch is not), and anything that needs a real Supabase instance — see Known limitations.

### M0 deviation from plan

The monorepo was specified as npm workspaces and **changed to pnpm during M0**. Expo SDK 52 (React
18) and Next.js 15 (React 19) cannot share a hoisted `node_modules`: React Native was duplicated at
two majors, `expo-router` was hoisted outside its Babel root, and the Next builds failed with
"Incompatible React versions". Recorded as AD-01 in [`architecture.md`](architecture.md) with the
two load-bearing `.npmrc` settings. `pnpm` is now a hard prerequisite.

## External credentials required

Per operating rule 4, none of these block the build; each sits behind an env var with a mock adapter.

| Credential | Needed for | Status | Effect if absent |
|---|---|---|---|
| Supabase project URL + anon key | All apps | **being provisioned** — see [`supabase-provisioning.md`](supabase-provisioning.md) | Apps render a labelled unconfigured state |
| Supabase service-role key | Edge Functions | not provided | Needed to deploy the M3 Edge Functions; the payment core is testable without it |
| Stripe test secret + publishable key | M3 checkout | not provided | Mock payment adapter; flows testable, no real Stripe call |
| Stripe webhook signing secret | M3 webhook | not provided | Signature verification tested against fixtures |
| Voucher signing secret (`VOUCHER_HMAC_SECRET`) | M3 vouchers | generated locally | Dev-only value; must be rotated for staging/production |
| Maps provider key | M2 map view | not provided — provider undecided (OD-05) | Mock map adapter; list view fully functional |
| Notification provider key | M6 notifications | not provided — provider undecided (OD-05) | In-app notifications only |
| AI provider key | M7 Irie AI | not provided | Non-AI search fallback, which is a PRD requirement in its own right |

## Known limitations

- Nothing is production-approved. See the final build principle in [`PRD.md`](PRD.md).
- `pnpm audit` reports vulnerabilities in transitive **build-time** dependencies of the Expo
  toolchain (`xmldom`, `node-tar`, `sharp`/libvips, `uuid`). None are in the runtime path of the
  shipped apps, and the available fixes require breaking upgrades that conflict with Expo SDK 52's
  pinned versions. Tracked for M8 hardening, most likely resolved by an Expo SDK upgrade rather than
  by forcing versions.
- The mobile app is verified to bundle and to type-check, **not to launch on a device or
  simulator**. No Xcode simulator run has been performed.
- The database suite runs against plain PostgreSQL with a harness standing in for Supabase's
  `auth` schema. Migrations, RLS, triggers and the atomicity functions are genuinely exercised;
  **Storage bucket policies and real Supabase Auth behaviour are not** — the storage migration
  no-ops outside Supabase. Both need verifying against a hosted project before staging.
- No hosted Supabase project exists yet, so no app has been run end-to-end against a real backend.
- `packages/supabase/src/database.types.ts` is hand-written, not generated. It types only the
  tables M1–M2 read; the rest are loosely typed until the milestone that reads them.
- **The detail page's PostgREST embedded-select is not verified.** `loadExperience()` uses
  PostgREST's nested-relation syntax, which only a real Supabase instance can execute. The
  underlying relationships and their RLS are covered by `discovery.test.sql` as plain SQL joins,
  but the query string itself is unproven until a hosted project exists.
- **No map is rendered.** The maps provider is undecided (OD-05), so `MAPS_PROVIDER` defaults to
  `mock` and Nearby ships as a distance-sorted list with an explicit "map view unavailable"
  notice. This is a working fallback, not a finished map.
- Media is stored as paths only; no image rendering or signed-URL fetching yet.
- Six commercial/legal decisions remain open — see [`open-decisions.md`](open-decisions.md). None
  block M0–M8; all block accepting real payments or real vendors.
