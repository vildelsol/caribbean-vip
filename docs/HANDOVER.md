# Handover — Caribbean VIP

**Written:** 2026-08-02 · **Branch:** `master` · **Gates:** all green

Read this first, then [`PRD.md`](PRD.md) (product source of truth),
[`architecture.md`](architecture.md) (the numbered decisions), and
[`design.md`](design.md) (the visual language and where it came from).

---

## 1. What this is

Caribbean VIP — a mobile-first Caribbean tourism marketplace. Tourists discover and book verified
local excursions, receive geofenced offers, and hold QR vouchers that vendors scan to validate.

**This is a separate project** from EGES/ComplyIQ and from Villaggio del Sol. Do not mix them, and
do not put scratch or working files for this project under another project's path.

Repository: `/Users/rogeanedwards/Desktop/caribbean Vip/caribbean-vip`. The parent folder holds the
source PDF and **four mockup images** — see §4, because which one governs has changed.

---

## 2. Run it

No credentials, no Docker, no Supabase. Demo mode engages automatically when Supabase is
unconfigured.

```bash
npx pnpm@9 install
```

```bash
npx pnpm@9 demo
```

That starts both apps and prints their URLs: the tourist app on `http://localhost:8081` and the
vendor scanner on `http://localhost:3001`. Ctrl+C stops both. Use your browser's phone viewport for
the tourist app.

Individually, if you prefer: `pnpm --filter @cvip/mobile web --port 8081` and `pnpm vendor`.

### The walkthrough

1. **Welcome** — crest, "Continue as Guest".
2. **Explore** — greeting, destination selector, category tiles, Nearby Discoveries, rated cards.
3. **Choose a destination** → switch island. The catalogue changes; the product name never does.
4. Open a listing → the **rum-punch offer popup** fires → **Check Availability**.
5. Pick a day and time, set the party size, watch the total re-quote → **Continue to payment** →
   **Pay**.
6. **Booking Confirmed** → **View my ticket** → QR.
7. Tap **"QR will not scan? Show the code"**, copy the token.
8. Paste it into the vendor portal → **Valid — admit the guest**.
9. Paste it again → **Already redeemed**, with the original time and scanner. This is V-05 and it is
   the most convincing thing in the demo.
10. Change one character → **Invalid signature**.

**Reloading resets everything.** Demo state is in memory on purpose. Don't reload between booking
and scanning.

---

## 3. Where the build has got to

| Milestone | Status |
|---|---|
| M0 — Repository foundation | complete |
| M1 — Auth and domain foundation | complete |
| M2 — Tourist discovery | complete |
| **M3 — Booking, Stripe, redemption** | **complete in demo mode** — see §8 |
| M4–M8 | not started |

**T-01, T-02, T-03 complete. T-04, T-06, V-04, V-05 complete in demo mode. T-05 and T-09 partial:**
booking, capacity hold, cancellation and voucher invalidation all work, but **no Stripe payment has
ever been taken and no refund has ever been issued**. Detail in [`traceability.md`](traceability.md).

Gates: **174 unit tests (11 files), 7/7 SQL files, concurrency green, iOS bundle 4.33 MB, both Next
apps build.**

---

## 4. The mockups — read this before touching UI

There are four images in the parent folder and they do **not** all agree. Current standing:

| Mockup | Status |
|---|---|
| `…12_45_42 AM.png` — VIP Cayman customer journey | **The aesthetic that governs.** Ro: "this flow design, colour palette, features is preferred, this is the aesthetic I want." |
| `…07_39_21 PM.png`, `…07_39_37 PM.png`, `…07_39_47 PM.png` — Caribbean VIP | **The screen inventory and flow that govern.** Twelve screens, Jamaica content, five-tab nav. |

The earlier ruling — "the mockup is a colour reference only, the PRD governs" — **no longer
applies** and has been superseded. The mockups now drive layout and visual language.

### Conflicts, and how they were resolved (Ro's calls, 2026-08-02)

- **Navigation.** The VIP Cayman mockup shows four tabs and no Irie AI. **Resolved: five tabs with
  Irie AI centred**, per the PRD and the later mockups. Nothing in the aesthetic depended on it.
