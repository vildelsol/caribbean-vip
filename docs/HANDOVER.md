# Handover — Caribbean VIP

**Written:** 2026-08-02 · **Working tree:** all gates green

Read this first, then [`PRD.md`](PRD.md) (product source of truth) and
[`architecture.md`](architecture.md) (the numbered decisions and why they were made).

---

## 1. What this is

Caribbean VIP — a mobile-first Caribbean tourism marketplace. Tourists discover and book verified
local excursions, receive geofenced offers, and hold QR vouchers that vendors scan to validate.
Jamaica is the deepest market; the Cayman Islands and Barbados are populated too.

**This is a separate project** from EGES/ComplyIQ and from Villaggio del Sol. Do not mix them.

Repository: `/Users/rogeanedwards/Desktop/caribbean Vip/caribbean-vip` (git, branch `master`).
The parent folder also holds the source PDF and a mockup image.

### The founder's standing instruction on the mockup

`ChatGPT Image Aug 2, 2026….png` is a **colour-scheme reference only**. Its VIP Cayman branding, its
four-tab navigation and its screen inventory are **not** requirements. The PRD governs: five tabs
with **Irie AI as the centre item**. The palette was sampled from it and lives in
`packages/ui/src/tokens.ts`.

---

## 2. Run the demo

No credentials, no Docker, no Supabase. Demo mode engages automatically when Supabase is
unconfigured.

```bash
npx pnpm@9 install
```

Tourist app in a browser (the easiest thing to put in front of someone):

```bash
npx pnpm@9 --filter @cvip/mobile web --port 8081
```

Vendor scanner, in a second terminal:

```bash
npx pnpm@9 --filter @cvip/vendor-web dev
```

### The walkthrough that shows the most in five minutes

1. **Explore** at `localhost:8081` — photography, prices, categories, all labelled demo.
2. **Choose a destination** → switch to Cayman or Barbados. The whole catalogue changes; the app
   name never does (PRD §3: one product, localized island brands).
3. Open a listing → **Check availability** → change the party size and watch the total re-quote.
   Every departure's remaining capacity is real, and the first future departure of every listing is
   deliberately seeded with **one seat**, so the sold-out path is always reachable.
4. **Pay** → confirmation with a booking reference → **Show my voucher** → QR.
5. Tap **"QR will not scan? Show the code"**, copy the token.
6. Paste it into the vendor portal at `localhost:3001` → **Valid — admit the guest**.
7. Paste it again → **Already redeemed**, showing the original time and who scanned it. This is
   V-05, and it is the single most convincing thing in the demo.
8. Change one character of the token → **Invalid signature**. The HMAC is genuinely checked.

**Reloading resets everything.** Demo state is in memory on purpose: a demo that accumulated
yesterday's bookings would stop being a clean walkthrough.

---

## 3. Where the build has got to

| Milestone | Status |
|---|---|
| First deliverable (docs) | complete |
| M0 — Repository foundation | complete |
| M1 — Auth and domain foundation | complete |
| M2 — Tourist discovery | complete |
| **M3 — Booking, Stripe, redemption** | **complete in demo mode** — see the gap below |
| M4–M8 | not started |

**T-01, T-02, T-03 complete. T-04, T-06, V-04, V-05 complete in demo mode. T-05 and T-09 partial:**
booking, capacity hold, cancellation and voucher invalidation all work, but **no Stripe payment has
ever been taken and no refund has ever been issued**, because the Edge Function adapters do not
exist. Full detail in [`traceability.md`](traceability.md).

Current gates: **174 unit tests (11 files), 7/7 SQL files, concurrency green, iOS bundle 4.33 MB,
both Next apps build.**

---

## 4. Pick up here

### First: the Edge Function adapters — this is what "demo mode" is standing in for

`supabase/functions/checkout-session` and `stripe-webhook`. Per **AD-02** these stay thin: parse the
request, build the real dependencies, call `@cvip/payments`, serialize the result. Tens of lines
each. If you find yourself adding branching logic to an adapter, it belongs in the core.

Then point `apps/mobile/lib/booking.ts` at them. That file is already shaped for it: the demo path
is complete and the live path returns one honest "not deployed" error from a single constant, so
there is exactly one place to change.

