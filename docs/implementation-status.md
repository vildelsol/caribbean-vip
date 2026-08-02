# Implementation Status

Per operating rule 6: no requirement is silently omitted. Every requirement is marked
`complete` · `partial` · `blocked` · `deferred` · `not started`.

**Last updated:** 2026-08-02 · **Current milestone:** M0 and M1 complete, M2 not started

---

## Milestones

| Milestone | Status | Notes |
|---|---|---|
| First deliverable (docs) | complete | PRD, build prompt, architecture, plan, status, setup, test plan, ERD, traceability, open decisions written. |
| M0 — Repository foundation | complete | pnpm monorepo, shared config, `@cvip/types` with 38 unit tests, `@cvip/ui` tokens with 9 contrast tests, three app shells building, CI, env templates. All gates green — see verification log. |
| M1 — Auth and domain foundation | complete | 11 migrations covering all 24 PRD entities plus 3 additions; RLS on all 29 tables; `reserve_availability` and `redeem_voucher`; Jamaica seed; auth in all three apps; 5 SQL test files plus a concurrency suite. |
| M2 — Tourist discovery | not started | |
| M3 — Booking and Stripe | not started | |
| M4 — Vendor portal | not started | |
| M5 — Admin console | not started | |
| M6 — Geofenced offers | not started | |
| M7 — Irie AI | not started | |
| M8 — Hardening | not started | |

## Requirements

Detailed per-requirement status lives in [`traceability.md`](traceability.md).

After M1: **T-01 complete**; T-02, T-03, V-02, V-03, V-05 **partial** (enforced and tested in the
database, awaiting their UI); the rest `not started`. None are deferred or dropped.

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

Not yet verified: the mobile app running on a simulator or device (bundling is verified, launch is
not); anything requiring a database, since M1 has not started.

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
| Supabase project URL + anon key | All apps | not provided | Local Supabase CLI used instead |
| Supabase service-role key | Edge Functions | not provided | Local only |
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
- Six commercial/legal decisions remain open — see [`open-decisions.md`](open-decisions.md). None
  block M0–M8; all block accepting real payments or real vendors.