- **Branding.** The VIP Cayman mockup renames the app per island. **Resolved: one crest, always the
  same mark, with the island name beneath it** — "VIP JAMAICA", "VIP CAYMAN". That satisfies the
  luxe treatment and PRD §3 ("the app is never renamed per island") at once. See `Crest` in
  `apps/mobile/components/kit.tsx`.
- **Launch market.** **Jamaica is the MVP focus.** Cayman and Barbados stay populated and selectable
  because island-awareness is the thing an investor demonstration most needs to show, but they are
  not the MVP target.
- **Sequencing.** **Aesthetic first on demo mode, real backend after.** See §7 for what a real MVP
  is blocked on.

---

## 5. Pick up here

### Still to bring up to the mockups

These screens work but are not yet drawn to the mockups. Roughly in value order:

1. **Irie AI** (`app/(tabs)/irie.tsx`) — still a milestone placeholder. Mockups show a full chat UI:
   mascot header, greeting bubble, suggestion chips (Under $50, Family Fun, Rainy Day), result
   cards, an "Irie Tip" callout, and an itinerary builder. It is the centre tab and currently the
   emptiest screen in the app.
2. **Search results** — restyle to the mockups' row cards with hearts and a filter bar.
3. **Select Destination** — the mockups' "Where are you going?" with photo rows and "Use My
   Location".
4. **Interests** — the eight-tile onboarding step between Welcome and Explore. Not built at all.
5. **Nearby / Map** — blocked on OD-05; ships as a distance-sorted list with an explicit notice.
6. **Vendor portal** — functional but has none of the visual language.

### Then: the Edge Function adapters

`supabase/functions/checkout-session` and `stripe-webhook`. Per **AD-02** they stay thin: parse,
build dependencies, call `@cvip/payments`, serialize. Then point `apps/mobile/lib/booking.ts` at
them — the demo path is complete and the live path returns one honest "not deployed" error from a
single constant, so there is exactly one place to change.

### Do not rewrite these — they exist and are tested

- Pricing: `calculateBookingTotal` in `@cvip/types`. No screen sums a total itself.
- Vouchers: `signVoucherToken` / `verifyVoucherToken` / `hashVoucherToken`.
- Redemption: `redeem_voucher()` in Postgres; `demoBackend.redeemScannedToken` for the demo.
- The UI kit: `apps/mobile/components/kit.tsx`. Add to it rather than restyling in a screen.

---

## 6. Things that will bite you

### pnpm is mandatory. npm will not work.

Expo SDK 52 is React 18; Next 15 is React 19 (AD-01). Two `.npmrc` settings are load-bearing:
`node-linker=isolated`, and `hoist-pattern[]=!@types/react` / `!@types/react-dom`.

That second one has a sharp edge: a third-party package whose own `.d.ts` does
`import * as React from "react"` then cannot resolve React's types, and it surfaces as "cannot be
used as a JSX component" at *your* call site. `react-native-qrcode-svg` hit this. Fix is the
`pnpm.packageExtensions` block in the root `package.json`. Do **not** re-hoist — that fixes one
package and re-breaks every app.

### Metro resolves optional dependencies that were never installed

`@supabase/supabase-js` optionally imports `@opentelemetry/api`. Node skips it; Metro fails the
bundle. `metro.config.js` resolves it to `lib/emptyModule.js`. Add to `OPTIONAL_ABSENT` if another
appears.

### Bundled images need a ratio frame, not `aspectRatio`

A required asset carries intrinsic dimensions, and react-native-web writes those on as a pixel
height that **beats** `aspectRatio` — a 1400×930 photo rendered a 930px-tall card. Use the `Photo`
component in the kit; it does this correctly.

### Hooks before early returns

The Explore screen redirects to Welcome on first launch. That `if` sits **after every hook** on
purpose — an early return above a `useMemo` breaks the rules of hooks the moment onboarding is
dismissed. It was written wrong once and caught in review.

### No Docker, and the tests don't need it

`supabase start` will not run. The database suite uses plain PostgreSQL 17 plus
`supabase/tests/_harness.sql`, which stubs `auth.users`, `auth.uid()` and the Supabase roles.

```bash
brew services start postgresql@17
```

It is **not** a Supabase emulator. Storage policies and real Auth behaviour are not covered.

### RLS is the security boundary, not a convention

