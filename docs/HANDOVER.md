# Handover — Caribbean VIP

**Written:** 2026-08-02 · **Updated:** 2026-09-21 (M3 backend deployed and individually verified; design fixes applied against Caribbean VIP Journey spec) · **Branch:** `main` · **Gates:** all green (290 tests)

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
> second scan refused. **Search is rebuilt** (the Explore pill opens it), and **Nearby's distances
> use the device's real position** when you allow it. §5 has the current position.
>
> Two additions worth showing deliberately, because they are the differentiators and both are real:
> **Irie AI → "Plan my whole day"** composes a timed itinerary with travel between stops and a
> running estimate; and **Nearby → "Use my location"** switches every distance to the real device
> fix. Away from the Caribbean it says so and falls back — that is designed behaviour, not a fault.

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
| **M3 — Booking, Stripe, redemption** | **all backend pieces deployed; Vercel + E2E test pending** — see §5 |
| M4–M8 | not started |

**T-01, T-02 complete. T-03, T-04, T-06, V-04, V-05 complete in demo mode. T-05 and T-09 partial:**
booking, capacity hold, cancellation and voucher invalidation all work. **The real Stripe/Supabase
path is now wired but has not yet been tested end-to-end** — see §5 pick-up point and §8.

Gates: **290 unit tests (17 files), typecheck and lint clean across 9 workspaces.**

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

> ### Read this before starting anything: what is being built right now
>
> **The target is the investor demonstration, not a working backend.** Ro's call, 2026-09-10, and it
> decides what is and is not worth doing.
>
> On that day a full async data layer was started — a `CatalogueSource` port with demo and Supabase
> adapters, replacing the synchronous `@cvip/demo` reads that every screen does. It got about 60% of
> the way and was **deliberately reverted**, because it is worth nothing for a demonstration: when
> finished the app would have looked identical. It is the right first move the day a real backend
> matters, and the reasoning is in §7. Do not restart it without checking that the target has changed.
>
> What *is* worth doing for a demonstration, in order: **the vendor portal's visual language**, then
> **photography of the actual operators**. Nobody in a pitch will know whether the catalogue came
> from Postgres or a TypeScript file. Everyone will notice the images are not the real vendors.
>
> Two things the founder named as the moats, both of which must therefore *work* rather than be
> mocked: **geolocation** (done, 2026-09-10 — see below) and **Irie AI** (still a guided demo, see
> the open question at the end of this section).

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

### Search is rebuilt (2026-09-10) — T-03 closed

`screens/Search.tsx`, reached from the Explore pill (which used to navigate to Nearby — that was the
whole of the regression). Pill field with a filter control, a category rail, a result count that
names the destination, and sort inside Filters where the design puts it.

**None of its logic is new**, which is why it took an afternoon: filtering and sorting run through
`applyFilters`/`sortResults` in `@cvip/types` — the same functions the server path will call, already
covered by 27 unit tests. It filters *as you type* rather than on submit; the Expo screen waited for
a return key because every keystroke was a round trip, and an island held in memory is about twenty
listings.

**`data/search.ts` holds the candidate set, and the screen and its test both import it.** That is
deliberate: the whole of T-03's security property reduces to which set reaches `searchAndSort`, and a
test that re-implemented the mapping would keep passing while the screen searched something else.
Verified by mutation — bypassing `visibleExperiences()` fails 4 of the 8 assertions.

One design call worth keeping: **distance is a tag on this screen, not the headline it is on Nearby.**
Leading a result card with "167 MIN DRIVE" in the locator colour reads as a promise that the list is
ordered by distance, and it is ordered by whatever the guest chose.

### Deployment

**Vercel is the target for the investor demo, and it is already configured** —
`apps/tourist-web/vercel.json` carries the build command, the SPA rewrite and immutable cache headers
for `/demo` and `/assets`. Verified on 2026-09-10: `pnpm tourist:build` produces a working bundle
(464 kB JS, 139 kB gzipped; 42 kB CSS) and the built artifact was served and walked, with a clean
console. **No environment variables are needed** — demo mode is the absence of configuration, so
there is nothing to set and nothing that can fail on stage.

