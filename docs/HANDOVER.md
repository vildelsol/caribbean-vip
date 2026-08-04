# Handover — Caribbean VIP

**Written:** 2026-08-02 · **Updated:** 2026-08-04 (Irie itinerary builder; contextual Ask Irie) · **Branch:** `master` · **Gates:** all green

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

That starts both apps and prints their URLs: the tourist app on `http://localhost:5173` and the
vendor scanner on `http://localhost:3001`. Ctrl+C stops both. Use your browser's phone viewport for
the tourist app.

Individually, if you prefer: `pnpm tourist` and `pnpm vendor`.

> **The tourist app is `apps/tourist-web`** — React + TypeScript on Vite, deployable to Vercel or
> Netlify. The Expo app that used to hold this role was retired on 2026-08-03; the reasoning is in
> [`.archive/README.md`](../.archive/README.md).

### The walkthrough

> **Out of date.** This describes the retired Expo app. The web app's journey now runs end to
> end: Explore → island switch → Nearby → simulated geofenced offer → save voucher → detail →
> date/party selection → simulated payment → confirmation → Trips → QR ticket → redemption →
> second scan refused. Search is the one screen not rebuilt. §5 has the current position.

1. **Welcome** — crest, "Continue as Guest".
2. **Explore** — greeting, destination selector, category tiles, Nearby Discoveries, rated cards.
3. **Choose a destination** → switch island. The catalogue changes; the product name never does.
4. Tap any listing on Nearby → the **rum-punch offer popup** fires (once per island) → dismiss or
   save the voucher → the next tap goes straight to the listing → **Check Availability**.
5. Pick a day and time, set the party size, watch the total re-quote → **Continue to payment** →
   **Pay**.
6. **Booking Confirmed** → **View my ticket** → QR.
7. To demonstrate the vendor side, navigate to `/#/staff/redeem` (this route is **not linked from
   the customer journey** — no bottom nav, no button on the ticket). Paste or type a ticket token.
8. **Validate** → **Valid — admit the guest**.
9. Validate the same token again → **Already redeemed**, with the original time and scanner. This
   is V-05 and it is the most convincing thing in the demo.
10. **Tamper with one character** → **Invalid signature**.

**In the web app, reloading resets nothing.** State is persisted to LocalStorage on purpose, so a
refresh mid-presentation cannot lose a booking. Profile → *Reset the demonstration* puts it back.
(The retired Expo app worked the opposite way, and its walkthrough above says so.)

---

## 3. Where the build has got to

| Milestone | Status |
|---|---|
| M0 — Repository foundation | complete |
| M1 — Auth and domain foundation | complete |
| M2 — Tourist discovery | complete |
| **M3 — Booking, Stripe, redemption** | **complete in demo mode** — see §8 |
| M4–M8 | not started |

**T-01 and T-02 complete. T-03 regressed** — the rule and its tests hold, but the Search screen that
exercised them was retired with the Expo app and is not rebuilt. **T-04, T-06, V-04, V-05 complete in
demo mode. T-05 and T-09 partial:**
booking, capacity hold, cancellation and voucher invalidation all work, but **no Stripe payment has
ever been taken and no refund has ever been issued**. Detail in [`traceability.md`](traceability.md).

Gates: **251 unit tests (13 files), 7/7 SQL files, typecheck and lint clean across 9 workspaces.**

---

## 4. The design — read this before touching UI

> **Superseded, 2026-08-03.** The governing design is now the **Caribbean VIP Journey**, archived
> at [`design-source/Screen.dc.html`](design-source/Screen.dc.html) and documented in
> [`design.md`](design.md). It replaces everything in this section, and reverses two of its
> rulings on purpose: teal returns as *ocean teal* (location, distance, discovery), and
> single-column-everywhere is relaxed to allow image-led two-up tiles. **Seven of the new
> design's thirteen text pairings failed WCAG AA as drawn** — see design.md for the fill/text
> split that resolves it.
>
> The rest of this section is kept as the record of what governed before, and why.

