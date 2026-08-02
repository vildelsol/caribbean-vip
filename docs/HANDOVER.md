# Handover — Caribbean VIP

**Written:** 2026-08-02 · **Last commit:** `17fcb69` · **Working tree:** clean, all gates green

Read this first, then [`PRD.md`](PRD.md) (product source of truth) and
[`architecture.md`](architecture.md) (the numbered decisions and why they were made).

---

## 1. What this is

Caribbean VIP — a mobile-first Caribbean tourism marketplace. Tourists discover and book verified
local excursions, receive geofenced offers, and hold QR vouchers that vendors scan to validate.
Jamaica is the populated launch market; the architecture is island-aware from day one.

**This is a separate project** from EGES/ComplyIQ and from Villaggio del Sol. Do not mix them.

Repository: `/Users/rogeanedwards/Desktop/caribbean Vip/caribbean-vip` (git, branch `master`).
The parent folder also holds the source PDF and a mockup image.

### The founder's standing instruction on the mockup

`ChatGPT Image Aug 2, 2026…png` is a **colour-scheme reference only**. Its VIP Cayman branding, its
four-tab navigation and its screen inventory are **not** requirements. The PRD governs: Jamaica
first, five tabs with **Irie AI as the centre item**. The palette was sampled from it and lives in
`packages/ui/src/tokens.ts`.

---

## 2. Where the build has got to

| Milestone | Status |
|---|---|
| First deliverable (docs) | complete |
| M0 — Repository foundation | complete |
| M1 — Auth and domain foundation | complete |
| M2 — Tourist discovery | complete |
| **M3 — Booking, Stripe, redemption** | **in progress** — payment core done, UI not started |
| M4–M8 | not started |

Requirements: **T-01, T-02, T-03 complete.** V-02, V-03, V-04, V-05 enforced and tested in the
database, awaiting UI. T-07 partial (both consent flags and their controls exist; the geofence
trigger is M6). Full per-requirement detail in [`traceability.md`](traceability.md).

### Commits

```
17fcb69  Demo mode: run the whole app with no backend
66f9173  M3 (part 1): payment core, plus three decisions recorded
2147725  M2: tourist discovery — search, filters, Nearby, detail and saved items
49391f8  M1: schema, RLS, atomicity functions, Jamaica seed and auth
a809a16  M0: repository foundation and first-deliverable documentation
```

---

## 3. Pick up here

Tasks 17–19 from the previous session, in order. All three are wiring over logic that already
exists and is tested.

### Next: the booking flow (T-04, T-05, T-06)

Screens to build in `apps/mobile`:

1. `app/book/[id].tsx` — date/departure picker, party and add-on selection, live quote.
2. Confirmation screen after payment.
3. `app/voucher/[id].tsx` — human-readable reference plus a scannable QR.
4. `app/(tabs)/trips.tsx` — currently still a `MilestoneScreen` placeholder. Needs upcoming /
   completed / cancelled / saved.

**Two route declarations were removed from `app/_layout.tsx`** because they pointed at screens that
did not exist yet. Add them back when you create the screens:

```tsx
<Stack.Screen name="book/[id]" options={{ title: 'Book' }} />
<Stack.Screen name="voucher/[id]" options={{ title: 'Your voucher' }} />
```

**Do not write new pricing or voucher logic.** It exists:

- Demo path: `demoBackend.quote()` and `demoBackend.book()` in `packages/demo/src/store.ts`.
- Live path: `quoteBooking()` and `startCheckout()` in `packages/payments/src/checkout.ts`.

Dispatch between them the same way `apps/mobile/lib/catalogue.ts` already does, on `isDemoMode`.

QR rendering needs a library — `react-native-qrcode-svg` is the usual choice and works on web.

### Then: the vendor scanner (closes Journey A)

In `apps/vendor-web`. A camera scanner (`html5-qrcode` or `@zxing/browser`) plus a paste-a-token
fallback, which is what makes it demoable on a laptop with no camera. It must render **every**
outcome from `RedemptionResult`, and `already_redeemed` must show the original timestamp and
scanner — that is V-05's acceptance criterion, not a nicety.

Demo path: `demoBackend.redeem(token)`. Live path: the `redeem_voucher()` Postgres function.

### Then: Edge Function adapters

`supabase/functions/checkout-session` and `stripe-webhook`. Per **AD-02** these must stay thin —
parse the request, build the real dependencies, call `@cvip/payments`, serialize the result. Tens
of lines each. If you find yourself adding branching logic to an adapter, it belongs in the core.

---

## 4. Things that will bite you if you don't know them

### pnpm is mandatory. npm will not work.

Expo SDK 52 is React 18; Next 15 is React 19. npm workspaces hoist one copy of each package and the
two majors collide three different ways (details in AD-01). Two `.npmrc` settings are load-bearing
and must not be removed:

- `node-linker=isolated`
- `hoist-pattern[]=!@types/react` and `!@types/react-dom` — otherwise pnpm hoists React 19's types
  into `.pnpm/node_modules`, TypeScript finds them when resolving from React Navigation's real
  paths, and an incompatible `ReactNode` leaks into the mobile type-check.

Shared packages need an explicit `@babel/runtime` dependency because Metro transpiles them and
isolated linking will not let them borrow it from an app.

### There is no Docker on this machine, and the tests don't need it.

`supabase start` will not run. The database suite uses plain PostgreSQL 17 plus
`supabase/tests/_harness.sql`, which stubs `auth.users`, `auth.uid()` and the Supabase roles. This
also means CI needs no Docker service.