### Demo photography — six heroes fixed, two blocked (2026-09-10)

Ro spotted that Blue Mountain Coffee Tasting showed men cooking over a fire. It *was* coffee —
Commons' own description of that file ends "Food is being cooked alongside the coffee" — but at card
size in a dark smoky shed it reads as a jerk stand, and if the founder reads it that way an investor
will.

An audit of all 34 listings against their heroes found it was systemic: ~10 heroes did not show the
activity being sold, and **two photographs were each doing two jobs**. `bb-oistins-1` is
`File:Miami Beach, Barbados.jpg` and was the hero of *both* Oistins Friday Night Fish Fry and Miami
Beach Day Pass; `ky-sail-1` was the hero of both Barrier Reef Snorkel and Sunset Sail. Every one of
the 57 files was already referenced, so there were no spares — new photography was the only fix.

Six replaced (coffee, MoBay→Negril, Sunrise Yoga, Barrier Reef, Swim with Turtles, Oistins). **No
hero is now shared by two listings**, and there is a check for that in the audit script.

**Two are blocked on the operator, and Commons cannot solve them.** Searched exhaustively — free
text plus the `Ocho Rios`, `Saint Ann Parish`, `Negril` and `Tourism in Jamaica` categories:

| Listing | Currently shows | Needs |
|---|---|---|
| Mystic Mountain Bobsled & Zipline | **Resolved 2026-09-10** — the bobsled, via the licensed route | nothing further |
| White River Tubing | **Settled 2026-09-10** — a bamboo raft on the White River | nothing; rafting is what the river is known for |

**Mystic Mountain is resolved, and the earlier reading of it was wrong.** The photograph Ro has is
*not* a Rainforest Adventures promotional image and not their copyright: it is an aerial shot by an
independent drone pilot, used with that pilot's permission. It shipped on 2026-09-10 as the first
image through the `licensed.json` route, replacing the Konoko Falls gardens — which were a different
attraction entirely, and the worse error by far.

It shows **the bobsled itself**, so the listing and its photograph finally agree. (A first shot of
the same site showed the waterslide and was replaced within the hour.) It is 275x183 where other
heroes are 1400 — **Ro's call, 2026-09-10, that this is fine for the demonstration**, so do not
revisit it. The pilot's name is still to be recorded in `rightsHolder`.

**White River Tubing is settled too, and was never really blocked.** It shows a bamboo raft on the
White River rather than a tube — and Ro's call, 2026-09-10, is that this is right rather than
tolerated: **rafting is what the river is known for.** The photograph reads as the White River to
anyone who knows it. Searched again the same day across Commons, Flickr's CC pool, Unsplash and
Pexels: no freely-licensed photograph of Jamaican tubing exists, and every real one belongs to a
tour operator. **Nothing further is needed here — do not "fix" it.**

**All 34 listings now carry a photograph of the right place**, and the media section of this
document is closed.

**It also found a layout bug, which is fixed.** `.detail__credit` shared the 40px baseline with
`.detail__hero-flags` and had neither a width cap nor `nowrap` — fine for a Commons credit averaging
27 characters, not fine for the first licensed one, which wrapped back across the row and hid the
"Open Now" badge. The credit now sits on its own line above the badges, so no credit length can
cover one. **The two photography tests were widened in the same pass**: they asserted a free Commons
licence and an `https://` source for *every* credit, which no `licensed.json` entry can satisfy —
they were written before that route existed and this was the first entry to use it. They now accept
either route and check that a licensed entry records a real, non-placeholder permission. Verified by
mutation, both ways.



**Do not "fix" these with a photograph of the right activity taken somewhere else.** The only free
tubing images on Commons are of the Chattahoochee and Shenandoah rivers in the United States. A
slightly wrong photograph of the right place is honest; the right activity in the wrong country is
not, and that distinction is the whole point of the `subject` field.

Two corrections worth recording, both found by reading `manifest.json` rather than eyeballing the
images: **West End Cliffs was already correct** (it genuinely is Rick's Cafe, Negril — a watermarked
replacement was rejected), and **`fetch.py` was writing to `apps/mobile/assets/demo`**, the retired
Expo path. Re-running it would have downloaded images where nothing reads them.

