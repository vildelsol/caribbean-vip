# Implementation Status

Per operating rule 6: no requirement is silently omitted. Every requirement is marked
`complete` · `partial` · `blocked` · `deferred` · `not started`.

**Last updated:** 2026-08-02 · **Current milestone:** M0 complete, M1 not started

---

## Milestones

| Milestone | Status | Notes |
|---|---|---|
| First deliverable (docs) | complete | PRD, build prompt, architecture, plan, status, setup, test plan, ERD, traceability, open decisions written. |
| M0 — Repository foundation | complete | pnpm monorepo, shared config, `@cvip/types` with 38 unit tests, `@cvip/ui` tokens with 9 contrast tests, three app shells building, CI, env templates. All gates green — see verification log. |
| M1 — Auth and domain foundation | not started | |
| M2 — Tourist discovery | not started | |
| M3 — Booking and Stripe | not started | |
| M4 — Vendor portal | not started | |
| M5 — Admin console | not started | |
| M6 — Geofenced offers | not started | |
| M7 — Irie AI | not started | |
| M8 — Hardening | not started | |

## Requirements

Detailed per-requirement status lives in [`traceability.md`](traceability.md). Summary: all 16
requirement IDs (T-01…T-09, V-01…V-07) are `not started`. None are deferred or dropped.

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
- The mobile app is verified to bundle, not to launch. Simulator/device verification lands with M1
  when there is a screen worth looking at.
- Six commercial/legal decisions remain open — see [`open-decisions.md`](open-decisions.md). None
  block M0–M8; all block accepting real payments or real vendors.