### Then: M4, the vendor portal proper

Onboarding, listings, availability, payouts. The scanner is already there and already the landing
page. **OD-02 blocks this** — see §7.

### Do not rewrite these — they exist and are tested

- Pricing: `calculateBookingTotal` in `@cvip/types`. The booking screen never sums anything itself.
- Vouchers: `signVoucherToken` / `verifyVoucherToken` / `hashVoucherToken` in `@cvip/types`.
- Redemption: `redeem_voucher()` in Postgres, and `demoBackend.redeemScannedToken` for the demo.
- Demo dispatch: everything routes on `isDemoMode`, the same way `lib/catalogue.ts` always has.

---

## 5. Things that will bite you if you don't know them

### pnpm is mandatory. npm will not work.

Expo SDK 52 is React 18; Next 15 is React 19. npm workspaces hoist one copy of each package and the
two majors collide three different ways (details in AD-01). Two `.npmrc` settings are load-bearing
and must not be removed:

- `node-linker=isolated`
- `hoist-pattern[]=!@types/react` and `!@types/react-dom`

That second one has a **sharp edge**: a third-party package whose own `.d.ts` does
`import * as React from "react"` then has nowhere to resolve React's types from, and the failure
surfaces as "cannot be used as a JSX component" at *your* call site, a long way from the cause.
`react-native-qrcode-svg` hit this. The fix is the `pnpm.packageExtensions` block in the root
`package.json` — declare the types dependency the package should have had. Do **not** re-hoist:
that fixes one package and re-breaks every app.

### Metro resolves optional dependencies that were never installed

`@supabase/supabase-js` optionally imports `@opentelemetry/api`. Node skips it; Metro walks it and
fails the whole bundle. `metro.config.js` resolves it to `lib/emptyModule.js`. Add to
`OPTIONAL_ABSENT` if another one appears.

### Bundled images need a frame, not an `aspectRatio`

A required asset carries intrinsic dimensions, and react-native-web writes those onto the element as
a pixel height that **beats** `aspectRatio` — a 1400×930 photo rendered a 930px-tall card. Put the
ratio on a wrapping `View` and let the `Image` fill it. Already done everywhere; copy the pattern.

### There is no Docker on this machine, and the tests don't need it

`supabase start` will not run. The database suite uses plain PostgreSQL 17 plus
`supabase/tests/_harness.sql`, which stubs `auth.users`, `auth.uid()` and the Supabase roles.

```bash
brew services start postgresql@17   # if psql cannot connect
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
```

It is **not** a Supabase emulator. Storage policies and real Auth behaviour are not covered.

### RLS is the security boundary, not a convention

Queries deliberately do **not** filter on `status = 'approved'`. `experiences_public_read` joins
through to the vendor's approval status (AD-10), so a forgotten filter cannot leak a draft. If you
add a query, do not "helpfully" add the filter back — instead make sure a negative test covers it.

`search_experiences()` is deliberately **not** `security definer`, and a test asserts
`prosecdef = false`. Making it a definer function would make every draft searchable while every
existing test still passed.

### Three guards you must not remove

- `guard_profile_privileges()` — stops a tourist setting their own `role`.
- The unique index on `payments.stripe_event_id` — this, not handler discipline, is what makes
  T-05's "exactly once" true.
- The **negative fixtures**: a draft listing, an approved listing under an unapproved vendor, and an
  inactive island (Antigua). Each exists so a security test has a subject. Deleting one makes its
  test pass vacuously — which is worse than deleting the test.

### The demo dataset and the SQL seed are kept in step deliberately

`packages/demo/src/dataset.ts` and `supabase/seed/seed.sql` carry the same islands, vendors,
listings and photography. Change one, change the other, so that switching between demo mode and a
real backend changes where the data comes from and not what the app shows.

### Demo mode is not verification

It engages automatically when Supabase is unconfigured. Guard rails: real configuration always wins,
`APP_ENV=production` refuses it, and a banner sits above every screen. It runs the real pricing, the
real HMAC voucher codec and the real state machines — only storage differs.

**M3 is not done because the demo works.** No payment has been taken.

---

## 6. Photography — read before adding any