```bash
brew services start postgresql@17   # if psql cannot connect
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
```

It is **not** a Supabase emulator. Storage policies and real Auth behaviour are not covered.

### RLS is the security boundary, not a convention.

Queries deliberately do **not** filter on `status = 'approved'`. `experiences_public_read` joins
through to the vendor's approval status (AD-10), so a forgotten filter cannot leak a draft. If you
add a query, do not "helpfully" add the filter back — instead make sure a negative test covers it.

`search_experiences()` is deliberately **not** `security definer`, and a test asserts
`prosecdef = false`. Making it a definer function would make every draft searchable while every
existing test still passed.

### Two guards you must not remove

- `guard_profile_privileges()` — stops a tourist setting their own `role` and walking into the
  admin console. RLS is per-row, and `role` lives on the row the user is allowed to edit.
- The unique index on `payments.stripe_event_id` — this, not handler discipline, is what makes
  T-05's "exactly once" true.

### Demo mode

Engages automatically when Supabase is unconfigured. Guard rails: real configuration always wins,
`APP_ENV=production` refuses it, and a banner sits above every screen. It runs the real pricing,
the real HMAC voucher codec and the real state machines — only storage differs.

**It is not verification.** M3 is not done because the demo works.

---

## 5. Commands

```bash
npx pnpm@9 install
```

```bash
pnpm verify
```

`verify` = typecheck + lint + test + db:test. Others: `pnpm db:concurrency` (16-way races on
`reserve_availability` and `redeem_voucher` — run after touching either), `pnpm bundle:mobile`,
`pnpm mobile`, `pnpm vendor` (:3001), `pnpm admin` (:3002).

Current state: **161 unit tests (11 files), 7/7 SQL files, concurrency green, both Next apps build,
iOS bundle 1004 modules.**

---

## 6. Decisions already made — do not relitigate

| ID | Decision |
|---|---|
| **OD-09** | **Display localized, settle in USD.** Every `*_minor` column is USD. Locked before M3 because reversing it later touches every monetary column. |
| **AD-01** | pnpm, not npm workspaces. |
| **AD-02** | Fat testable core (`packages/payments`) + thin Deno adapters. Refined, not reversed. |
| **AD-03** | `reserve_availability()` and `redeem_voucher()` are Postgres functions with `SELECT … FOR UPDATE`. Never move this into application code. |
| **AD-04** | QR carries only a version byte and a random 128-bit id, HMAC-signed. The DB stores `sha256(token)`, never the token. |
| **AD-10** | Public visibility is an RLS policy, not a query convention. |
| — | M3 scope includes the vendor QR scanner (moved from M4) so Journey A closes a milestone earlier. |

---

## 7. Open — the founder's calls, not yours

**Blocking M4:** **OD-02 — Stripe Connect at launch, or manual settlement during pilot?** If
Connect, vendor onboarding must embed the account-link and KYC flow. Escalated from "before first
payout" to "before M4" because discovering it mid-milestone means rebuilding the onboarding UI.

**Waiting on the founder:** the **hosted Supabase project**. They agreed to provision it; it had not
been done when this session ended. Instructions and a one-command script are ready:
[`supabase-provisioning.md`](supabase-provisioning.md) and `./scripts/db-push.sh`. The script
refuses a non-empty database rather than half-applying.

Still open: OD-01 (legal entity/MoR), OD-03 (tiers and commission), OD-04 (privacy and consent
copy — all placeholder text is marked `TODO-LEGAL`), OD-05 (maps and notification providers),
OD-06 (app-store vs Expo pilot). See [`open-decisions.md`](open-decisions.md).

---

## 8. Known gaps — do not claim these work

- **No hosted Supabase project.** Nothing has run end to end against a real backend.
- **Storage bucket policies unverified.** The storage migration no-ops outside Supabase.
- **Real Auth unverified.** The harness stubs `auth.users` and `auth.uid()`.
- **The PostgREST embedded-select in `loadExperience()` is unverified.** Only a real Supabase can
  execute that nested syntax. The relationships and their RLS are covered as plain SQL joins.
- **The mobile app has never been launched.** Bundling and type-checking are verified; a simulator
  run is not.
- **No images anywhere.** Media is stored as paths only. Sourcing properly-licensed Caribbean
  photography is an unstarted task with real legal exposure, and the release gate expects the seed
  to support an investor demonstration.
- **No map renders.** OD-05 is open, so `MAPS_PROVIDER` defaults to `mock` and Nearby ships as a
  distance-sorted list with an explicit notice.
- `pnpm audit` findings are all transitive **build-time** Expo dependencies, none in the shipped
  runtime path. Tracked for M8.

---

## 9. Working agreement that has served this build well

From the PRD's operating rules, and worth keeping:

- **Never claim something works without running it.** Every milestone records commands and results
  in the verification log in [`implementation-status.md`](implementation-status.md).
- **Write the negative tests in the milestone that introduces the schema.** Both security holes
  found so far — the privilege escalation and the search bypass — were caught by tests, not review.
- **Nothing is silently omitted.** Every requirement is `complete` / `partial` / `blocked` /
  `deferred` / `not started` in the traceability table.
- **Seeded content is labelled demo everywhere it appears**, including on cards and in screenshots.
- When a documented decision does not survive contact with reality, **change it and record why**
  (see AD-01 and AD-02).