### Geolocation is real now (2026-09-10)

One of the two moats, and it was a mock-up of itself: the `LocationProvider` port existed (AD-07) but
the web app only ever had the mock behind it, so **every distance in the product came from a
simulated point** — the centre of the selected destination.

`data/browserLocation.ts` is the missing half. It honours the three rules the port exists to enforce:
permission is read through the Permissions API, which *cannot* raise a prompt, and only a press calls
`requestPermission`; there is no watch or background method (PRD §9); and it never throws — a
refusal, a timeout, an insecure origin and a browser without geolocation are all just "no fix".

**The part that makes it safe to demonstrate is that a real fix is not trusted unconditionally.**
The same build gets opened on a laptop in another country, and a browser answering "London" turns
every distance on screen into nonsense with nothing looking broken. `data/position.ts` uses the real
fix only within `ON_ISLAND_METRES` (150 km) of a destination on the selected island — enough for a
guest in Kingston with Ocho Rios selected to keep their real position, nowhere near enough for
another country. It is a pure function with 16 tests because that judgement is the whole feature.

Consent is checked **before** the fix is read, not after, so a position obtained while consent stood
cannot keep being used once it is withdrawn; `disable()` drops the fix as well as the flag.
`LocationBar` is the only control in the app that can raise the browser prompt, and it always names
the source — "Using your location · ±35 m", "You're about 7,500 km away — distances are from Ocho
Rios", "No fix from your device", or "Distances are from Ocho Rios".

One display bug this surfaced, which could only ever appear once position was real: several listings
share an operator and therefore one set of coordinates, so a guest standing at Dunn's River Falls is
genuinely 0 m from three experiences — rendered as "1 MIN WALK · 0 M", because `travelFrom` floors at
one minute. Under `AT_VENUE_METRES` the row now reads "YOU'RE HERE".

Walked in a browser in all four states with the device stubbed: at a vendor, elsewhere in Ocho Rios,
consent-but-no-fix, and from London. A fresh load raises no dialogue.

### The vendor portal has a visual language now (2026-09-10)

The handover's top remaining demo item, and it turned out to be two problems stacked.

**It did not run.** `http://localhost:3001` returned 500 — a stale `.next` webpack cache resolving
`buffer@5.7.1`, a package that is not in the lockfile and never was. `rm -rf apps/vendor-web/.next`
fixes it. Worth knowing because **the gates cannot catch this**: typecheck, lint and vitest never
start the Next dev server, so the portal can be broken while everything reports green. If the portal
500s, clear the cache before believing the error.

**Its palette was two designs old.** `app/globals.css` carried a hand-written copy — `--turquoise:
#10828a`, the old `--sand: #fbf1e3` — written before the 2026-08-03 redesign, while every component
in the same app imported the *current* tokens from `@cvip/ui`. So the portal rendered the old palette
under the new one. `tokens.test.ts` had guarded the tourist app's mirror and nothing guarded this,
which is the whole reason it survived.

**The fix is structural, not a repaint.** `tokens.css` moved from `apps/tourist-web/src/design/` to
`packages/ui/tokens.css` and is exported as `@cvip/ui/tokens.css`; both web apps import that one
file. A new test asserts the vendor stylesheet imports the mirror and declares **no** `--name: #hex`
of its own — verified by mutation with the old turquoise, which it catches. An app-local palette
cannot come back without failing the suite.

On top of that, the portal was given the design it never had: the crest (same mark, `VENDOR` where a
guest sees their island), Cormorant Garamond and Manrope (it had been rendering in the platform
default), a deep-green masthead, cards, and the demo notice as a **hairline strip** rather than the
gold slab — the same call the tourist app made on 2026-08-03, for the same reason.

**The verdict is the part that matters.** V-05 is the most convincing thing in the demonstration and
it had been a bordered box the same colour as everything around it. It is now full-bleed colour with
a 30px display headline — green for admit, gold for already-redeemed, coral for refuse — because a
vendor reads it across a metre of glare and must know the answer before reading the words. The
"first redeemed / scanned by" record sits on a darkened panel inside it.