All 57 images are Wikimedia Commons files under CC0 / CC BY / CC BY-SA / public domain, downloaded
into `apps/mobile/assets/demo` by `scripts/seed-media/fetch.py`. To add or change one, edit
`scripts/seed-media/manifest.json` and re-run the script. It **refuses to write anything** if a
licence is outside the accepted list.

Two rules that are not optional:

- **Attribution ships with the image.** CC BY and CC BY-SA require credit wherever the work appears,
  so the author and licence render on the card and under the gallery — not only in
  [`media-credits.md`](media-credits.md). A test fails if a media key has no credit.
- **`subject` says what the photograph actually shows.** Some listings are illustrated with a
  representative photograph of the right island rather than of that exact operator. Naming the true
  subject on screen is what keeps that honest.

This is demonstration content. Sourcing commissioned or licensed photography of the actual vendors
is still an open task before anything ships to the public.

---

## 7. Open — the founder's calls, not yours

**Blocking M4:** **OD-02 — Stripe Connect at launch, or manual settlement during pilot?** If
Connect, vendor onboarding must embed the account-link and KYC flow. Escalated from "before first
payout" to "before M4" because discovering it mid-milestone means rebuilding the onboarding UI.

**Waiting on the founder:** the **hosted Supabase project**. Instructions and a one-command script
are ready: [`supabase-provisioning.md`](supabase-provisioning.md) and `./scripts/db-push.sh`. The
script refuses a non-empty database rather than half-applying. Nothing blocks the demo — but
everything about *real* payments blocks on this.

Still open: OD-01 (legal entity/MoR), OD-03 (tiers and commission), OD-04 (privacy and consent copy
— all placeholder text is marked `TODO-LEGAL`), OD-05 (maps and notification providers), OD-06
(app-store vs Expo pilot). See [`open-decisions.md`](open-decisions.md).

---

## 8. Known gaps — do not claim these work

- **No payment has ever been taken.** The whole Stripe path is untested against Stripe.
- **No hosted Supabase project.** Nothing has run end to end against a real backend.
- **Storage bucket policies unverified.** The storage migration no-ops outside Supabase.
- **Real Auth unverified.** The harness stubs `auth.users` and `auth.uid()`.
- **The PostgREST embedded-select in `loadExperience()` is unverified.** Only a real Supabase can
  execute that nested syntax.
- **Live media does not render.** Demo images are bundled; real listings store Storage paths and
  there is no signed-URL fetching, so a live card renders text-only rather than a broken image.
- **The mobile app has never been launched on a device or simulator.** It bundles, type-checks, and
  runs in a browser — that is all.
- **The vendor demo scanner adopts an unknown-but-validly-signed token.** It has to: the portal runs
  in a different browser from the phone, so a real voucher is genuinely unknown to it. The signature
  is really checked and the terminal-state machine is really run; only the "have I seen this before"
  lookup is local. A real deployment never takes that path. See the comment on
  `redeemScannedToken`.
- **No map renders.** OD-05 is open, so `MAPS_PROVIDER` defaults to `mock`.
- `pnpm audit` findings are all transitive **build-time** Expo dependencies. Tracked for M8.

---

## 9. Commands

```bash
pnpm verify
```

`verify` = typecheck + lint + test + db:test. Others: `pnpm db:concurrency` (16-way races on
`reserve_availability` and `redeem_voucher` — run after touching either), `pnpm bundle:mobile`,
`pnpm mobile`, `pnpm vendor` (:3001), `pnpm admin` (:3002).

---

## 10. Working agreement that has served this build well

From the PRD's operating rules, and worth keeping:

- **Never claim something works without running it.** Every milestone records commands and results
  in the verification log in [`implementation-status.md`](implementation-status.md).
- **Write the negative tests in the milestone that introduces the schema.** Every security hole
  found so far was caught by tests, not review.
- **Nothing is silently omitted.** Every requirement is `complete` / `partial` / `blocked` /
  `deferred` / `not started` in the traceability table — and "complete in demo mode" is written out
  in full rather than shortened to "complete".
- **Seeded content is labelled demo everywhere it appears**, including on cards and in screenshots.
- When a documented decision does not survive contact with reality, **change it and record why**
  (see AD-01 and AD-02).