There are four images in the parent folder and they do **not** all agree. Standing at the time:

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
  `apps/tourist-web/src/components/kit.tsx`.
- **Launch market.** **Jamaica is the MVP focus.** Cayman and Barbados stay populated and selectable
  because island-awareness is the thing an investor demonstration most needs to show, but they are
  not the MVP target.
- **Sequencing.** **Aesthetic first on demo mode, real backend after.** See §7 for what a real MVP
  is blocked on.

---

## 5. Pick up here

### The 2026-08-03 design pass — what changed

The build had drifted a long way from the mockup and the whole visual layer was redone against it.
Full detail in [`design.md`](design.md); the four that mattered most:

1. **No font size or weight had ever been applied.** `typography` tokens exposed `size`/`weight`,
   which React Native ignores in silence, and they are spread into `Text` styles in ~180 places.
   Every screen rendered at the platform default. This one defect accounts for most of the distance
   between the build and the mockup, and there is now a regression test for it.
2. **The chrome was green; the mockup's is ivory** (`#FCF9F4`) — nav bar, status bar, backgrounds.
3. **The palette was averaged, not sampled.** Every colour is re-derived from the mockup by modal
   sampling of flat regions.
4. **Turquoise is not in the mockup's interface.** `semantic.accent` is deep green now.

Also: Playfair Display and DM Sans are bundled; the crest is translucent with a double gold ring and
serif lettering; icons are Feather line icons rather than emoji and text glyphs; the demo-mode
banner is a hairline strip rather than a two-line gold slab.

**One real bug was found and fixed by this work:** the welcome screen's gradient scrim passed
`pointerEvents` as a prop. react-native-web deprecated that form and `expo-linear-gradient` does not
forward it, so the scrim covered the screen and swallowed every tap — both buttons were dead. It is
a style, never a prop. See §6.

### The second design pass — the remaining screens

> **This section is the record of the retired Expo app** — the `app/…` paths below are
> `.archive/mobile`. Everything here was built *there*. Most of it was rebuilt in `apps/tourist-web`;
> **Search was not**, which is why T-03 is `regressed` rather than complete. Do not read the Search
> entry below as describing something that exists today.

Every tourist screen is now drawn to the mockups. Built in this pass:

- **Interests** (`app/interests.tsx`) — the eight-tile step between Welcome and Explore. It
  **ranks, it does not filter** (`lib/interests.ts`), and there is a test for that: a first-run
  screen that quietly removes half the catalogue is a trap the guest cannot diagnose.
- **Select Destination** — "Where are you going?", the tinted Use My Location card, photo rows.
  It hands off to Nearby rather than running its own permission flow (PRD §14).
- **Search** — pill field with a filter control, category chips, result count, single-column rows.
  Sort moved inside Filters, where the mockup puts it.
- **Irie AI** — the full chat UI. **There is no model behind it**; see below.
- **Nearby** — skeletons, an empty state, and the same row card. Still blocked on OD-05 for a map.

**Single column everywhere.** Ro's call, and the right one: two 48%-wide cards side by side left a
phone with two columns of clipped titles and thumbnails too small to read. `ExperienceCard`'s
default variant is now `row`. `grid` survives only inside an Irie AI answer, where a sideways
carousel of three small cards is the intent rather than an accident of layout.

**Irie AI is gold-on-green, everywhere.** The concierge's mark is a cluster of gold four-point
stars on deep green, and it is the motif that carries Irie across the whole journey rather than
only on its own tab: `IrieStars` and `IrieAvatar` in the kit, the centre nav badge (green disc, gold
ring, gold stars, gold label *inside* the circle), the gold star that opens the greeting on Explore,
the avatar beside every assistant bubble, and the star on an "Irie Tip". The badge was built
inverted — a gold disc with a green sparkle — which threw the motif away. Gold on green, never the
reverse. The selected tab also carries a gold hairline ring, as the mockup draws it.

**Chat bubbles:** assistant turns are white, bordered, avatared; user turns are deep green, right
aligned, unavatared. That asymmetry is what makes the transcript readable at a glance.