**A transport failure is deliberately not a verdict.** It stays an ivory card with a coral hairline,
because dressing "could not reach the server" in the same colour as "already redeemed" gets a paying
guest turned away over dropped wifi.

Walked in a browser in all three states with a real signed token: valid, second scan refused with
the original time and scanner, and a tampered character rejected. Gates after: **276 tests
(15 files), typecheck and lint clean, and both apps build.**

> **Note for whoever demonstrates this.** There are two redemption surfaces and they are not the
> same one. `/#/staff/redeem` in the tourist app is what §2's walkthrough uses, and it already had
> the design language. The portal on `:3001` is the vendor's own device, and is the one this pass
> was about.

### M3 live backend — what was done (2026-09-21)

The tourist app's booking path now has a real Stripe Checkout + Supabase path. Here is everything
that exists and what comes next.

**Supabase project is provisioned and seeded.** All 13 migrations and the seed were applied manually
via the Supabase SQL editor (DNS connectivity from psql was blocked). The database has all tables,
RLS policies, functions, demo vendors, experiences and availability slots for the next 30 days.

**Edge Functions written (4 files):**

| Function | Path | Purpose |
|---|---|---|
| `checkout-session` | `supabase/functions/checkout-session/index.ts` | Creates Stripe Checkout session, inserts pending booking |
| `stripe-webhook` | `supabase/functions/stripe-webhook/index.ts` | Handles `checkout.session.completed`, confirms booking, stores `ticket_token` |
| `booking-status` | `supabase/functions/booking-status/index.ts` | Guest polls after Stripe redirect — returns status + ticketToken |
| `resolve-slot` | `supabase/functions/resolve-slot/index.ts` | Maps (experience title + date + time) → DB slot UUID + option UUIDs |

**Shared adapters written:**

- `supabase/functions/_shared/supabaseStore.ts` — full `BookingStore` implementation
- `supabase/functions/_shared/stripeProvider.ts` — full `PaymentProvider` using `npm:stripe@^17`
- `supabase/functions/_shared/deps.ts` — factory; reads env vars; throws on missing secrets
- `supabase/functions/deno.json` — Deno import map for `@cvip/payments`, `@cvip/types`, `zod`

**Tourist app changes:**

- `apps/tourist-web/src/lib/supabase.ts` — creates Supabase client when `VITE_SUPABASE_URL` is set; exports `isLiveMode`
- `apps/tourist-web/src/lib/api.ts` — `callCheckout`, `resolveSlot`, `pollBookingStatus`
- `apps/tourist-web/src/screens/Checkout.tsx` — branches on `isLiveMode`; live path: `resolveSlot` → build `lines` → `callCheckout` → redirect to Stripe
- `apps/tourist-web/src/screens/BookingReturn.tsx` — new screen at `/booking-return`; polls `booking-status` up to 18×1700 ms, then dispatches `addBooking` and navigates to `/confirmation/:id`
- `apps/tourist-web/src/App.tsx` — route `<Route path="/booking-return" element={<BookingReturn />} />`
- `supabase/migrations/20260802000013_ticket_token.sql` — `alter table bookings add column ticket_token text`

**Status of each step as of 2026-09-21:**

1. ~~**Deploy Edge Functions**~~ — **done.** All four are ACTIVE on `caribbean-vip-staging`
   (ref `xtyuvtlnfougbjadkull`) and answer correctly. Redeploy with:

   ```bash
   ./scripts/deploy-functions.sh xtyuvtlnfougbjadkull
   ```

   Use the script, not bare `supabase functions deploy`. Two flags are load-bearing: `--import-map
   supabase/functions/deno.json` and `--no-verify-jwt` for `stripe-webhook` only. Both are in the
   script and pinned in `supabase/config.toml`.

2. ~~**Enable anonymous sign-in**~~ — **done (confirmed 2026-09-21).** Toggle is ON in Supabase
   Auth → Providers → Anonymous. `ensureLiveUser()` depends on this; without it Checkout shows
   "We could not start a secure session."

3. ~~**Set Edge Function secrets**~~ — **done.** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `VOUCHER_HMAC_SECRET`, `APP_URL` (currently set to `http://localhost:5173`) are all in Supabase
   Settings → Edge Functions → Secrets.