Queries deliberately do **not** filter on `status = 'approved'` — `experiences_public_read` joins
through to the vendor's approval status (AD-10). If you add a query, do not "helpfully" add the
filter back; make sure a negative test covers it. `search_experiences()` is deliberately not
`security definer`, and a test asserts `prosecdef = false`.

### Guards and fixtures you must not remove

- `guard_profile_privileges()` — stops a tourist setting their own `role`.
- The unique index on `payments.stripe_event_id` — this is what makes T-05's "exactly once" true.
- The **negative fixtures**: a draft listing, an approved listing under an unapproved vendor, and an
  inactive island (Antigua). Each exists so a security test has a subject. Deleting one makes its
  test pass vacuously, which is worse than deleting the test.

### The demo dataset and the SQL seed are kept in step deliberately

`packages/demo/src/dataset.ts` and `supabase/seed/seed.sql` carry the same islands, vendors,
listings and photography. Change one, change the other.

### Money

Every `*_minor` column is **USD** (OD-09). The "≈ JAM $11,700" figures are display only, live in
`apps/mobile/lib/localCurrency.ts`, are never in the database, and never take part in a calculation
that leads to a charge.

---

## 7. Open — the founder's calls, not yours

**Blocking a real MVP**, all three needed together:

1. **A hosted Supabase project.** Instructions and a one-command script are ready:
   [`supabase-provisioning.md`](supabase-provisioning.md) and `./scripts/db-push.sh`. The script
   refuses a non-empty database rather than half-applying.
2. **Stripe test-mode keys.** Ro sets these up; they cannot be created from here.
3. **OD-02 — Stripe Connect at launch, or manual settlement during the pilot?** If Connect, vendor
   onboarding must embed the account-link and KYC flow, which changes M4's UI.

Still open: OD-01 (legal entity/MoR), OD-03 (tiers and commission), OD-04 (privacy and consent copy
— placeholder text is marked `TODO-LEGAL`), OD-05 (maps and notification providers), OD-06
(app-store vs Expo pilot). See [`open-decisions.md`](open-decisions.md).

---

## 8. Known gaps — do not claim these work

- **No payment has ever been taken.** The whole Stripe path is untested against Stripe.
- **No hosted Supabase project.** Nothing has run end to end against a real backend.
- **Storage bucket policies and real Auth are unverified.** The harness stubs them.
- **The PostgREST embedded-select in `loadExperience()` is unverified.** Only a real Supabase can
  execute that nested syntax.
- **Live media does not render.** Demo images are bundled; real listings store Storage paths and
  there is no signed-URL fetching.
- **The mobile app has never been launched on a device or simulator.** It bundles, type-checks and
  runs in a browser — that is all.
- **The vendor demo scanner adopts an unknown-but-validly-signed token.** It has to: the portal runs
  in a different browser from the phone. The signature is really checked and the terminal-state
  machine really runs; only the "have I seen this before" lookup is local. A real deployment never
  takes that path. See the comment on `redeemScannedToken`.
- **Ratings are demo-only.** Real ratings aggregate over the `reviews` table; nothing computes that
  yet, so a live card shows no rating rather than a fabricated one.
- **No map renders.** OD-05 is open.
- **Photography is placeholder.** Freely licensed and correctly attributed, but it is not the actual
  vendors. Commissioned or licensed photography is still needed before anything ships publicly. See
  [`media-credits.md`](media-credits.md) and `scripts/seed-media/README.md`.

---

## 9. Commands

```bash
pnpm verify
```

`verify` = typecheck + lint + test + db:test. Others: `pnpm demo` (both apps), `pnpm db:concurrency`
(16-way races on `reserve_availability` and `redeem_voucher` — run after touching either),
`pnpm bundle:mobile`, `pnpm vendor` (:3001), `pnpm admin` (:3002).

---

## 10. Working agreement that has served this build well

- **Never claim something works without running it.** Every milestone records commands and results
  in the verification log in [`implementation-status.md`](implementation-status.md).
- **Write the negative tests in the milestone that introduces the schema.** Every security hole
  found so far was caught by tests, not review.
- **Nothing is silently omitted.** Every requirement is `complete` / `partial` / `blocked` /
  `deferred` / `not started` — and "complete in demo mode" is written out in full rather than
  shortened to "complete".
- **Seeded content is labelled demo everywhere it appears.**
- When a documented decision does not survive contact with reality, **change it and record why**
  (see AD-01, AD-02, and §4 of this document).