**Green is an accent, not just chrome.** The mockup sets prices, "View All" and the selected tab in
a saturated `#1F7A5C` — 5.0:1 on ivory. "View All" was gold text at 2.3:1, which was a muddy smear;
it is now a green outlined pill. Rating stars are true amber `#FFA100` (decorative — the numeric
rating beside them carries the meaning).

### Irie AI is a guided demo, not a model

`app/(tabs)/irie.tsx` + `lib/irie.ts`. Answers are matched by rule and every card comes from the
same RLS-governed catalogue query as the rest of the app, so it cannot name a listing that does not
exist or invent a price — the M7 requirements hold by construction rather than by prompt. The
screen says **GUIDED DEMO** in its header, every time it is opened. When the real model lands it
goes *in front* of this, and this stays behind it as the "falls back to normal search" path.

### Where this stopped

Both design passes are **committed** as of 2026-08-03, after a review pass that pulled five
hand-mixed tint colours out of three screens and into tokens. Bringing them under `tokens.test.ts`
found three of them failing AA — see the tints section of [`design.md`](design.md). Gates after:
**214 tests (12 files), 7/7 SQL, typecheck and lint clean.**

Post-M2 cleanup (also 2026-08-03):

- **Staff redemption moved to `/staff/redeem`**, a separate route with no bottom nav. The customer
  ticket screen no longer has a "Staff: validate this ticket" button — a presenter navigates to the
  staff route directly; a customer never sees it.
- **The rum-punch offer now also triggers from Nearby.** Tapping any listing card on the Nearby
  screen fires the offer (once per island, same gate as the Explore timer). The second tap goes
  straight to the experience detail.

### The itinerary builder, and Irie in context (2026-08-04)

Both of the first two ideas below are now built.

**`data/itinerary.ts`** composes a day: timed stops, the travel between them, per-stop quotes and a
running estimate. It is **pure** — no React, no store, no clock beyond the date it is given — which
is why all of its judgement is unit tested (37 cases) while the screen rendering it is not. The
three properties that matter each have a test: it composes only from `visibleExperiences()`, so
Irie cannot put a draft listing or one under an unapproved vendor on a guest's day; it never sums a
total itself, quoting every suggestion through `priceFor` and taking the frozen `totalMinor` for
anything already booked; and it never places a departure the party would not fit on.

**"Ask Irie" on the experience detail page already existed as a bare link to the tab**, which left
the guest to re-ask about the listing they were already looking at. It now carries the listing id in
router state, and Irie builds the day *around* it and answers whether it fits. Consumption is
guarded by a ref as well as by clearing the router state — StrictMode double-invokes the effect in
development, and without the ref the question and its whole itinerary posted twice.

Four things this work surfaced, all fixed, and all worth knowing before touching it:

1. **Location lives on the vendor, not the listing.** Dunn's River Falls Climb and Mystic Mountain
   are both `vendor-dunns`, so the distance between them is genuinely 0 m. That rendered as
   "1 min walk · 0 m". `Arrival` is now a two-case union and the same-operator case reads
   "Same site — no transfer".
2. **Confirmed bookings can clash with each other**, and the first version placed them as fixed
   points without ever checking them against one another — the demo state has two bookings both at
   09:00 with a 374-minute drive between them, presented as a day that "flows". Both are still
   shown, the clash is marked in coral, and the headline leads with it. **Never drop a booking the
   guest paid for to make the plan look tidy.**
3. **First fit by distance let one all-day listing swallow the window.** "Plan my whole day" in
   Cayman returned a single eight-hour beach club. The fit is now two passes: anything longer than
   a fair share of the window waits until the shorter stops are placed. The anchor and anything
   already planned skip the filter — they were asked for.
4. **A "full day" honestly yields two or three stops, not four.** Ocho Rios has four listings, one
   per category, and nothing else on the island is reachable in the gap. That is the builder
   working. The screen states the shortfall rather than padding it.

Gates after: **251 tests (13 files), 7/7 SQL, typecheck and lint clean.**