4. ~~**Register Stripe webhook**~~ — **done.** Endpoint registered:
   `https://xtyuvtlnfougbjadkull.supabase.co/functions/v1/stripe-webhook` for
   `checkout.session.completed`. Webhook secret confirmed pasted as `STRIPE_WEBHOOK_SECRET`.

5. ~~**Create `.env`**~~ — **done.** `apps/tourist-web/.env` exists (gitignored) with
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The "We could not start a secure session"
   error the user saw locally was caused by processes from a previous run still holding port 5173.
   Kill those first: `lsof -ti:5173 | xargs kill -9`, then restart.

**Remaining: end-to-end payment test on a real hosted URL.**

The local test is partially blocked: anonymous sign-in may be working but the `ensureLiveUser()`
call needs the .env to be present AND no stale processes on port 5173. The most reliable way to
do the first real payment is to deploy to Vercel first:

**To deploy to Vercel:**

1. Go to **vercel.com/new** → "Import Git Repository" → find `vildelsol/caribbean-vip`
2. Set **Root Directory** to: `apps/tourist-web`
3. Add Environment Variables:
   - `VITE_SUPABASE_URL` = `https://xtyuvtlnfougbjadkull.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (anon key from Supabase Settings → API)
4. Deploy → copy the live URL (e.g. `https://caribbean-vip-xxx.vercel.app`)
5. In Supabase dashboard → Edge Functions → Secrets: update `APP_URL` to the live URL
6. In Stripe dashboard → Developers → Webhooks: update endpoint URL to the live domain

**After deploy, test with Stripe card `4242 4242 4242 4242`**, any future expiry, any CVC.
Flow: Explore → View Experience → Check Availability → pick date/time/party → Pay → Stripe →
return to `/booking-return` → poll ~5 s → Confirmation with QR ticket.

**A bug that four green gates did not catch (fixed 2026-09-21).** `Checkout.tsx` passed
`generateVoucherId()` as `userId`. That returns a base64url token; `checkoutRequestSchema` requires
a UUID, so every live checkout would have returned 422 - and even past the schema, the foreign key
onto `profiles` would have rejected a fabricated id. It survived typecheck, lint, 276 tests and
db:test because **nothing tested the live branch at all**. The fix: `ensureLiveUser()` in
`lib/api.ts` returns a real auth id (signing in anonymously if needed), `idempotencyKey` is now
`crypto.randomUUID()`, and `src/lib/checkoutContract.test.ts` asserts the request body against the
schema the Edge Function actually validates with - no network, no keys, catchable on a laptop.

The same pass made the live path's three silent failures visible. Each was a bare
`setPaying(false); return;`, which reads to a guest as the Pay button un-pressing and is
indistinguishable from a misfire. They now render a coral hairline - deliberately a hairline and
not a slab, the same call the vendor portal made: "we could not start the payment" must not look
like "you were refused".

### Design fixes applied against the Caribbean VIP Journey spec (2026-09-21)

Two visual bugs found by comparing the running app against `docs/design-source/Screen.dc.html`:

1. **Total amount size: 22px → 26px.** The design draws the checkout total at `font:800 26px/1
   Manrope`. The token scale had `22px`. Updated in `global.css` (`.t-amount`) and
   `tokens.ts` (`typography.amount.fontSize`). Line height stays `26` (satisfies `lineHeight ≥
   fontSize`). All 290 tests pass.

2. **`formatUsd({ withCode: true })` produced "US\$156 USD"** — both a "US\$" prefix and a " USD"
   suffix. The function now always returns `US\$${body}` regardless of `withCode`; the prefix
   already carries the code, the suffix was pure noise. Two call sites (`Checkout.tsx:364`,
   `Confirmation.tsx:101`) still pass `withCode: true` harmlessly.

Everything else already matched the design:
- Cormorant Garamond (headings) + Manrope (interface) loading correctly from Google Fonts
- `CARIBBEAN VIP` pill: `#E3C271` gold-light, `letter-spacing: 0.16em`, frosted glass — exact match
- Hero title: 33px Cormorant 600 greeting + 40px place name — exact match
- Section titles, card meta, teal/gold/coral accents, map colors — all exact match
- Island pill, mood tiles, search pill, bottom navigation — all exact match