Ideas raised but not started, in the order I would take them:

1. **Search (T-03)** — still `regressed`. The Expo app had a built Search screen (pill field, filter
   control, category chips, result count); the web app does not, and Nearby filters by category
   instead. This is a port from `.archive/`, not a design job, and it flips a traceability row back
   to complete.
2. **Vendor portal visual language** — functional, no visual language. Next up, per Ro.
3. **Commissioned photography** — see §8. The biggest single gap between this and a product.

### Still not drawn to the mockups

1. **Search** — not rebuilt in the web app at all; Nearby filters by category instead. T-03.
2. **Vendor portal** — functional, no visual language. Next up, per Ro.
3. **Map view** — blocked on OD-05; ships as a distance-sorted list with an explicit notice.

### Then: the Edge Function adapters

`supabase/functions/checkout-session` and `stripe-webhook`. Per **AD-02** they stay thin: parse,
build dependencies, call `@cvip/payments`, serialize. Then point the web app's booking path at
them — the demo path is complete and the live path returns one honest "not deployed" error from a
single constant, so there is exactly one place to change.

### Do not rewrite these — they exist and are tested

- Pricing: `calculateBookingTotal` in `@cvip/types`. No screen sums a total itself.
- Vouchers: `signVoucherToken` / `verifyVoucherToken` / `hashVoucherToken`.
- Redemption: `redeem_voucher()` in Postgres; `demoBackend.redeemScannedToken` for the demo.
- The UI kit: `apps/tourist-web/src/components/kit.tsx`. Add to it rather than restyling in a screen.

---

## 6. Things that will bite you

### pnpm is mandatory. npm will not work.

Expo SDK 52 is React 18; Next 15 is React 19 (AD-01). Two `.npmrc` settings are load-bearing:
`node-linker=isolated`, and `hoist-pattern[]=!@types/react` / `!@types/react-dom`.

That second one has a sharp edge: a third-party package whose own `.d.ts` does
`import * as React from "react"` then cannot resolve React's types, and it surfaces as "cannot be
used as a JSX component" at *your* call site. `react-native-qrcode-svg` hit this, and so did
`expo-linear-gradient`. Fix is the `pnpm.packageExtensions` block in the root `package.json` — add
the package there and re-install. Do **not** re-hoist — that fixes one package and re-breaks every
app.

Related: `pnpm add` resolves to the package's latest major, which for Expo modules is wrong. Install
`expo-font@~13.0.4` and `expo-linear-gradient@~14.0.2` for SDK 52; the unpinned versions install
`57.x`, which bundles and then renders nothing.

### `pointerEvents` is a style, not a prop

react-native-web deprecated `props.pointerEvents`, and `expo-linear-gradient` does not forward it.
A full-bleed `<LinearGradient pointerEvents="none">` therefore sits over the screen and swallows
every tap beneath it, with no error and only a deprecation warning in the console. This shipped on
the welcome screen and made both buttons dead. Always `style={{ ..., pointerEvents: 'none' }}`.

### react-native-web renders a Modal into the page's own stacking context

An absolutely-positioned bar on the screen behind will paint *over* a modal. The experience detail
page hides its sticky action bar while the offer popup is open rather than fighting z-index.

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
`.archive/mobile/lib/localCurrency.ts` and are not yet reinstated in the web app, are never in the
database, and never take part in a calculation
that leads to a charge.

---

## 7. Open — the founder's calls, not yours

**A presentation login exists, and it is not a backend.** `lib/demoAccount.ts` —
`demo@caribbeanvip.test` / `IrieDemo2026`, printed on the sign-in screen with a one-tap button. It
signs in a *persona* (`Alex Bennett`) so the walkthrough can show the authenticated half of the
product. There is no server to authenticate against; the credentials unlock an in-memory object.
The path is hard-gated on `isDemoMode && !isSupabaseConfigured`, so it can never stand in for real
auth once a backend exists, and `demoAccount.test.ts` asserts both that gate and that the persona is
a tourist rather than a vendor or admin.

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