Commit: `8fc11ad` — pushed to `vildelsol/caribbean-vip` on `main`.

### What deploying actually revealed (2026-09-21)

Three further bugs, none of which any local gate could have found, because nothing on a dev machine
runs Deno or talks to the hosted project.

- **Deno does not resolve extensionless imports.** `@cvip/payments` and `@cvip/types` are bundled
  into the functions from source, so their relative imports now carry an explicit `.ts`.
  `allowImportingTsExtensions` is in the shared base config and in the three app tsconfigs that do
  not extend it. Both packages are source-only and never built, so this costs nothing.
- **`stripe-webhook` deployed with JWT verification ON.** Stripe signs with `Stripe-Signature`, not
  a Supabase JWT, so the platform would have rejected every webhook before the handler ran — the
  signature never checked, the booking never confirmed, and the guest charged for a booking stuck
  on `pending_payment`. Now pinned off. `resolve-slot` and `booking-status` had the opposite
  problem: the app called them with no credential at all and they would have 401'd. The app now
  sends the anon key.
- **`resolve-slot` 500'd on every call.** It passed a query builder to `.in()`, which supabase-js
  does not support. Rewritten as two plain queries and verified against real seeded data: a real
  title and date return real slot and option UUIDs with real prices.

**Migration 13 (`ticket_token`) is confirmed applied** to the hosted database.

**Security note:** Do not paste the `service_role` key into any file other than `.env`. If it ever leaks, rotate it in Supabase Settings → API → Generate new key.

---

### The open question for the next session

**Irie AI is the other moat Ro named, and it is still a guided demo** — rule-matched over the
catalogue, labelled `GUIDED DEMO`, structurally unable to invent a listing or a price (§"Irie AI is a
guided demo, not a model" above). Ro was asked whether to leave it as an honest guided demo for the
pitch or put a real model in front of it, **and has not answered yet.** If a model goes in, it goes
*in front* of the rule matcher and the matcher stays behind it as the documented fallback — do not
replace it.

Ideas raised but not started, in the order I would take them:

1. ~~**Vendor portal visual language**~~ — **done, 2026-09-10.** See the section above.
2. **A licensed-media path in the pipeline** (~20 minutes). `manifest.json` and `fetch.py` are
   Commons-only *by design*, and will refuse anything else. Operator-supplied photography needs its
   own route with the permission recorded beside the file. Needed for every real vendor eventually,
   and it is what lets the Mystic Mountain photograph drop straight in the moment permission arrives.
3. **Commissioned photography** — see §8. The biggest single gap between this and a product.

### Still not drawn to the mockups

1. **Vendor portal** — functional, no visual language. Next up, per Ro.
2. **Map view** — blocked on OD-05; ships as a distance-sorted list with an explicit notice.

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

- **The real Stripe path has not been tested end-to-end yet.** All infrastructure is deployed and
  configured (Edge Functions active, anonymous sign-in on, secrets set, webhook registered), but
  no test card has been run through Stripe. The chain from `callCheckout` → Stripe → webhook →
  `supabaseStore.confirmBooking` → `BookingReturn` polling has never executed. Deploy to Vercel
  first (see §5) — the most reliable path to a first payment is on a hosted URL, not localhost.
- **`supabaseStore`'s write path is entirely unexercised.** `resolve-slot` and `checkout-session`
  individually verified against live data; nothing past the Stripe redirect has ever executed.
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
- **White River Tubing shows a bamboo raft** (the activity most associated with the White River,
  not a tube). Accepted by Ro — the photograph reads as the right place. No fix needed; see §5.
- **Geolocation is real but the position is still simulated whenever the device is not on the
  selected island.** That is deliberate and is stated in the UI, but it means a demonstration given
  outside the Caribbean is showing distances from a destination centre, not from the presenter.
- **`experience_options` is not read through any port.** Pricing runs against `demoOptionsFor` in
  `@cvip/demo`. Nothing may describe the pricing path as backed by the database.

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
