# Handover — Caribbean VIP

**Written:** 2026-08-02 · **Updated:** 2026-09-23 (fourth session) — **start at §5 "Session close" for the current state and pick-up list** · **Branch:** `main` at `cfcd2c1`, working tree clean, **12 commits ahead of `origin` and not pushed** · **Gates:** green — 347 tests, tourist-web typechecks clean, eslint clean

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
| **M3 — Booking, Stripe, redemption** | **tourist app live on Vercel; Stripe webhook registered; first live payment test pending** — see §5 |
| M4 — Vendor portal | **complete in demo mode** — `apps/vendor-web`: onboarding, listings, availability, earnings, billing, scan |
| M5 — Admin console | **complete in demo mode** — `apps/admin-web`: vendor/listing review, audit log |
| **M6 — Geofenced offers** | **geofence wired (2026-09-22)** — real GPS triggers offer when guest is within 250 m of promoted vendor; demo timer fallback retained for simulated/no-consent positions |
| M7 — Irie AI | **complete in demo mode** — `Irie.tsx` itinerary builder; **clash resolution added 2026-09-23** (proposes the departure that clears a collision, and can apply it) |
| M8 — Hardening | **in progress** — 306 tests, a11y pass, LCP/tap-delay/live-region fixes, **Android/iOS scroll parity (2026-09-23)** |

**T-01, T-02 complete. T-03, T-04, T-06, V-04, V-05 complete in demo mode. T-05 and T-09 partial:**
booking, capacity hold, cancellation and voucher invalidation all work. **The real Stripe/Supabase
path is now wired but has not yet been tested end-to-end** — see §5 pick-up point and §8.

**T-10 (guest sign-up / onboarding) complete, 2026-09-22.** Welcome screen gates first launch and
the name it collects is used on Profile; the journey can be walked from sign-up to redemption. See
§5 "Guest sign-up exists now".

Gates: **306 unit tests (18 files), typecheck and lint clean across 9 workspaces.**

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
>
> **Extended, 2026-09-22.** Ro re-supplied the VIP Cayman journey and held the build against it. The
> onboarding was rebuilt splash-first as a result, and with it came a **gold CTA language** —
> gold-filled primary, gold-outlined secondary, uppercase and tracked — currently used only on
> `Welcome`. Whether it spreads to the rest of the app is an open call, not an oversight; the green
> primary elsewhere is still the design's. See §5 "UI evolution against Ro's reference images" for
> the decisions and the three that are load-bearing.

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

### Session close — 2026-09-23, fourth session (read this first)

> ### ⚠ TWELVE COMMITS ARE UNPUSHED
>
> The working tree is clean and every gate is green — **347 tests** (22 files), typecheck clean,
> **eslint clean for the first time in several sessions**. Nothing is half-finished.
>
> But `main` is **12 commits ahead of `origin`**, so **the live Vercel demo still has none of it** —
> not last session's work, not this session's. `git push` is the first action, and it auto-deploys.
> Ro was asked before pushing and had not answered by the close; it is a deliberate hold, not an
> oversight.

Last session's work was reviewed and committed in the five-way split it suggested, then this
session ran on Ro's brief: **this is a demo going in front of investors, with people from Jamaica
and the Cayman Islands on the call.** Two consequences he drew himself, and they shaped everything:
*the UI has to be right*, and *the data gaps have to be real* — an invented fare or an empty
destination is exactly what an islander in the room notices first.

---

#### The arithmetic, audited

Asked for directly. The money core came out well and the screens did not.

**`packages/types/pricing.ts` and `money.ts` are sound** — integer minor units throughout, a fixed
order of operations (subtotal → discount → tax on the discounted base → fee on the same base),
discounts capped at what is left of the subtotal, and `applyRate` rounding half-up on the absolute
value so rounding is symmetric and always favours the guest by at most a cent. `distanceMetres` is
textbook haversine. None of it needed changing, and that is worth knowing before anyone goes
looking.

**Two real defects, both on screens a guest acts on:**

- **A taxi fare was being invented.** `Trips` printed `` `taxi from US$${8 + mins}` `` — US$8 plus a
  dollar a minute is not a tariff, it was a formula producing plausible-looking money on the screen
  a guest budgets from. Same class as the three functions removed in `78d0af7`, and worse for being
  a number someone might act on. The leg now says the fare is not included, which is the true part.
- **`pickupTime` underflowed below 00:35.** A 00:20 departure minus the 35-minute lead rendered
  `-1:-15 AM`. It wraps into the previous day now. No such departure exists in the catalogue — but
  it is on the money path, and a latent defect on the money path is worth the four characters.

---

#### Price advertised is now price charged

Ro's call, on the recommended option: **all-in everywhere.**

"From US$98" became US$117.60 at checkout — 15% tax plus 5% service, a 20% reveal at the last step.
The checkout summary itemised it honestly, which is why it survived four sessions; it is still drip
pricing, and it is the wrong first impression for a brand whose promise is that nothing surprises
you.

`allInFromMinor()` computes it **by running the same `priceFor()` the checkout charges from**, not
by multiplying the base by 1.20 in a second place. A second copy of the tax arithmetic is a second
thing to keep in step, and browse and checkout disagreeing about money is the failure that costs
trust fastest. `fromAmountMinor` is untouched — it is the vendor's rate, and the checkout
itemisation and the vendor dashboard both still need it.

Applied to every browse surface **and to Irie's budget filter**: if the prices shown are all-in,
"under US$100" has to mean all-in too, or the filter is answering a different question from the one
the screen is asking.

> The load-bearing test asserts the advertised price equals the charged price **on every listing on
> every island**. That is what stops a screen quietly going back to `fromAmountMinor`.

---

#### The data gaps — both were structural, not cosmetic

**Distance could not tell two listings apart.** It was measured from the **vendor**, and 39 listings
shared 15 operators — about five coordinates per island. Dunn's River Falls and Mystic Mountain,
2 km apart, both read "8 MIN DRIVE · 3.6 KM". A sort keyed on a number that cannot discriminate is
not a sort, and "nearest first" was the claim the screen was making.

`DemoExperience` now takes an optional `meetingPoint`, and **24 listings across all three islands
carry a real one**. It is omitted where the operator's base genuinely *is* the meeting point — a
transfer desk, a studio — so the field marks a difference rather than restating the vendor on every
record. Live in Ocho Rios the three nearest now read **1.6 km / 2.9 km / 3.6 km** where all three
used to be identical.

`experienceCoords()` is the single place that answers where a listing starts, and **the coordinate
carries its own `destinationSlug`**. That detail is load-bearing: a listing's slug says where it is
*filed*, not where it *starts* — the West Coast catamaran is filed on the west coast and leaves
from Carlisle Bay, 12 km away — so anything asking "is this here?" has to mean the point it just
measured, or it is back to asserting a proximity nobody computed. The existing offer test caught
exactly that when the first version of this change got it wrong.

**George Town had no operator based in it** — the destination every Cayman guest opens the app in.
Cayman Heritage & Harbour Co. now runs three listings that start there: the Eden Rock snorkel, the
old town walk, Smith Cove. That data gap is the whole reason the offer needed an 8 km radius to
find anything at all. Camana Bay, which had been filed under George Town to give the default
destination *something*, now sits where it actually is, 4.3 km up the coast.

**Two consequences, both surfaced by tests rather than by reading the diff:**

- The Barbados promotion moved from `exp-bb-catamaran` to `exp-bb-turtles`. The catamaran only ever
  read as Carlisle Bay because it shared the vendor's coordinates. The turtle swim genuinely starts
  on the boardwalk.
- The Cayman promotion moved to `exp-ky-eden-rock`, which is local to George Town rather than 4.3 km
  from it.

> New tests pin the general rule, not the instances: **every island's default destination must have
> both a listing that starts there and an approved operator based in it.** The next island added
> cannot repeat George Town.

---

#### `Irie` was planning a 5.7 km drive as "no transfer"

Found while verifying the above in the browser, and the most serious defect of the session.

The planner decided "same site" by `from.vendorId === to.vendorId` — true of every listing an
operator runs. So White River Tubing and the Dunn's River climb, on opposite sides of Ocho Rios,
were planned as **"Same site — no transfer" with zero travel time budgeted**, and the route distance
came out as zero. On the screen whose entire promise is *every stop fits, nothing overlaps*, the
promise was being made from an assumption rather than a measurement.

It asks the distance now, against `AT_VENUE_METRES` — already the app's answer to "close enough to
be standing there". The same day reads **"12 min drive · 5.7 km"**.

> **The test that had to change is the lesson.** It asserted same-vendor ⇒ same-site, which was
> true when location lived only on the vendor and is false now. Only two pairs in the catalogue
> genuinely share a site and the builder never happens to place either together, so the branch is
> asserted by a focused test that **plans both Rum Point boats** rather than by a sweep hoping for a
> coincidence. The bio bay tour lost the meeting point this session had given it — it leaves from
> the Rum Point jetty like its sibling, so the operator's location was the truthful answer, and a
> made-up launch point would have been the same defect as the taxi fare.

---

#### Four UI defects, and the splash

`Montego Bay` was hidden by the search field. `.ex-hero` carries `isolation: isolate`, so
`.island-menu`'s z-index is scoped **inside** the hero, while `.search-pill` is a *sibling* at
`z-index: 8` — which puts the entire hero beneath it. **No number on the menu could ever have fixed
it**; the hero itself is raised while the menu is open.

The mood tiles' four colours were hand-picked hex and the purple belonged to no token in the
palette, which is what made the 2×2 read as a stock category grid dropped into the app. They are
`--green-900` / `--teal-text` / `--coral-text` / `--gold-text` now. The ragged rhythm is fixed by
**reserving two lines of label height whether or not they are used** — sizing to the content means
the grid is only ever as even as the current wording, and the wording changes with the island.

Time format is one format: `formatClock()` in `availability.ts`, so Confirmation and Ticket stop
printing "13:30" on the two screens a guest screenshots. `pickupTime` was refactored onto it rather
than keeping a third copy of the same arithmetic.

**The splash is now a crest, three island names and three proofs. Nothing else.** Ro cut the
overline, the headline and the subline — including the headline last session added. His reasoning,
and it is right: *a premium mark asserts less.* The argument is not lost, it changes voice — the
proof row still says *plans your day*, *verified operators*, *VIP benefits*, three words a column,
and substantiation reads as more confident than a claim. The islands carry the middle of the screen
now and are **sized against the viewport**, because at a flat 13px the line wrapped on a 375px
phone, dropping "BARBADOS" to its own row and leaving the two hairlines stranded either side of the
row above — a masthead rule with nothing under half of it.

> **The wash has now been wrong in three directions across two sessions.** It is no longer fighting
> a paragraph, so the photograph carries the screen. The rule in `Welcome.css` still governs:
> **check both heroes whenever it changes.**

---

#### Irie's rule sweeps, and Trips carries the unpaid count

Ro asked for the rule under "extraordinary?" to travel across the page, to show Irie is live. It
does — a gold highlight crossing a 240px track on a 2.8s loop, the highlight its own element so the
rule underneath stays put between sweeps, and `prefers-reduced-motion` gets the rule without the
signal. The track is laid across the column rather than sized to the old 52px dash **because the
travel is the signal**: a sweep with 52px to cross is a flicker.

Ro then asked whether a guest selecting from Irie should be able to **book immediately**, and
whether they would otherwise know to go to Trips. The answer has a hard constraint in it and is
worth keeping:

**A day plan cannot be captured as one sale.** The route is `/checkout/:id` — checkout charges **one
experience**. A four-stop day is four payments, so "book from Irie" is not a copy change, it is a
basket. That is a real feature and a real decision, not a tweak.

**What was wrong was the signal, and that is fixed.** Irie already said "nothing is booked or paid
for until you check out" and swapped its button to "See it on Trips" — but a state change *in
place*, on a screen the guest is still reading, is the weakest signal in the interface. A guest who
looked away at that moment had a planned day, no booking, and nothing anywhere telling them so.
**The Trips tab now carries a coral count of planned-but-unpaid stops.** Coral not gold: gold is the
affirmative accent and is already on the Irie badge two tabs away, so it would read as decoration.
It sits on Trips because that is where the day is completed *and where the clash resolver runs* — a
guest booking straight from a suggestion would skip the one check that stops them holding two
things at once, which is the argument against the single-stop "Book now" shortcut as well.

**Still open, and it is Ro's call:** a *single-listing* suggestion could carry "Book now" straight
to checkout, because one listing is one payment. It would capture the sale earlier and bypass the
clash check. The multi-stop basket is the larger question behind it.

---

#### The open list, carried forward

Closed this session: the old **#4** (fabricated "Cruise-Friendly" — still open, see below), **#5**
(Nearby's sort), **#7** (George Town), **#10** (drip pricing), **#11** (time format), **#13**
(eslint), and **#8**/**#9** (dropdown, mood tiles).

0. **The live demo is `https://caribbean-vip-tourist-web.vercel.app`.** Every push to `main`
   auto-deploys; check with `gh api repos/vildelsol/caribbean-vip/deployments --jq '.[0].sha'`.
   Never put a `...-li58ewgtb-...` deployment URL in front of anyone.
1. **PUSH THE TWELVE COMMITS.** Until then every fix above exists only on this machine.
2. **The first live Stripe payment has still never been executed.** Card `4242 4242 4242 4242` on
   the Vercel URL. **Until it runs, M3 is not complete** — the biggest single gap.
   **Claude cannot do this one**: entering card numbers into a payment form is refused regardless of
   the card being a test card, so it is Ro's to run. Claude can drive the journey up to the card
   step and verify everything either side of it.
3. **The 250m/400m geofence hysteresis still has no unit tests.** Carried six sessions now. It is
   the exact function you would point at to say "the proximity logic is real", it is pure, and it is
   about thirty minutes.
4. **Background geofencing needs a native shell (M6).** Unchanged — see §"Is the proximity feature
   ready for Apple and Android" below. The decision logic is built and port-isolated; the trigger is
   not reachable from a browser.
5. **"Cruise-Friendly" on the feature card is still fabricated.** No field backs it. Add
   `cruiseFriendly: boolean` to `DemoExperience` or delete the badge. It survived this session's
   audit only because the audit was scoped to arithmetic.
6. **Social proof is 5 experiences out of 42.** Only five listings carry a `review` — the Eden Rock
   snorkel added one. In a demonstration, whichever listing gets tapped decides whether the product
   looks reviewed or empty. Ro's framing applies: this is a demo and there are no real vendors, so
   the honest options are to write the rest or hide the section until reviews are real.
7. **The ticket can still say the guest's name is "Guest".** Ro's call this session was that guest
   exploration stays and sign-up is **not** being hardened for the demo — "they can explore as
   guest, let's not complicate". So the placeholder remains reachable, and `GUEST / Guest` beside
   `GUESTS / 1 adult` is still two near-identical labels on the artefact a vendor scans. Worth
   twenty minutes to drop the row when there is no name.
8. **Single-stop "Book now" from Irie, and the multi-stop basket.** See the section above — the
   constraint is that `/checkout/:id` charges one experience.
9. **MiroFish — agreed as the next piece of work, not started.** Unchanged for three sessions: it is
   a *population simulator, not a UI testing tool*, so it needs a written scenario rather than a
   running build; and the main repo depends on paid Zep where `nikmcfly/MiroFish-Offline` swaps in
   local Neo4j + Ollama. Decide the input artefact and the fork before standing up a Neo4j stack.

---

#### Previous session — 2026-09-23, third session

### Session close — 2026-09-23, third session (read this first)

> ### ⚠ THE WORK IS NOT COMMITTED
>
> `main` is at `7e7987e` and in sync with `origin` — that is **last session's** handover commit
> (docs only; the code it deployed is `50d33cd`). Everything below this line is sitting in the
> **working tree, uncommitted and unpushed**, across 15 modified files and 4 new ones. **The live
> Vercel demo has none of it** — it still tells a guest in Ocho Rios that a jetty in Negril is a few
> minutes away, still shows the wrong date on Trips, and still opens checkout in an error state.
>
> **First action next session: review the diff and commit it.** The suggested split is at the end
> of this entry. Gates are green as it stands — **327 tests** (20 files), tourist-web typechecks
> clean — so nothing is half-finished; it simply has not been recorded.
>
> New files, which `git status` will show as untracked:
> `apps/tourist-web/src/data/day.ts`, `day.test.ts`, `offer.test.ts`,
> `supabase/migrations/20260923000001_island_greeting.sql`.

This session started as an assessment — marketer, UI designer, head of product — of the built app,
walked end to end on the **live Vercel build** at phone width. The findings drove everything after.

---

#### First: two entries on the old open list were wrong, and the error was mine

**Confirmation and Ticket have been rendering all along, on production.** Open item #1 has claimed
for four sessions that neither had ever been seen. A booking was completed on
`caribbean-vip-tourist-web.vercel.app` this session — reference `VIPJ-JN2H-39SR`, US$117.60 — and
both screens rendered correctly. **Demo mode is engaged on Vercel**; the `VITE_SUPABASE_*` vars are
not set there. The local `.env` *does* set them, which is why checkout cannot complete on
`localhost` — and that local-only fact is what the open item had generalised into a claim about the
deployment.

What remains true is the *separate* item: **no real Stripe charge has ever been executed.** That is
still open and is now the biggest single gap.

The lesson is last session's, repeated: check the artefact, not a proxy for it. "Checkout fails on
my machine" is not "checkout fails".

---

#### `Offer` — the geofence was naming a place 130 km away

The most damaging defect found, because it lands on one of the two things the founder named as the
moat.

`Offer.tsx` selected the promoted listing **by island** and then printed
`` `A few minutes from ${destination.name}` ``. A guest in Ocho Rios was shown the Seven Mile Beach
jetty — which the dataset correctly places in **Negril**, `18.29, -78.345`, about 130 km away. The
data was never wrong. The screen was asserting a proximity nobody had computed, on the one screen
whose entire claim is proximity.

**The rule is now a measured distance.** `promotedExperienceNear(islandId, destinationSlug)` in
`catalogue.ts` returns the nearest qualifying listing whose vendor is **either in the guest's
destination or within `OFFER_NEARBY_METRES` (8 km) of its centre**, and `undefined` otherwise.

Both halves of that rule earn their place:

- **A destination slug is an administrative boundary, not a distance.** A slug-only match would
  have refused Camana Bay to a guest in George Town — 4.3 km up the coast, plainly nearby.
- **A pure radius has no principled value against a centroid.** The simulated position is a town
  centre, so the real 250 m fence in `geofence.ts` cannot be applied to it; nothing is 250 m from a
  centroid. 8 km separates "the same trip out" from "another parish" without a judgement call, and
  because the screen now states the *measured* travel, the number is a threshold rather than a claim.

The proximity line is now `` `${minutes} min ${walk|drive} from ${destination}` `` with the icon
following the mode. Verified live on all three islands:

| Island / destination | Fires as | Stated |
| --- | --- | --- |
| Jamaica · Ocho Rios | Dunn's River Falls base | 8 min drive |
| Cayman · George Town | Camana Bay waterfront | 9 min drive |
| Barbados · Bridgetown | Carlisle Bay boardwalk | 4 min drive |

**Two consequences worth carrying:**

`Explore`'s demo fallback fired on a 6-second timer that **ignored geography entirely** — that is
how the Negril voucher reached Ocho Rios. It now fires only where a qualifying vendor is near, and
at **14 seconds** (`OFFER_DELAY_MS`), because at 6 the offer arrived before the guest had scrolled
Explore once and a gift from nearby that interrupts the first impression reads as a pop-up ad.

`offerShownForIslands` was keyed **per island**, so a guest who opened in Ocho Rios and drove to
Negril would never see the offer that genuinely belonged to them — the island had been used up
somewhere it did not apply. Now keyed `"<islandId>:<destinationSlug>"`. Old persisted values simply
do not match the new keys, which costs an existing guest one extra firing and nothing else.

---

#### `Nearby` was hijacking taps on listings to show the offer

Found while fixing the above, and worse than the thing being fixed.

`navigateToExperience` intercepted the **first tap on any card** and navigated to `/offer` instead
of the listing. It was a way of guaranteeing the offer appeared in a demonstration. It also
guaranteed that a guest who asked for White River Tubing received a rum-punch voucher for a jetty in
another parish, and that **a control did not do what it said**. This is the same class as the
Android "taps do nothing" report from last session: the tap fired, something else happened.

Removed. The offer has exactly one trigger — proximity, in `Explore`.

---

#### The rum punch now fires on every island, without a demo override

Ro asked for the offer to be reliably visible to investors. The honest fix was better than a forced
popup, because the reason it was not firing was a real product gap.

**Jamaica had no qualifying listing anywhere near where every guest starts.** The promotion's only
Jamaican listing was `exp-catamaran` at the Negril jetty; the app opens in Ocho Rios. A promotion
with nothing in the town the app opens in is a feature nobody will ever see — and the old code
papered over exactly that by announcing it anyway.

`exp-dunns-falls` now carries it in Ocho Rios. A complimentary rum punch at the beach bar below the
falls is the kind of thing that operator would actually run, and Dunn's River is the listing an Ocho
Rios guest is most likely to be standing near.

`offer.test.ts` — six tests. **The first is the one that matters:** every live island must have an
offer reachable from its default destination, so a promotion an investor will never see cannot ship
again. It also pins that Ocho Rios is never offered Negril, that Negril still is, and that no named
vendor is ever beyond the radius.

> `DEMO_PROMOTION.vendorId` still reads `vendor-negril` and has been inconsistent with
> `appliesToExperienceIds` since Cayman and Barbados were added — three different vendors run this
> promotion. Nothing reads the field; it is left because it mirrors the SQL column. **The day
> promotions become per-vendor records, that is the field that splits.**

---

#### `Trips` was not a day view

`Trips.tsx` printed `new Date()` as its header and filtered bookings **by island only**. A Thursday
booking therefore sat under a Wednesday date, beside a "Leave by 12:55 PM" in urgent coral that
implied today. On the screen a guest opens on the morning of, that is the app telling them to leave
for something that is not happening.

New pure module `data/day.ts` with `tripDay()`, `describeDay()`, `isoOf()`, `dateFromISO()` —
**12 tests**. The day shown is the day of the next booking that has not happened yet, and today when
nothing is ahead. Days compare as ISO strings in the guest's local calendar. Bookings on other days
are **counted, never dropped** — the header now reads "Tomorrow · 1 confirmed · 0 suggested · 2 on
other days".

Two rules that follow from it: the countdown is only computed when the day is today (`startsIn`
builds its comparison from the current date, so asking it about tomorrow is off by a day), and the
"leave by" line names the day and drops the urgent colour when it is not today.

`dateFromISO` parses the string by hand rather than `new Date('2026-09-24')`, which is **UTC**
midnight — the 23rd in the Caribbean. There is a test for that specifically.

**The longer header line exposed a latent layout fault.** The header body was absolutely positioned
against `bottom: 22px` while the photograph sat in normal flow, so the header's height was the
*photograph's* and the body's counted for nothing; a second line overflowed **under** the "Next up"
card, which overlaps by 30px. Nothing was clipped — it was covered, silently. The header is now a
flex box with `min-height`, the overlap is a single `--next-up-overlap` token that the header
reserves as padding and the card consumes as negative margin (so the two cannot disagree), and the
scrim's dark band was extended to 62% to carry type wherever it now lands.

> The token has to live on `.trips`, not `.trips__head` — the card is a **sibling**, not a
> descendant. The populated branch's `<main>` was missing the `trips` class entirely, so the first
> attempt silently computed `padding: 0`. An unresolvable `var()` invalidates the **whole**
> shorthand, which is why the symptom was all four sides collapsing rather than one.
>
> Same family as `minmax(0, 1fr)` from two sessions ago: **a container that cannot grow with its
> content will eventually be handed content it cannot hold.**

---

#### `Checkout` opened in an error state

Arriving from "Check availability" on a departure with one seat left put a red error and a disabled
button on screen **before the guest had touched anything**. The app auto-selected the departure,
auto-set the party to two, and then reported the conflict as the guest's.

Three faults, three fixes:

- **The party now opens at a size the chosen departure can take** — `partyFitting()`, applied in a
  lazy `useState` initialiser so it reads the opening day's first bookable slot once, on mount.
  After that the party belongs to the guest and is never silently rewritten under them.
- **"Only 1 places left on this departure."** — a plural agreement error on the money screen. Now
  singular/plural correct, and it names the way out: *"— reduce your party, or choose another
  time."* Naming a constraint without naming the escape is the failure Irie's clash resolver was
  built to avoid; the same standard applies here.
- **The disabled button read "Choose a departure"** when a departure *was* chosen. A new
  `QuoteFailure` code (`capacity` / `no-guests` / `other`) lets it say **"Too many guests for this
  departure"** instead of sending the guest to change the thing that was already right.

---

#### Each island now greets in its own words

Irie opened with a hardcoded **"Wah Gwaan!"** — Jamaican Patois, shown to every guest on every
island. The whole reason to open in dialect is that it reads as *built here* rather than built for
here; one island's voice applied to a region is precisely what the off-island competitors do.

`greeting` is now a field on the island record beside `in_app_brand`:

| Jamaica | Cayman | Barbados |
| --- | --- | --- |
| Wah Gwaan! | Wah goin on! | Wuh gine on! |

Carried through to the database so the demo dataset still mirrors the seed — new migration
`20260923000001_island_greeting.sql`, plus `seed.sql` and `IslandRow`.

Three tests in `store.test.ts`. **The load-bearing one is that no two live islands share a
greeting** — that is what catches someone re-hardcoding Jamaica's, because every screen would still
render.

---

#### `Welcome` leads with the differentiator instead of generic luxury copy

The splash opened *"Exclusive experiences. Authentic connections."* — two abstractions every OTA
also claims, describing nothing this app does that Viator does not. The thing nobody else does was
five taps away on the concierge screen.

The stack is now a poster, with one job per layer:

| Layer | Job | Copy |
| --- | --- | --- |
| Overline | Brand | YOUR ISLAND. YOUR WAY. |
| Headline | **The claim** | A Caribbean day that actually works. |
| Subline | **The promise** | Every stop fits. Nothing overlaps. |
| Islands | Reach | JAMAICA · CAYMAN · BARBADOS |
| Icon row | **The proof** | Plans your day / Verified operators / VIP benefits |

"Your Island. Your Way." is not deleted — it is demoted to the gold overline. It is a good line and
a poor argument, so it keeps its place without occupying the one slot where the product says what it
does. The subline is lifted from what Irie actually says when it builds a day, so the splash and the
product speak the same sentence.

The first proof point changed from **"Curated experiences"** to **"Plans your day"** — the other two
are backed by code (vendor approval is enforced in `isPubliclyVisibleDemo`; the voucher is a real
artefact), and "curated" was the one adjective proving nothing.

> **The intermediate draft is the lesson.** It explained the mechanism in full — real departures,
> real drive times, what you have already booked — which was *true*, and was three lines of body
> copy on a screen with two seconds to make one point. Ro cut it. A splash is a poster: headline
> claims, subline promises in five words, icon row substantiates in three words a column. Anything
> longer belongs on the concierge screen, where the guest has actually asked.

**The text wash has now been wrong in both directions in a single session** — too small for the
original two-line pitch, then too large for the paragraph, dimming the photograph the screen exists
to sell. The comment in `Welcome.css` therefore states the **rule** and not the number: the wash
covers the crest through the islands rule and fades before the proof row. It is invisible on a dark
hero and obvious on a bright one, so **check both heroes whenever it changes.**

---

#### Suggested commit split

Reviewed and gate-green as one working tree; these are separable and each stands alone:

1. `Offer`/`Explore`/`Nearby` — proximity rule, measured travel, delay, per-destination key, tap
   hijack removed. (`catalogue.ts`, `Offer.tsx`, `Explore.tsx`, `Nearby.tsx`, `store.tsx`,
   `offer.test.ts`, `dataset.ts` promotion)
2. `Trips` — `day.ts` + `day.test.ts`, `Trips.tsx`, `Trips.css`.
3. `Checkout` — `catalogue.ts` quote codes, `Checkout.tsx`.
4. Island greetings — `dataset.ts`, migration, `seed.sql`, `database.types.ts`, `Irie.tsx`,
   `store.test.ts`.
5. `Welcome` — `Welcome.tsx`, `Welcome.css`.

---

#### The open list, carried forward

0. **The live demo is `https://caribbean-vip-tourist-web.vercel.app`.** Every push to `main`
   auto-deploys; check with `gh api repos/vildelsol/caribbean-vip/deployments --jq '.[0].sha'`.
   Never put a `...-li58ewgtb-...` deployment URL in front of anyone.
1. **The first live Stripe payment has still never been executed.** Card `4242 4242 4242 4242` on
   the Vercel URL. **Until it runs, M3 is not complete.** Now the biggest single gap — the rest of
   the checkout path is verified working end to end on production.
2. **The 250m/400m geofence hysteresis still has no unit tests.** Carried five sessions. It is the
   exact function you would point at to say "the proximity logic is real" in an investor
   conversation, it is pure, and it is about thirty minutes.
3. **Background geofencing needs a native shell (M6).** See §"Is the proximity feature ready for
   Apple and Android" below — the decision logic is built and port-isolated; the trigger is not
   reachable from a browser.
4. **"Cruise-Friendly" on the feature card is fabricated.** No field backs it. Add
   `cruiseFriendly: boolean` to `DemoExperience` or delete the badge. Same defect class as the three
   functions removed in `78d0af7`.
5. **Nearby's sort cannot discriminate, and it is structural.** Distance is measured from the
   **vendor** (`catalogue.ts`), and 39 experiences share 15 vendors — about five coordinates per
   island. That is why Dunn's River and Mystic Mountain both read "8 MIN DRIVE · 3.6 KM": same
   vendor, same point. Either give experiences their own meeting point or stop leading with distance.
6. **Social proof is 4 experiences out of 39.** Only four listings carry a `review`. In a
   demonstration, whichever listing gets tapped decides whether the product looks reviewed or empty.
   Write the rest or remove the section until reviews are real — the fabricated-metrics lesson from
   `78d0af7` applies to testimony too.
7. **George Town has no vendors based in it.** Found while wiring the offer: Cayman's *default*
   destination has zero local inventory, so every Cayman guest lands where nothing is located. The
   8 km rule covers the rum punch (Camana Bay is 4.3 km), but the data gap is real and is the reason
   that rule had to exist.
8. **The destination dropdown hides a destination.** The search field renders over the open list and
   covers "Montego Bay" entirely — a stacking-order fault. Noticed, not fixed.
9. **The four mood tiles.** Two of four wrap to a second line, giving the 2×2 a ragged internal
   rhythm; and the purple on "Explore Like a Local" belongs to no token in the palette — it reads as
   a stock category grid dropped into a luxury app.
10. **Price advertised is not price charged.** "From US$98" on every browse surface, US$117.60 at
    checkout — 15% tax plus 5% service, a 20% reveal at the last step. The summary itemises it
    honestly, but this is the drip-pricing pattern travel regulators are actively pursuing, and it
    is the wrong first impression for a brand whose promise is no surprises.
11. **Time format is inconsistent on the two screens a guest screenshots.** Every browse surface
    says "1:30 PM"; Confirmation and Ticket say "13:30".
12. **The ticket can say the guest's name is "Guest".** The name is optional at onboarding, so
    skipping it renders `GUEST / Guest` beside `GUESTS / 1 adult` — two near-identical labels, one
    holding a placeholder, on the artefact a vendor scans.
13. **`eslint` fails on `apps/tourist-web/src/data/dayFit.ts:36`** (`prefer-const`). Pre-existing on
    `main`, deliberately not mixed into this session's work. One word.
14. **MiroFish — agreed as the next piece of work, not started.** Unchanged from last session: it is
    a *population simulator, not a UI testing tool*, so it needs a written scenario rather than a
    running build; and the main repo depends on paid Zep where `nikmcfly/MiroFish-Offline` swaps in
    local Neo4j + Ollama. Decide the input artefact and the fork before standing up a Neo4j stack.

---

#### Is the proximity feature ready for Apple and Android?

Asked directly this session. The honest answer is **the rule is built and tested; the trigger needs
a native wrapper** — and that distinction is worth getting right before it is said in a pitch.

**Working now, in any mobile browser.** `BrowserLocationProvider` is a real implementation of the
shared `LocationProvider` port (AD-07): it reads permission without prompting, raises the prompt
only from a press, returns a single foreground fix, and never throws. `useGuestPosition` combines
consent, fix and plausibility; `resolvePosition` rejects a fix that is not credible for the island
being browsed — the "presenter's laptop answers with an office in another country" case. The fence
maths in `geofence.ts` is real, pure, with 250 m entry and 400 m exit hysteresis. With consent on a
phone, real distances and the real fence work today.

**Not present, and not reachable from a browser:**

- **Background geofencing.** The port has *no watch method, deliberately* — the comment cites PRD
  §9. iOS needs `CLLocationManager.startMonitoring(for:)`; Android needs `GeofencingClient`. A PWA
  does not get there either: iOS Safari has no background geolocation and no region monitoring.
- **Push on fence entry.** Same gap. iOS web push requires a home-screen-installed PWA and still
  cannot wake on location.
- **There is no native shell at all.** The Expo app was retired 2026-08-03; `.archive/mobile` is the
  only trace and nothing under `apps/` targets iOS or Android.

This is PRD **M6**, and it is a wrapper-plus-permissions job — Capacitor or a thin React Native
shell around this web app, plus `NSLocationAlwaysAndWhenInUseUsageDescription` and
`ACCESS_BACKGROUND_LOCATION` — **not a rewrite**, precisely because the decision logic already sits
behind a port and is unit tested. The strong, truthful line for the room: *the proximity logic is
real and the consent gate is real; the background wake is a platform capability that arrives with
the native build.* Closing open item #2 above is what lets that sentence be demonstrated rather than
asserted.

---

### Session close — 2026-09-23, second session

**Where it is.** `main`, pushed to `origin` at `50d33cd`. Working tree clean. **306 tests** (18 files), typecheck clean.

Five commits. The third and fourth are the ones that matter; the rest are visual.

---

**`1f9e516` — twelve taxonomy chips became four mood tiles. Open item #2 is now closed.**

This had been raised twice across two sessions without a decision (it was open item #2 in both). Ro decided: four moods, in a 2×2 grid, replacing the horizontal 12-chip scroll rail on Explore.

*Adventure* / *Relax & Unwind* / *Taste [Island]* / *Explore Like a Local*. Each maps to several categories, so nothing became unreachable — `adventure` covers `adventure, water_sports, waterfalls, day_trips`; `explore` covers `culture, family, shopping`; and so on. **There is no "All" tile**: mood state is `string | null`, and tapping the active tile deselects back to null, which shows everything. Switching island also resets it to null.

Two details worth keeping: the label uses `island.in_app_brand.replace('VIP ', '')` rather than `island.name`, because `name` gives "Taste Cayman Islands" where the brand gives "Taste Cayman". And the grid is `repeat(2, minmax(0, 1fr))` — `1fr` alone would let a long label push a tile past the container, which is the same trap recorded in `5694559` last session.

---

**`62a8bea` — Irie's answers were posting below the fold.**

Ro's report: selecting an option "and nothing would happen on the screen". Three changes, and the third is the real one:

- `CONCIERGE` pushed to the header's right edge (`margin-left: auto` on the tag, `flex: 1` on the brand).
- The sparkle went 15px → 24px with a gold drop-shadow and a 2.6s breathe, so the header reads as awake rather than as a static title.
- **Turns now prepend rather than append**, and the screen smooth-scrolls to the newest one (`scroll-margin-top: 16px` on `.irie__turn` so it does not land flush against the edge). Each subsequent answer used to stack *below* the one before it, off-screen, with no scroll.

---

**`eb1d3fe` — the Android report was never a dead button, and the map toggle overlapped its own filters.**

**Read this one before touching global CSS.** Ro reported the Irie screen behaving differently on Android than iPhone — taps on an option appearing to do nothing.

Every control in the app is a plain React `onClick`; there are no mouse-only or touch-only handlers anywhere (checked). **The tap always fired.** The failure was the scroll, and the cause was one line:

```css
body { overflow-x: hidden }   /* the bug */
body { overflow-x: clip }     /* the fix */
```

`overflow-x: hidden` **forces the other axis to compute to `auto`**, so the body became a scroll box of its own while `document.scrollingElement` stayed `html`. Confirmed live under an Android UA: `bodyOverflow: "auto/hidden"`. WebKit papers over the split by propagating the body's scroll to the viewport; Chrome on Android does not resolve it the same way, so scrolling to a newly posted answer moved a box the guest was not looking at. `clip` suppresses the same horizontal overflow **without** creating a scroll container. After: `visible/clip`, `bodyIsScrollBox: false`, and a tap moves `documentElement` 0→499 while `body.scrollTop` stays 0.

Three more Android-only seams with no iOS counterpart, all fixed in the same commit:

- Horizontal rails took **any** drag that started on them, whatever its direction, so the page felt frozen under a thumb that landed on a card row → `touch-action: pan-x pinch-zoom` (pinch-zoom kept deliberately; bare `pan-x` would kill accessibility zoom).
- Overscrolling a rail's end escaped to the browser **back gesture** → `overscroll-behavior-x: contain`.
- **Pull-to-refresh reloaded the app** and discarded the session's plan and bookings → `overscroll-behavior-y: contain` on `body`.

> **Consequence worth knowing:** pull-to-refresh is now disabled app-wide. That is correct for an app shell, but if a screen ever wants a real refresh gesture it has to be re-enabled there deliberately.

Six horizontal scrollers predate `.rail` and roll their own `overflow-x: auto`. They are fixed as **one grouped rule in `global.css`** with the reason stated once, rather than the same two properties pasted into six screen stylesheets. Anything new should use `.rail` and inherit it.

**The map toggle, same commit.** Nearby laid the filter chips over the map absolutely, reserving `right: 80px` for a toggle that is roughly twice that wide — so the rail ran underneath it and sliced a label mid-word ("Cult…"). The list view already did it correctly, as flex siblings. **Reserving the correct width would only move the failure to the next longer word, a translated label, or a larger font-scale setting**, so the two controls are now flex siblings in one `.nearby-header` shared by **both** views. The overlap is no longer expressible, the two views stop diverging, and the map got back the strip it was occluding. `.map-filters`, `.map-chip*`, `.map-view-toggle`, `.list-view-toggle` and `.nearby-list-header` are all gone.

---

**`6a03ee5` — Irie proposes the departure that clears a clash, instead of just naming the clash.**

Ro's framing, and it is the right one: *"the whole idea for Irie AI is to solve problems — for an issue such as overlap, a solution needs to be suggested."* Naming a collision and stopping there hands the guest a puzzle.

`Clash` now carries `resolution: ClashResolution | null`, computed in the same pass against the same availability the rest of the app books from — so it **can only ever name a departure that exists and has room**.

**The plan changed once the code was read, and the reason matters.** The pitch was "full resolution for unbooked stops, request-a-change for confirmed ones". That is impossible: the builder fits suggestions against everything already placed, so **only confirmed bookings can ever carry a clash** (`itinerary.ts` says so in a comment, and there is a test). The whole feature is therefore confirmed bookings, which is why a `rescheduleBooking` store action exists — the same class of local simulation `cancelBooking` already was. Without it the button would have been decorative.

Rules the resolver follows, each for a stated reason:

- **Same day before another day** — moving by two hours is a smaller ask than moving the guest's plans to tomorrow.
- **Checked against every other stop, not just the one it collided with** — a slot that steps clear of the morning onto the afternoon is not a fix, and offering it would cost a rebooking to arrive at the same problem.
- **Sized to the seats that booking actually holds**, not the party the day is being priced for. A guest can book for four in the morning and ask Irie about a day for two. `FixedBooking` gained an optional `seats?: number` for this rather than the builder reaching through the projection.
- **The shape's window is deliberately not enforced.** Confirmed bookings are placed regardless of it, so filtering proposals by it would refuse the obvious fix for exactly the bookings most likely to need one.
- **`null` is a real answer** and the screen says so plainly ("Nothing else available has room — this one would have to be cancelled"). Two bookings an island apart at the same hour cannot be reconciled by moving either one.

**Applying one moves only `dateISO` and `time`.** Price, itemisation and ticket token are untouched: the guest agreed to that total and **a reschedule is not a repricing.** Verified — total stayed `9480` across the move.

Six tests in `itinerary.test.ts`. **One of them caught a wrong invariant while being written:** "never propose the time it is already booked at" is false across days — 9am *tomorrow* is a perfectly good fix for a 9am collision *today*. The rule is now same-day only.

**Reproduced Ro's exact screenshot to verify**: two confirmed 9:00 AM bookings, Mystic Mountain and Blue Mountain Coffee, 5 hr 37 min short. It correctly falls through to "Tomorrow at 9:00 AM clears this" — no same-day slot can close a 5 hr 37 min gap to something 55.9 km away. Clicking **Move** cleared the clash and flipped the headline to "a day that flows".

> **To reproduce a clash locally** there must be two confirmed bookings that collide; the demo starts with none. Seed them into `localStorage` under `cvip.tourist.v1` and then **hard-reload** — `load()` runs once at mount, so writing storage while the page is open does nothing until a reload.

---

**`50d33cd` — the understory was paled back down.**

`62a8bea` had made the bottom-left frond cluster larger *and* stronger at Ro's request; he then called it correctly — it was competing with the labels on the prompt tiles in front of it. **Scale and strength are separate decisions.** The size stays (that was the point); the tint dropped back to roughly where it started. If a future pass wants the foliage more present, change the geometry, not the opacity.

---

**The open list, carried forward:**

0. **The live demo is `https://caribbean-vip-tourist-web.vercel.app`.** Every push to `main` auto-deploys. Check with `gh api repos/vildelsol/caribbean-vip/deployments --jq '.[0].sha'`. Never put a `...-li58ewgtb-...` deployment URL in front of anyone.
1. **Confirmation and Ticket have never been seen rendered.** Both need a completed checkout; checkout cannot complete locally when `.env` configures Supabase. Unset `VITE_SUPABASE_*` to engage demo mode and reach them.
2. **The first live Stripe payment** has still never been executed. Card `4242 4242 4242 4242` on the Vercel URL. **Until it runs, M3 is not complete.**
3. **The 250m/400m geofence hysteresis still has no unit tests.** The function is pure and cheap to cover. Carried across four sessions now.
4. **"Cruise-Friendly" on the feature card is fabricated.** No field backs it. Either add `cruiseFriendly: boolean` to `DemoExperience` or delete the badge. Same defect class as the three functions removed in `78d0af7`.
5. **Nearby's sort.** Says "Closest to you" but every row reads "8 MIN DRIVE · 3.6 KM" — distance is not discriminating. Price and rating are the axes that would change the order.
6. **MiroFish — agreed as the next piece of work, not started.** Ro wants to simulate **guest personas reacting to the product**. `666ghj/MiroFish` (74.4k stars) is a Python multi-agent swarm/social-prediction engine. **Two things to settle before installing anything:** it is a *population simulator, not a UI testing tool* — it cannot drive the React app, so it needs a written scenario as input rather than a running build; and the main repo depends on paid Zep, where the `nikmcfly/MiroFish-Offline` fork swaps that for local Neo4j + Ollama at no API cost. Decide the input artefact and the fork before standing up a Neo4j stack.

---

### Session close — 2026-09-23, first session

**Where it is.** `main`, pushed to `origin` at `f64abf4`. Working tree clean. 300 tests, typecheck clean.

Four commits. Read them in order; each one feeds into the next.

---

**`5694559` — the day total was falling off the right edge of Trips.**

The grid had two columns: `132px` for the label and `1fr` for the rest. `1fr` resolves to `minmax(auto, 1fr)`, and `auto` cannot shrink below content. The total needed 298px, had 217px, and `overflow-x: clip` ate the rest silently. Fixed to `minmax(0, 1fr)` — a single responsive column. Map `min-height` came down from 108 to 88px in the same pass.

Worth knowing: `1fr` alone is *not* "take the remaining space and no more". It will grow past its container if the content is wider. The zero in `minmax(0, 1fr)` is what keeps it honest.

---

**`78d0af7` — the detail page answers "would this fit my day?", and stops inventing the social proof.**

Three fabricated functions were removed:

- `weeklyBookings()` — returned `ratingCount / 38`. Presented as a booking count beside the real price.
- `audienceTag()` — a category lookup that said "Popular with foodies". Not derived from any booking data.
- `recommendPct()` — returned `ratingAverage * 18 + 17`. A formula dressed as a percentage.

All three read as facts to a guest who has no way to know they are arithmetic. The same failure mode §8 already records for ratings. Replaced with actual `ratingAverage`, `ratingCount`, and a scarcity line driven by `capacityRemaining <= 6` — the same figure checkout enforces, so it cannot be higher than what the booking step would allow.

**The "would this fit my day?" question is now answered before it is asked.** New `data/dayFit.ts` provides `soonestDayFitting` and `describeDayFit`, which build the itinerary around the anchor experience and return `{ tone, headline, detail }`. The section heading changed to "Irie AI has already checked". Button styles reflect the tone: green for fits, teal for later-day, coral for no-room. 11 tests in `dayFit.test.ts` covering: weekday parsing, tone correctness, no overclaim from suggested (unconfirmed) stops, no-room for unlisted anchors, clash detection, and the regression where a day with an existing booking blocked the anchor from fitting.

**Critical fix in the same commit: hooks below the early return.** `useMemo` was placed after the `if (!experience) return null` guard. React: "Rendered more hooks than during the previous render." The screen went blank the moment `experience` resolved. All hooks moved above the guard. This is the same bug recorded in the previous session's `App.tsx` entry. **The rule is absolute: no hook after any conditional return, ever.**

---

**`8d07bd7` — the confirmation says it loudly, and a cascade fix unblocked fifty margins.**

The confirmation screen had a plain "BOOKING CONFIRMED" overline and a listing title in normal weight — nothing that read as a moment. It is now a gold disc seal (checkmark inside), "Confirmed!" at 44px in Cormorant Garamond, and the listing name at card-title weight beneath it.

**The cascade fix is the more important change.** Every `.t-*` type class (`t-title`, `t-body`, `t-caption`, etc.) carried `margin: 0`. These classes have specificity 0,1,0, and so do the screen's own class selectors. `global.css` loads *after* screen stylesheets in Vite's module graph, so every screen's margin rules — set at the same specificity — were silently overwritten by the `.t-*` reset. Around fifty margin rules across eleven screens had been doing nothing. Fixed by moving the element reset to bare selectors (`h1, h2, h3, p, figure, ul, ol…`) at specificity 0,0,1. The screen rules win at 0,1,0 and the base reset holds at 0,0,1 without the conflict. All margins reappeared in every screen without a single screen-level change.

If you add a new type class, do not put `margin: 0` on it. The element reset handles that. The element reset must not be moved back to a class selector.

---

**`f64abf4` — photo credits off the images, onto a screen that properly carries them.**

51 of 57 photographs are CC BY or CC BY-SA. Removing attribution entirely would make the app infringing; the licence requirement is "in any reasonable manner", not "on the image". A dedicated credits screen is the standard reading of that — the approach Wikipedia's own apps use.

- `Photo` component's `credit` and `mediaKey` props are kept but made inert (`void credit; void mediaKey`). The caption span is gone. The props stay so nothing accidentally reintroduces a caption over a hero.
- `/credits` lists all 60 files sorted by author, generated from `DEMO_MEDIA_CREDITS`. Each entry: bold author, muted subject, licence link and source page.
- Entry point: Profile → Photography → "Photo credits" button.
- `docs/media-credits.md` records that the screen is the *only* place attribution now lives and is not optional under the licences.

**One consequence.** The detail gallery's `shown` index previously existed for a licence reason — the credit had to track the scroll so it named the right photographer for the frame on screen. It is now a design concern only. The scroll-snap dots are still there; they remain useful for discoverability but they no longer carry a legal obligation.

---

**The open list, carried forward:**

0. **The live demo is `https://caribbean-vip-tourist-web.vercel.app`.** Every push to `main` auto-deploys. Check with `gh api repos/vildelsol/caribbean-vip/deployments --jq '.[0].sha'`. Never put a `...-li58ewgtb-...` deployment URL in front of anyone.
1. **Confirmation and Ticket have never been seen rendered.** Both need a completed checkout; checkout cannot complete locally when `.env` configures Supabase. Unset `VITE_SUPABASE_*` to engage demo mode and reach them.
2. ~~**Four mood tiles versus twelve taxonomy filters on Explore.**~~ **Closed 2026-09-23 (second session), `1f9e516`** — Ro chose the four moods. See the newer session block above.
3. **Nearby's sort.** Says "Closest to you" but every row reads "8 MIN DRIVE · 3.6 KM" — distance is not discriminating.
4. **The 250m/400m geofence hysteresis still has no unit tests.** The function is pure and cheap to cover.
5. **"Cruise-Friendly" on the feature card is fabricated.** Same defect as "Open Now" (removed `5694559`'s session). No field backs it. Either add `cruiseFriendly: boolean` to `DemoExperience` or delete the badge.
6. **The first live Stripe payment** has still never been executed. Card `4242 4242 4242 4242` on the Vercel URL. Until it runs, M3 is not complete.

---

### Session close — 2026-09-22, second session

**Where it is.** `main`, pushed to `origin` at `89f0c5a`. Working tree clean. 289 tests, typecheck
clean, and HEAD verified building from a clean `git archive` checkout. **Not deployed** — see the
open list.

Two commits, and the second one is the one to read:

**`3ea27e5` — the row photograph grows sideways, not downwards.** The previous session bled the
Nearby photograph to three edges, which made it *taller* and left it a 118px strip of a 343px card;
Ro's note was that it had gained height without gaining width. Nearby went to 130px, and Search
(92px) and Trips (74px) finally got the same treatment at 118px and 104px, bleeding to three edges.

The thing worth carrying: **width taken from the text column comes back as row height.** The 12px
Nearby's column gave up pushed its two badges onto a second line and added 22px to *every* row —
paying for the picture out of the list's length, which is the trade the whole change exists to
avoid. The badges lost 3px of side padding and 1px of gap; measured at 184px in a 187px column.
If you touch either width again, measure the tag row before and after.

**`89f0c5a` — Irie's backdrop escaped the phone frame.** Three layers on the concierge screen were
`position: fixed` — the fronds, the drifting blooms, the gold hairline. **Fixed resolves against the
viewport, and `.app` is only `position: relative`, which does not contain it.** On any viewport
wider than `--app-width` all three painted across the whole browser window, so the frame sat on top
of its own decoration and the foliage read as part of the website rather than part of the app.

There is now an `--app-gutter` token — `max(0px, (100vw - var(--app-width)) / 2)` — and every fixed
decorative layer anchors its edges with it. **This is a class of defect, not an incident:** it is
invisible at phone width, which is the only width this app is ever looked at in, and it only
appears when someone opens the demo on a laptop — which is exactly what happens in a pitch. The
other two fixed elements in the app, the bottom nav and the detail action bar, were already capped
to `--app-width`; Irie was the only leak. **Anything `position: fixed` from here on is capped to
the frame or it is a bug.**

The same commit answered Ro's question about the foliage. Two changes:

- **The fronds were three stops of the same emerald**, which is why they read as one flat shape.
  They run sea-green at the root to the interface's own ocean teal at the tip — land toward water,
  in colours the app already owns. **Deliberately not the icon palette**: coral, pink and sky each
  mark a kind of request in the prompt rows, and putting them in the wallpaper would quietly make
  the icons decorative. Same rule as last session — colour in the glyph, restraint in the container.
- **The foliage stopped at the header.** Three clusters now: `canopy` top-right, `understory`
  bottom-left (teal into aqua, about a third of the opacity, masked toward the opposite corner so
  the two fade *toward* each other and leave the reading column clear), and `mid` — the faintest,
  mirrored, and **the only one that is `absolute` rather than `fixed`**, so it arrives from below as
  you scroll. That last one is what gives the page length; two pinned clusters are a vignette, the
  same two shapes in the same two corners however far you have read. No breeze animation on the
  mirrored one: the keyframes set `transform` and would overwrite its `scaleX(-1)` mid-cycle.

**Open, added to the list below:**

0. **Nothing — the deploy is fine.** Kept as an entry only because this list carried two wrong
   claims about it in one day, and both were mine rather than the project's.

   **The live demo is https://caribbean-vip-tourist-web.vercel.app.** That is the production alias
   Vercel derives from the project name; it always points at the newest Production deployment, so
   it is the link for a deck. A `...-li58ewgtb-...` URL is a *deployment* URL, permanently pinned
   to the commit that built it — never put one in front of anyone.

   **Deployment is automatic.** The Vercel GitHub app builds every push to `main`, and every push
   this session succeeded. The local `vercel` CLI is logged out, which says nothing about it; the
   check that answers the question is
   `gh api repos/vildelsol/caribbean-vip/deployments --jq '.[0].sha'`.

   The one thing that was really wrong: **Vercel Authentication (Standard Protection) was on**, so
   every deployment 302'd to `vercel.com/sso-api` and the link opened only for someone logged into
   the team. Ro turned it off on 2026-09-22, and the live build was then walked and verified —
   Irie's three frond clusters, the foliage stopping at the frame on a desktop viewport, and the
   widened Nearby rows. On the Hobby plan that setting covers production and previews together;
   nothing here is a secret, since demo mode is the absence of configuration.

   Both wrong claims came from checking the wrong thing: a logged-out CLI was read as "not
   deployed", and a *guessed* project name 404ing was read as "no alias exists" — while the real
   name, `caribbean-vip-tourist-web`, was on screen at the time. Check the artefact, not a proxy
   for it.

1. **Confirmation and Ticket have never been seen rendered.** Both need a completed checkout, and
   checkout cannot complete locally: `apps/tourist-web/.env` configures Supabase, so `isLiveMode`
   is true and `ensureLiveUser()` fails with "We could not start a secure session". Unsetting
   `VITE_SUPABASE_*` engages demo mode and makes both reachable. **This is also true of the
   deployment** — if those vars are set on Vercel and Supabase is not reachable, nobody in a pitch
   can complete a booking.
2. **Four mood tiles versus twelve taxonomy filters on Explore.** The reference board leads with
   four moods — *Adventure / Relax & Unwind / Taste Jamaica / Explore Like a Local*. The build has
   twelve categories, from the PRD. The board's version is more premium precisely because it is
   fewer and they are moods. **This is Ro's call, not a design one**, and it has been raised twice
   without a decision.
3. **Nearby's sort.** The screen says "Closest to you" and sorts by distance, but with 18 results
   every row reads "8 MIN DRIVE · 3.6 KM" — distance has stopped discriminating. Price and rating
   are the axes that would actually change the order.
4. **The detail page's meeting-point map.** Vendor lat/lng already exists. Reviews do not: there is
   `ratingCount` but no review text, so a reviews section cannot be built honestly from this data.
5. **The 250m/400m geofence hysteresis still has no unit tests.** Carried over, still true.

**The hardest thing to get right this session, in one line:** colour belongs in the *glyph*, not in
the container. The first attempt tinted every row and drained its icon to white, which is how a
settings list is built. Restraint in the container, expression in the mark. If a future pass starts
adding tinted panels, that is the thing being forgotten.

---

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
exist or invent a price — the M7 requirements hold by construction rather than by prompt. When the
real model lands it goes *in front* of this, and this stays behind it as the "falls back to normal
search" path.

> **Updated 2026-09-22.** The header used to say **GUIDED DEMO** every time the screen opened. That
> label was removed on Ro's instruction along with all other demo labelling (§"Demo labelling
> removed"); the tag now reads `CONCIERGE`. **The engine did not change** — it is still rule-matched
> and still structurally unable to invent a listing or a price. Nothing in the UI says so any more,
> so do not let that absence mislead you into describing it as a model.

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

### Vercel deployment — done (2026-09-21)

**Live URL:** `https://caribbean-vip-tourist-web.vercel.app`

Deployed via the `vildelsol` Vercel account (team name "Caribbean VIP", Hobby plan). The
`vildelsol/caribbean-vip` repo is connected; every push to `main` auto-deploys.

- Root Directory set to `apps/tourist-web` — picks up `vercel.json` which handles the pnpm monorepo build
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` were auto-detected from `.env` during first deploy
- `APP_URL` in Supabase Edge Functions → Secrets updated to `https://caribbean-vip-tourist-web.vercel.app`
- Stripe webhook `caribbean-vip-checkout` registered at `https://xtyuvtlnfougbjadkull.supabase.co/functions/v1/stripe-webhook` for 4 events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`
- `STRIPE_WEBHOOK_SECRET` signing secret added to Supabase Edge Functions → Secrets

**Remaining: first live end-to-end payment test.**

Test with Stripe card `4242 4242 4242 4242`, any future expiry, any CVC.
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

### Design skills installed (2026-09-21)

Three Claude Code skills installed globally for UI redesign work:

- `web-design-guidelines` (vercel-labs, 654K installs) — audits UI against design/accessibility standards
- `design-taste-frontend` (leonxlnx, 503K installs) — anti-generic design system for landing pages and redesigns
- `image-to-code` (leonxlnx, 303K installs) — generates design images then implements them to match

~~**Next session:** redesign the tourist app screens starting with section headings.~~ **Done
2026-09-21/22** — see "Design pass against Ro's reference images". Headings stayed Cormorant at a
heavier weight; "Hidden Gems" became "Local Finds"; Fraunces went on the Irie greeting alone.

**Next session, in Ro's stated order:**

1. ~~**Wire the geofence**~~ — **done (2026-09-22).** `Explore.tsx` now calls `evaluateFences` on every real position update; offer fires on the 250 m boundary transition. Demo timer fallback retained for simulated/no-consent positions.
   Ask Ro how he wants it demonstrated without travelling (dev-only position override, or
   `watchPosition` with a simulated feed).
2. **Simulate the customer journey from download** — Ro's words. Not started, not scoped. Likely a
   first-run/onboarding sequence ahead of Explore rather than a scripted replay, but ask.
3. **Vendor portal write path** — the buttons render and do nothing (§8).
4. **The Irie text input** — the biggest remaining gap on that screen; see the ranked list above.

---

### Demo labelling removed (2026-09-22) — READ THIS BEFORE ADDING ANY

**Ro instructed: "remove all mentions of this being a demo."** This was done across both apps. It
reverses what earlier sections of this document call *operating rule 9* ("seeded content is
labelled wherever it appears"), so do not re-add labels on the strength of those older paragraphs —
they predate the instruction. If you think a label has to come back, raise it with Ro first.

What was removed:

- The `DemoNote` component itself (`kit.tsx`) and all 16 of its usages across the tourist screens.
- `GUIDED DEMO` in the Irie header → now reads `CONCIERGE`.
- "Rule-matched over the demo catalogue · no language model" footer on Irie.
- Profile's entire "What is simulated" panel — the five-bullet disclosure listing simulated
  payment, simulated position, timer-based offer, rule-matched Irie and seeded inventory. The reset
  control survives as "Start over" / "Reset this device".
- Nearby's stylised-map notice ("Live mapping is not part of this demonstration").
- Checkout: "Demo card" → "Saved card"; "Simulated payment. No card is charged and no payment
  processor is contacted." → "Your card details are encrypted in transit and never stored on this
  device."; "nothing is charged in this demonstration" → "free cancellation applies".
- `DEMO OFFER.` prefix on the rum-punch promotion terms.
- The vendor portal's top banner ("Demo mode · sample data · no real vendor account").
- The `[Demo]` prefix on every vendor `tradingName` in `packages/demo/src/dataset.ts`.

**What did not change: the data.** Inventory, ratings, review counts, the 4242 card, positions and
the offer trigger are all still seeded or simulated. The app no longer says so anywhere. That is
fine for a walkthrough Ro is narrating and a real exposure if screenshots travel without him — it
was flagged to him and he chose to proceed. `supabase/seed/seed.sql` still carries `[Demo]` names;
the two are now **out of step**, which matters if anyone reseeds.

### Design pass against Ro's reference images (2026-09-22)

Ro supplied side-by-side screenshots of the reference design against the build. Six differences he
named, all now closed:

| What he spotted | Fix |
|---|---|
| Star rating only half gold | Score now gold at 700 beside the star (`.rating .rating__score`, two classes deep so it beats `.t-caption-strong` on specificity rather than stylesheet order) |
| Card titles too light | New `.t-card-title` — 15px/700 Manrope, applied to rail, list and timeline cards |
| "7:30 PM · 3 tables left" not gold, too solid | New `badge--gold-glass` tone: gold type, uppercase, tracked out, on a translucent gold wash |
| Nothing nudging the guest to fill their afternoon | `.ex-nudge` ("You have N free hours this afternoon") + `.ex-map` teaser with live count and "Open map" |
| Detail page missing venue activities and social proof | `subOptions` pills, `FAMILIES` fact replacing `GROUP` where `minAge` is set, popularity card with face stack, five-star guest review |
| Trips timeline flat and unannotated | Food/nightlife dots gold, suggested hollow; transport connectors ("23 min drive · included pickup" / "taxi from US$20" / "9 min walk"); Edit day; leave-by time in coral; route card; ticket wallet; Ask Irie CTA |

Three fields were added to `DemoExperience` for this: `subOptions`, `minAge`, `review`. Populated
for Stingray City, Dunn's River and Mystic Mountain only — every other listing simply omits those
blocks rather than rendering empty ones.

**Typography:** Ro found the serif hard to read and asked for options. Shown five, chose Fraunces
for the Irie greeting **only** — deliberately a one-off, the concierge's own voice, everything else
stays Cormorant. New token `--font-voice` in `packages/ui/tokens.css`. Separately `.t-display*`
went 600 → 700 with tighter tracking, because the build sat lighter than the reference throughout.

**Card overlays.** An earlier pass had put a frosted pill behind the Local Finds titles to fix
legibility; Ro correctly called out that it covered the subject of the photograph. The pill is gone
— legibility now comes from a scrim that stays fully transparent across the top half plus a
text-shadow on the glyphs. **The `cvp` agent pushed back usefully here and was right:** the plan had
been to make the travel badge frosted glass too, and it pointed out that a blurred surface takes the
colour of whatever is behind it, so over pale sand "8 min" would vanish in exactly the bright
outdoor light this app is used in. The fill stayed opaque; what changed is that it stopped looking
like every other badge — smaller, the mode carried by an icon, the figure in locator teal. Same
agent's other good call: "distance without a time I must be back is useless" — Local Finds now show
`leaves 9:00 AM` instead of `Small group`.

The `car` icon was redrawn wide and low; it had been tall and narrow with a steep roof and read as a
bell at badge size.

### Irie AI — no longer labelled a demo, and less bare (2026-09-22)

The `GUIDED DEMO` tag is gone (above). **It is still rule-matched** — nothing about the engine
changed, only the label. Do not describe it as a model.

Ro asked for the landing state to be guaranteed as the default; it already was — verified by test
(one turn after asking a question, zero after navigating away and back), because `turns` is local
state and the greeting block renders unconditionally. No change needed.

The page was bare, so **"Popular right now"** was added: three live listings, nearest first, in a
rail that bleeds to both edges so the third is visibly cut off and a thumb knows it scrolls. Shown
only when `turns.length === 0`.

**The nav sparkle is animated** — five stars now, each twinkling on its own offset cycle, ~1.3–1.8s.
Staggered deliberately: a synchronised pulse reads as a notification badge demanding attention, a
staggered one reads as something quietly awake, which is the claim ("Irie is always available").
The two outermost stars are the smallest because the same mark renders at 13px inside chips, where
five equal stars would be a smudge. Animation is scoped to `.irie-badge` so it does not fire on
every sparkle in the app. `prefers-reduced-motion` is honoured globally in `global.css`.

**Ro's remaining Irie ideas, ranked, not built.** He picked #2 from this list; the rest are open:

1. **A text input.** The biggest gap by far — it looks like a chatbot with no way to chat. Even
   rule-matched behind the scenes, typing "cheap dinner near me" would change the whole feel.
   `INTENTS` already exists to map keywords onto.
2. ~~Fill the space below the chips~~ — **done**, "Popular right now".
3. **Let answers arrive with a beat** rather than instantly, so it reads as considered.
4. **Make the opener situational** — "You've got 3 hours before your table at 7:30".

### Vendor portal built out (2026-09-22)

Ro asked for this **ahead of geofencing**. It was a scanner plus a hardcoded roadmap list; it is now
a portal. New `lib/vendorData.ts` derives a consistent operating day from the shared catalogue using
a stable hash, so every screen agrees and a reload does not reshuffle the day.

| Route | What it does | Req |
|---|---|---|
| `/` Today | Guests/bookings/net, next departure with check-in, manifest in departure order | — |
| `/listings` | Live vs draft status first on the row, publish/unpublish, edit | V-02 |
| `/availability` | 7 days × slots, sold-against-capacity, colour-coded open/tight/full | V-03 |
| `/earnings` | Gross, platform fee at 12%, net — three separate figures | V-07 |
| `/scan` | The original redemption flow, now one tap from anywhere | — |

Commission comes from `DEMO_PRICING_CONFIG.commissionRate` — the same figure the tourist checkout
prices against — so vendor net reconciles with what the guest was actually charged.

Two judgement calls: **Today replaced the scanner as the landing page.** The old reasoning was that
a vendor opens this standing in front of a guest, which is true of one moment and not of the rest of
the day, and it left them with no answer to "how is today going". Scan is one tap from everywhere
instead.

**The write path landed later the same day.** The buttons were inert when the routes above were
first drawn; they are not now. `/listings` and `/availability` are `'use client'`, seed local state
from `vendorListings()`, and mutate it — Edit opens a modal that merges back, Publish/Unpublish
flips status, New listing appends a draft, and slot capacities are tap-to-edit with an inline number
field. A "Saved" flash confirms each write.

Everything is **in-memory and resets on reload**. That is the right behaviour for a demonstration —
the portal has to survive being clicked through in front of a room — and the wrong behaviour for a
product. The Supabase write path is still owed; `lib/vendorData.ts` remains read-only.

### Guest sign-up exists now — T-10 (2026-09-22)

The store had an `onboarded: boolean` that **nothing ever read and nothing ever dispatched**. The
journey therefore started mid-app, with a Profile screen that said "Alex Bennett" — a hardcoded
name — to a room being told this was their app.

- `AppState` gained `guestName: string`; the `setOnboarded` action now carries `{ name }`.
- `App.tsx` gates on it: `if (!state.onboarded) return <Welcome />;`
- Profile reads `state.guestName || 'Guest'`. The hardcoded name is gone.

So the full journey — install → sign up → browse → book → redeem — can now be walked end to end in
a demonstration without the operator explaining a missing first step.

### UI evolution against Ro's reference images (2026-09-22)

Ro supplied three references: a VIP Cayman premium app, a three-step onboarding, and an eight-step
customer-journey map. His notes: image pills too solid and blocky, Profile "terrible" and not
premium, Irie's animation should appear everywhere Irie is, sign-up needs to be more exciting with a
different image, categories need background and contrast to pop.

**Welcome — rebuilt twice, and the second rebuild is the one that matters.**

The first attempt kept a form on the first screen and merely restyled it. Ro rejected it: *"still
very poor and does not look like the premium flow i gave you."* He was right, and the reason is
structural, not cosmetic — **the reference's first screen asks for nothing.** It is the mark, the
promise, and three ways in. The form is a second step.

`Welcome.tsx` is now a two-step flow:

- **Step one, splash.** 152px crest — gold ring plus an inner hairline, sparkles over a serif `VIP`
  and a ruled `CARIBBEAN` — then the tagline, then gold-filled *Continue as Guest*, gold-outlined
  *Sign In*, and an underlined *Create an Account*.
- **Step two, setup.** Name and island on an ivory card over the same photograph, reframed down onto
  the waterline, with a small brand lockup above the card. Guests may skip the name (it defaults to
  `Guest`); the sign-in path requires it.

Three decisions in there are load-bearing and should not be casually undone:

1. **The photograph is `ky-hero.jpg`** — Seven Mile Beach, bright turquoise, white sand. It replaced
   `jm-hero.jpg`, a dark jungle shot that read as cold and overgrown. Ro asked specifically for the
   bright, inviting image. *The remaining gap to the reference is that his is an aerial down a
   coastline and ours is at ground level with jet-skis mid-frame. If an aerial beach shot is dropped
   into `public/demo/`, swapping it is a one-line change.*
2. **The tagline is set in the UI sans, not the display serif.** It sits directly under a serif
   wordmark; two serifs stacked at different sizes read as one heading broken in half rather than a
   mark and a line of copy. This will look like an oversight to anyone who has not stood the two
   versions side by side. It is not.
3. **The scrim is held off until ~72%**, and the white type is carried instead by a soft ellipse
   behind the mark and copy only (`.wl__splash-top::before`). A global wash dark enough to float
   white text over white sand sinks the photograph — which is the one thing the screen is selling.
   Local protection buys the contrast where the type actually is and leaves the sand and the
   turquoise at full strength at the edges.

**Profile.** The compact header row — 76px crest beside a name — became a full-bleed dark green hero:
96px crest with a gold glow, the guest's name large in the display serif, island subtitle, and
Bookings / Spent / Vouchers in a frosted glass row along the hero's foot. The functional blocks
below (island switch, wallet, saved, reset) are unchanged.

**Category chips.** Each chip carries a coloured circle behind its icon, driven by a `--cat-color`
custom property set per category in `CAT_COLORS` (Explore.tsx) — adventure green, beaches sky, food
orange, nightlife purple, and so on. Selection lights the chip in *its own* colour rather than a
universal green. This is what Ro meant by "make them pop".

**Feature card badges.** *Open Now* and *Cruise-Friendly* moved out of the image overlay into the
card body. Frosted glass was considered and rejected for the same reason recorded against
`.badge--travel` in `kit.css`: a blurred surface takes the colour of whatever is behind it, and over
pale sand in bright outdoor light the type vanishes. Moving them below the photograph solves the
"don't block the image" note without that trade.

**Irie.** `.irie-badge` gained an `irie-aura` keyframe — a gold halo breathing on a 3.2s cycle, 7px
spread, 18% at peak. Slow and shallow on purpose: it sits on every screen, and anything faster
becomes the thing you cannot stop looking at. The existing inner spark twinkle is untouched.
`prefers-reduced-motion` is honoured globally in `global.css`, which collapses both to a stop.

### Welcome — the lifeless-splash pass (2026-09-22, later)

Ro on the state before this pass: *"the first two screens look and feel lifeless … the second screen
is terrible, doesn't even fill the screen."* Both complaints had one root cause and one design cause.

**The root cause was a bug, not taste.** `Welcome.css` referenced `--pad` and `--font-ui`, and
neither was defined anywhere in the repo — not in `tokens.css`, not in `global.css`, nowhere. An
undefined custom property invalidates its whole declaration at computed-value time, so every
`padding: … var(--pad) …` on this screen resolved to **0**. The splash CTAs ran bezel to bezel and
the setup card's heading, input and island grid sat flush against the left edge. Nothing else in the
app used either variable, which is why only these two screens were affected. They are now declared
on `.wl` itself, and every use carries a fallback. Do not reintroduce a bare `var(--pad)`.

**Step one is now a four-frame loop.** Stills, not video: `ky-hero` → `jm-dunns-2` →
`bb-south-coast-1` → `jm-catamaran-1`, 28s cycle, 7s each, ~1.4s cross-fade, with a Ken Burns drift
from scale 1.04 to 1.15. The order is a colour arc — turquoise, jungle, aerial coast, gold sunset —
so it moves through a day rather than shuffling postcards. It is CSS keyframes with staggered
`animation-delay` and no React state, so it never re-renders and cannot stall. `bb-south-coast-1` is
the **aerial down a coastline** recorded as missing in the earlier pass; it was in the library all
along.

Also on step one: a `saturate(1.16) contrast(1.05)` grade on the frames (the stock photography is
graded for print and reads flat on a phone in sun), a warm gold tint along the top edge of the wash,
a sheen that crosses the crest every 7s, out-of-phase twinkles on the three sparkles, a breathing
gold glow, staggered entrance choreography, the markets set as a gold rule rather than a sentence,
and a three-up proof row — *Curated experiences · Verified operators · VIP benefits* — lifted from
the marketing board so the splash makes a claim about the product and not only about the weather.

**Step two now fills the screen.** The old version let the card size to its content and pinned it to
the bottom, which left ~45% of an 812pt phone as empty sky with a small crest floating in it. The
photograph is now a bounded header strip (`clamp(148px, 21dvh, 196px)`) and the sheet takes every
remaining pixel with `flex: 1`, its submit pinned to the foot with `margin-top: auto`. The island
picker changed from a two-across grid — whose fourth, empty cell was the loudest "unfinished" signal
on the screen — to three full-width rows carrying the island's photograph and its live inventory
count. A two-dot step indicator was added; its absence is why step two read as a dead end.

Zero vertical overflow at 375×812. A `max-height: 720px` block tightens the strip and drops the
reassurance line so the submit stays above the fold on an SE too.

**Reduced motion needed an explicit rule.** `global.css` collapses every duration to ~0.001ms
globally, which would have left all four stacked frames at their keyframe start — opacity 0 — and
the splash black. `Welcome.css` therefore stops the loop outright under
`prefers-reduced-motion: reduce` and pins frame one on. Any future stacked-fade animation in this
codebase needs the same explicit handling; the global collapse is not sufficient on its own.

### The colour pass — Explore and Irie (2026-09-22, later still)

Ro: *"it's the refinement touches, colour contrasts in the screenshot … it needs that colour and
excitement."* Two changes carry most of it.

**Category tiles.** The chips were white cards with the category's colour showing only as a 13%
tint behind the icon, and the palette was bright utility colour — Tailwind's sky-500, orange-600,
red-600 — chosen for that tint. They are now **filled tiles** carrying white icon and label, which
is the row the reference board leads with. The palette went with them: the same twelve hues taken
down in lightness and up in depth, jewel tones rather than utility colour, because at full strength
the old values read as a generic app-store icon grid beside the brand green and gold. Every value
carries white type at **5.3:1 or better** — checked, not eyeballed, because the type now sits
directly on the fill. `CAT_COLORS` in `Explore.tsx` is the single source.

Selection cannot be signalled by colour on a row that is already twelve colours, so it is a **gold
ring plus a lift**. Dimming the unselected tiles was tried and reverted: "All" is selected on load,
so it greyed eleven of twelve tiles in the state most users see first.

**The concierge.** `.irie` was one flat fill of `--green-950` behind 900px of scroll, which reads as
absence rather than depth — the screen looked switched off. It is now a lit room: a warm gold bloom
behind the greeting where Irie "is", a cool teal bloom low and left, a deeper base, and a gold
hairline along the top edge. All gradients, no image — an asset here would need attribution, would
cost a decode on tab switch, and would have to survive white text scrolling over it. A second layer
drifts on a 24s alternating cycle, stopped under `prefers-reduced-motion`.

The five question chips became **suggestion rows**: a coloured glyph tile in its own jewel tone, the
label, and a chevron. Three things change at once — a 56px target instead of a 40px pill, colour
that says what kind of answer you are asking for before you read it, and a chevron that says the row
leads somewhere. `Intent` in `Irie.tsx` grew `icon` and `color` for this. The three **day builders**
above them went from gold-on-a-16%-wash to a filled gold gradient with dark type, because composing
a day is what this tab does that a search box cannot and it was previously indistinguishable at a
glance from the narrower questions. The popular rail's cards gained the **rating** beside the price;
without it the rail's only decision cue was distance, and distance does not tell you if a thing is
any good.

**Not changed, deliberately.** `See all` stays teal. Gold is reserved in `tokens.css` for offers,
ratings and rewards; the board sets that link in gold, but moving it there would dilute the one
signal the app uses gold for. The photo credit pill stays as it is — it is a licence condition, and
it is already the smallest it can legibly be.

### Fixed in passing: a conditional hook in `App.tsx` (2026-09-22)

`App()` called `useEffect` **below** the `if (!state.onboarded) return <Welcome />` early return, so
the component ran three hooks during onboarding and four afterwards. The moment a guest finished
setup, React hit a changed hook order and threw *"Internal React error: Expected static flag was
missing"* — on the single most important transition in the app. The effect now sits above the
return. Caught from the browser console while working on the screens either side of it, not by a
test; there is no test that walks that transition, and that remains a gap.

### The offer, Trips, and the Irie detail pass (2026-09-22, evening)

**A script face joined the brand.** `--font-script` — Parisienne — is in `packages/ui/tokens.css`
and loaded in `apps/tourist-web/index.html`. It is used for **one word on one screen**: "Special"
in the geofenced offer's headline, *You're Near Something **Special***. Ro asked for this
specifically off the reference board and he is right about why it works — the sentence turns from a
statement into a flourish exactly where the offer does. **Do not use it a second time.** A second
use makes it a typeface; one use keeps it a moment. It has no React Native counterpart in `fonts`
yet; when the native app needs it, add `Parisienne_400Regular` rather than falling back to the
system cursive, which is a different letterform on every platform.

**The offer screen.** It was a flat `--green-950` behind a very tall ivory ticket pinned 150px from
the top, so the green was a 96px strip and the ticket ran off the foot — the drama the screen
exists for was not on screen. It is now a dark map: a faint two-gradient road grid (masked at the
edges), a warm bloom under the guest's position, and a radar ping expanding out of it on a 3.4s
cycle. The ticket floats with `margin: auto` on the block axis rather than a fixed offset, which is
what makes it land correctly on every phone instead of only on the one it was measured against.

Getting it to float meant finding ~160px. Where it came from, and why each is a real improvement
rather than a cut:

- **"Not now" removed.** It did exactly what the × does. `.voucher__close` is in the 44px hit-area
  list in `global.css` and carries an aria-label, so the labelled escape is still there.
- **"YOU'RE NEAR" removed from the card.** The screen's headline now opens with those words.
- **The terms collapsed** into a `<details>` whose summary names the restriction that actually
  catches people out — 18+, one per adult. Still on the screen, still one tap from the price.
- **The walk pill became a line.** It was a third rounded container nested inside two others.

The stub is now **sand rather than ivory**: a perforation between two identical creams is a dashed
line, between two different creams it is a ticket you could tear.

**Trips.** The day total was two pale ivory rows on an ivory ground, which gave the number the
screen exists to total no more weight than the hairline beside it. It is now a **dark green bar**
with the amount at display weight and a gold-outlined *View details*. Beneath it, a **VIP Pass
card**. The reference board draws one pass for the whole day; this shows the **next booking's own
ticket** instead, because a single day-pass QR is a credential no vendor scanner can verify, and
the one claim this product cannot fake is that the code on the screen scans.

While rebuilding it: the timeline could show a suggested stop at US$65 above a total reading US$0,
because the total sums confirmed bookings only. That invariant is right and stays — no figure on
this screen is recomputed. The suggestions' "from" sum is now shown on **its own line**
(`plannedFromMinor`), so both numbers are correct and the screen no longer looks broken.

**Irie, the finer detail.** Ro asked for alignment, type scale, structure and iconography to match
the board or better:

- The name was 15px sans — the smallest type on the concierge's own screen, smaller than the row
  labels it introduces. It is now 21px in the display serif, with the sparkle **after** it: leading
  with the glyph makes the glyph the subject and the name its caption.
- The intro was one 16px paragraph carrying both a statement of identity and an open question. It
  is now two sizes — 19px/500 for the introduction, 14px muted for the question — with a short gold
  rule under them. The rule is the pause between "how can I help" and the list of ways.
- `POPULAR RIGHT NOW` became **"Here are some ideas for you"** with the spark: all-caps micro type
  is a filing label, and it was introducing the one part of the screen where Irie offers something
  unprompted.

**Not verified locally, and why.** The VIP Pass card and the day total with real bookings could not
be seen in this environment. `apps/tourist-web/.env` configures Supabase, so `isLiveMode` is true
and `Checkout` takes the live path, which fails at `ensureLiveUser()` with "We could not start a
secure session". No booking can be created locally, so the confirmed-booking states of Trips are
unreachable by hand. The code typechecks and follows the same `booking.ticketToken` → `<QR>` path
as `Ticket.tsx` and `Confirmation.tsx`, both of which work — but it has not been seen rendered.

**Found, not fixed: `Open Now` is hardcoded.** `Explore.tsx` renders `<Badge tone="brand">Open
Now</Badge>` unconditionally, and there is no opening-hours field anywhere in the dataset. It sits
beside the from-price, the rating and the next bookable departure — all of which are real — so it
reads as fact. It was deliberately **not** propagated to the Irie idea cards for that reason, even
though the board shows it there. `firstBookableDay`/`slotsFor` already drive a truthful
"Available today" elsewhere and are the obvious replacement.

### Colour in the glyph, not the container (2026-09-22, late)

Ro, with the reference board and my build side by side: *"I prefer the more subtle options of the
first screenshot as opposed to the changes you made, warmer, less corporate."* He was right, and
the diagnosis is worth writing down because it is a rule and not a preference.

**I had put the colour in the container and drained the glyph to white.** Each Irie row was tinted
26% with its own hue and carried a filled tile with a white icon in it. Five coloured bars. That is
how a settings list is built. The reference does the opposite: the row is barely there — one
translucent wash, one hairline, identical for all of them — and *all* of the colour is in the
glyph, at full strength, with nothing around it. **Restraint in the container, expression in the
mark.**

So the rows are now `rgba(251,246,236,0.055)` with a 10% hairline, the same for every one, and the
glyphs are light warm hues chosen to sit on near-black green — not the dark jewel tones the
category tiles use, which exist to carry white type on top of them and would vanish here.

Four new glyphs were drawn for it, because the board's are specific and Ro asked for them by name:
**`wine`** for *Dinner with a view*, **`price-tag`** for *Something under $50*, **`sun`** for the
day builders, and **`umbrella`** for *Rainy-day option*. The tag's eyelet is a filled circle in its
own `switch` case: a hole in proportion at 17px is about 2.4 units across, and a stroked circle
that small closes into a dot anyway — so it is a dot at a size that survives.

**The gold builder fill came back off.** Filled gold pills above five coloured bars was the loudest
possible arrangement of a screen whose subject is a concierge quietly offering to help. The
hierarchy is carried by *shape* now — a pill among rows — which leaves the fill free to go.

**Category tiles: gold glyphs.** Ro asked for a contrasting colour on the iconography. The glyph
was white on a translucent *white* disc, which is the one combination that cannot pop — it lightens
the tile under the mark and then draws the mark in the same value as the lightening. The disc now
*darkens* the tile and the glyph is brand gold, which reads as lit rather than printed. Twelve
coloured tiles with twelve white icons is a palette; twelve coloured tiles with one gold mark is a
set. Gold on the darkened disc measures **4.16:1 at worst** across all twelve — checked per tile,
and the disc is the only reason the warm ones clear at all (gold on raw `food` is 3.09).

### Foliage, drawn rather than photographed (2026-09-22)

Ro preferred the board's palm backdrop to a flat green — *"it adds more life"* — and added that it
*"doesn't have to be a palm tree, but whatever it is must have enough contrast."* Agreed on both,
and `components/PalmFronds.tsx` is the answer.

**Why not a photograph.** Every photograph in this app is CC BY or CC BY-SA and carries a visible
credit wherever it appears. A decorative backdrop would have to wear an attribution pill on the one
screen whose whole job is to feel like a person talking to you. It would also cost a decode on
every tab switch, and white body copy would have to survive wherever the photographer's highlights
happened to land. Drawn fronds have none of that — and, the part that matters for Ro's note, the
contrast is a number in the file rather than a property of someone else's exposure.

The leaflets are **generated**, not hand-drawn, so the shape is tuned by changing a count or an
angle rather than by editing a 200-number path nobody will dare touch again. The first attempt read
as a spider's web: sparse leaflets, a shallow 52° sweep and straight lines either side of a spine.
A frond is long, narrow and *dense* — so the count went up, the reach came down to 0.21 of the
stem, the sweep went to 64–82°, and each leaflet droops on a quadratic rather than running straight.
Straight leaflets are the single thing that makes drawn foliage look drawn.

It is `position: fixed`, so it does not scroll away and leave the bottom two-thirds as flat as
before, and masked toward the left so it never reaches the column the body copy sits in.

### The spark animates everywhere (2026-09-22)

Ro: *"anywhere there is an Irie AI symbol it should be animated."* It lived in `BottomNav.css`
scoped to `.irie-badge`, so the mark twinkled in the tab bar and sat dead in the concierge header,
the ideas label, and the Ask Irie rows on Explore and Trips. One mark behaving two ways is worse
than a still one, because the live version teaches you to expect it.

The keyframes and the five `.spark--N` rules now live in `global.css`, keyed on the classes
`Icon`'s `sparkle` case emits, so any sparkle anywhere animates without its caller opting in.

`Welcome.css` lost its local `wl-twinkle`: it scaled the three `<svg>` elements while the global
rule pulsed the paths inside them on a different cycle, and two animations on one mark reads as a
flicker rather than a twinkle.

Also fixed: the concierge's context chips said **"1 vouchers"**.

### The empty day, and the descent (2026-09-22, night)

**Trips' empty state was a dialog box.** A calendar glyph, a line of grey copy, and one "Ask Irie
AI" button on a screen's worth of blank ivory. Ro: *"very uninspiring and does not even look
encouraging enough to book something."* The diagnosis is that it **described the absence and then
asked the guest to go somewhere else and solve it**.

An empty plan is the best sales position in the app — the guest has opened the tab for their day,
which means they want one. So it now answers instead of asking: a photographic header, then the
three highest-rated experiences on the island, priced, with duration and pickup, one tap from
booking. Irie stays as the *second* option rather than the only one.

Ranked by rating, not distance: with nothing booked there is no itinerary for a stop to be near, so
the only useful sort is "what is the best thing here".

**A header bug this uncovered.** `.trips__head-photo` is a plain `<img>` in normal flow with no
height, so the header was as tall as whatever aspect ratio the photograph happened to have at full
width — a landscape shot gave a 210px banner, the portrait coffee-picker shot gave **615px**, most
of a phone screen of dark green before any content. It had been invisible for as long as the photo
that landed there happened to be landscape. Now `height: 232px` with `object-fit: cover`, and the
photo's opacity came up from 0.5 (at half strength under the old scrim it was a texture, not a
place).

**The concierge gradient now actually descends.** Ro asked whether it should run darker all the way
down. It should, and two separate things were stopping it:

1. The ramp was `#0a2f27 → #072821 → #061f1a` — about four values of travel across a whole screen
   of scroll — and a fourth layer, a `rgba(12,74,63,0.7)` bloom parked at `50% 104%`, was actively
   *lifting* the foot.
2. More subtly: `.irie::before` is `position: fixed`, and its teal bloom sat at `18% 72%`. Fixed
   means that teal light is in the lower third of the **viewport**, permanently — so however far
   the ramp behind it descended, the bottom of every screenful was lifted back up. This was the
   real cause, and fixing only the ramp did not visibly change anything.

Both blooms now live in the upper half where Irie is, the foot bloom is gone, and the ramp ends at
`#020a08`. The greeting sits in the warmest part of the room, the ivory idea cards at the bottom
gain real separation, and the tab bar lands on the darkest ground rather than on a green glow.

The `background-attachment` is per-layer and deliberate: `fixed, fixed, scroll`. The blooms mark
where Irie *is* and should not travel; the ramp is the one layer that has to span the document
rather than repeat once per viewport.

### Still to do, in priority order (2026-09-22)

From a sweep of every screen against the reference board:

1. **Nearby's list cards** are plain white rows with a grey "View" button — the only screen whose
   chips are still grey pills while Explore's are jewel tiles. Inconsistent with itself.
2. **Search** has the same grey-chip problem, and shows distance prominently (78.0 km) on a list
   sorted by rating, which reads as a bug even though both are correct.
3. **Profile's hero** has a large dead zone between the crest and the name, and prints the guest's
   name twice — "Guest", then "Guest · VIP Jamaica" directly beneath it.
4. **Explore** still lacks the board's Special Offers row and Hidden Gems triple-image row, and the
   open question of **four mood tiles versus twelve taxonomy filters** has not been decided.
5. **Checkout / Confirmation / Ticket** have had no design pass at all this session.

### The remaining screens, in priority order (2026-09-22, done)

Worked the list recorded in the previous entry. All five are through.

**One colour language.** Explore's categories had become jewel tiles while Nearby's and Search's
chip rows were still the app's plain grey — three sibling screens filtering the same catalogue by
the same five words in three visual systems. `Chip` now takes an optional `dotColor` and both rows
carry the hue of the category they lead with. A dot, not a tile: a filter bar that becomes a second
row of tiles has stopped being a filter bar. The dot is `aria-hidden`; the label carries meaning.

**Nearby.** `Starts in 90 min` was hardcoded on every row of every listing — the same fabrication
`Open Now` was, next to a real distance and a real price. It now uses `availabilityLabel` and omits
the badge when nothing is bookable. The rating was missing entirely, on the one screen sorted by
*distance*, where it is the only thing telling you whether the nearest is worth the walk. And the
`View` badge is gone: a button-shaped element that was not a button, inside a card that already
was, taking enough width that the price had nowhere to sit beside anything else.

**Search.** The sort is now always named in the results line, including `recommended`. It was
omitted for the default, so a recommended list had no stated order while every row led with a large
distance — it looked like a nearest-first list that had got the order wrong. Both facts were
correct; the missing label was what made them contradict each other.

**Profile.** The subtitle read `Guest · VIP Jamaica` beneath a heading that already said `Guest`.
It states island and destination now. The hero also opened with `max(52px, …+28px)` above a 96px
crest — a band of empty green taller than the mark itself.

**Explore.** The board's two missing rows are in.

- **Special Offers.** The board's copy is "Save up to 20% on select experiences" and there is no
  discount anywhere in this catalogue, so that row would have been a number invented to fill a
  shape — on the screen a guest uses to decide what to spend. There *is* a real promotion, so the
  row states that instead, and renders only when `PROMOTION` applies to something on the current
  island. It shares one derivation with the geofence, so the row can never advertise an offer the
  fence would not fire.
- **Hidden Gems**, three across rather than two. Two cards read as a pair of equals to choose
  between; three reads as a selection to browse. `:has()` rules fall back to two and one columns so
  a thin island does not leave a hole in the grid.

**Checkout.** The total was a row with a hairline above it, the same weight as "Service fee
US$6.50". It is now a dark green band — the same treatment as the Trips day total, so "this is what
it comes to" looks identical wherever the app says it.

A sticky pay bar was **considered and rejected**, and the reason should survive: the form is a
sequence of decisions and the total does not exist until a departure is chosen, so the button would
spend that time reading "Choose a departure" while floating over the day strip — an instruction the
guest cannot follow yet, permanently in front of them while they try. Reaching the button at the
foot is itself the signal that the sequence is complete.

**Ticket — a real defect, not a cosmetic one.** The `GUEST` field was the literal string
**"Alex Bennett"**, on every ticket, for every guest. It is the field a vendor reads off the screen
when they scan, so it was the one hardcoded string in the app a real person could have been turned
away over. It now uses `state.guestName`, falling back to "Guest" for anyone who skipped the name
at onboarding — the honest answer rather than someone else's.

**Still not seen rendered: Confirmation and Ticket.** Both are reachable only after a completed
checkout, and checkout cannot complete locally (`.env` configures Supabase, so `isLiveMode` is true
and `ensureLiveUser()` fails). The Ticket fix is a one-line data substitution in a field that
already rendered, but neither screen has had a visual pass and neither should be assumed good.

### More picture, same screen (2026-09-22)

Ro on the Nearby list: *"there is a lot more empty space, I don't want it to look congested, use
the space for imagery."*

**The measurement first.** Each row was 343x120 with a 92x92 photograph floating inside 13px of
padding on all four sides — **21% of the card was image**, on a screen whose entire job is to make
someone want to go somewhere. The rest was ivory.

The photograph now bleeds to three edges and widens to 118px: **34%**, and the row height does not
change. The space it gains is the gutter that was being spent framing it, so the same number of
rows still fit on a screen. That is the version of "use the space for imagery" that does not also
mean "fit less on the screen" — which is what growing the row would have meant.

The negative margins on `.near-row__photo` must match `.near-row__inner`'s padding exactly. If one
changes, the other changes with it.

**The detail gallery — half the photography was never seen.** 24 of the 38 listings carry two or
three photographs and `ExperienceDetail` only ever rendered `media[0]`. A scroll-snap rail now
shows all of them, with dots. No new assets, no library: native scrolling brings momentum,
rubber-banding, keyboard and screen-reader behaviour for free, and degrades to a plain scrollable
strip where the snap properties are unsupported.

**`shown` exists for a licence reason before a design one.** Each photograph carries its own
attribution, so a credit line pinned to `media[0]` while frame two is on screen is the wrong author
under the wrong picture — a licence breach, not a cosmetic slip. `creditFor(frames[shown])` follows
the scroll. Verified: scrolling to frame two changes the credit from "Don Ramey Logan" to
"Breakyunit at English Wikipedia".

The dots were initially placed at `bottom: 14px` and were invisible — `.detail__sheet` overlaps the
foot of the hero by 24px and painted over them. They sit on the flags' baseline now, right-aligned
so they cannot collide with the availability badge.

**The Nearby filter bar's scroll edge is faded.** It is a 239px window onto ~500px of chips, so the
last visible chip is always sliced part-way through; with a hard edge that reads as a rendering
fault rather than as "there is more". The dots the chips gained made the overflow more likely,
which is what surfaced it.

### Rejected: cycling imagery in list cards (2026-09-22)

Ro asked whether a hover/thumb-over effect cycling through scenes would bloat the app. Recorded
because the answer is not about bytes.

**In a list, no — and the reason is legibility, not weight.** A list where every row animates
competes with itself; the eye cannot settle anywhere, so a screen built for scanning becomes one
you have to fight. The payload cost is real too — 18 rows x 3 photos is 54 decodes where 18 were
needed, on a device that may be roaming — but the scanning cost is what rules it out.

There is no hover on a phone, so the mobile forms would be press-and-hold (which fights the scroll
gesture, and is invisible as an affordance) or a per-row carousel (which eats the horizontal
gesture and turns every row into a mini-gallery).

**Where it is right: one surface at a time, on purpose.** The onboarding splash cross-fades four
stills because it is a single full-screen frame with nothing to scan. The detail gallery swipes
because the guest has already chosen that listing and is looking, not scanning. Both are one
subject with the viewer's full attention; a list is neither.

### Geofencing — wired (2026-09-22)

`apps/tourist-web/src/data/geofence.ts` is pure: `evaluateFences(origin, fences, previous)` returns
`entered` **only on the transition** into a fence, so a caller needs no "have I shown this" flag of
its own. 250m entry radius, 400m exit radius — the asymmetry is hysteresis, so a fix jittering
across the boundary cannot re-fire the offer.

**Now wired.** `Explore.tsx` runs two effects rather than one timer:

- **Real GPS.** When `useGuestPosition()` reports `position.kind === 'real'`, the fence set is built
  from the promoted experience's vendor coordinates filtered to the current island, and
  `evaluateFences` is called against it. The offer fires on `entered`. Hysteresis state is held in a
  `useRef<FenceState>` so it survives re-renders without causing them.
- **Demo fallback.** When the position is simulated or consent was refused, the original 6-second
  timer runs exactly as before.

Both paths are kept deliberately: the demo must never break in a room, and the real path must be
real when a phone is actually on the island. Nothing about the demo flow changed.

**Still not done: unit tests.** The 250m/400m hysteresis logic has no guard tests. This is the
highest-value remaining test work — the function is pure, so it is cheap to cover, and the whole
moat rests on it. Do this before the next demo.

Demonstrating it live still needs either a dev-only position override or `watchPosition` with a
simulated coordinate feed. Ro has not been asked which he wants.

---

### "Open Now" removed — the badge was fabricated (2026-09-22)

Both tourist-web cards carried `<Badge tone="brand">Open Now</Badge>` as a literal. Nothing backed
it. Grepping `openNow` / `opensAt` / `openingHours` / `isOpen` across `packages/demo/src/dataset.ts`
and `apps/tourist-web/src/data/` returns nothing — there is no opening-hours field on
`DemoExperience`, `DemoVendor` or anywhere else, so the app had no way to know whether a vendor was
open, and the badge was true only by coincidence.

That matters more than a stray string because of where it sat. On the Explore feature card it was
the first thing in `feature__flags`, directly above the title and one block above the from-price and
the rating; on the detail hero it sat in the same row as the availability badge. Every other figure
around it is derived from real data. A viewer has no way to tell which of the four claims is
computed and which is typed in, so the typed-in one inherits the credibility of the other three.
That is exactly the failure mode §8 already guards against for ratings ("a live card shows no rating
rather than a fabricated one") — this was the same defect, unnoticed.

**Fixed by deriving from availability, not by adding opening hours.** `firstBookableDay` and
`slotsFor` in `apps/tourist-web/src/data/availability.ts` already drove a truthful "Available today"
/ "Next today 4:30 PM" on the detail screen, so the honest signal existed and was simply not used on
the card. Added `availabilityLabel(experience)` to that module: it returns `"Available today"` or
`"Available Sat"`, and **null** when nothing is bookable in the next fourteen days, so the caller
drops the badge rather than asserting anything about a listing that is not running.

- `Explore.tsx` `FeatureCard` — `Open Now` → `{availability ? <Badge tone="brand">{availability}</Badge> : null}`.
- `ExperienceDetail.tsx` hero — `Open Now` deleted outright. The badge beside it already said
  "Available today / Sat" truthfully; deriving a second badge from the same call would have said the
  same thing twice. The surviving badge was promoted `plain` → `brand` so the hero keeps its accent.

The option not taken was adding real `openingHours` to `DemoExperience` plus a timezone computation
off `DemoIsland.timezone`. It is strictly more work, needs a hand-authored value per experience, and
would create a second timing system alongside the availability one that already exists. If opening
hours are ever wanted as a genuine product feature — a vendor setting them in the portal, a guest
filtering on them — that is a real milestone, not a badge fix, and it should be built then rather
than faked now.

**Still hardcoded, deliberately left:** `<Badge tone="plain">Cruise-Friendly</Badge>` sits in the
same `feature__flags` row on every feature card and has exactly the same problem — no field backs
it, and there is no cruise-relevance flag anywhere in the dataset. It was out of the scope asked
for, so it was not touched, but it is the same defect and should go the same way: either a real
field on `DemoExperience`, or delete it. Do not leave it there on the assumption it was reviewed.

Gates: `npx pnpm@9 vitest run` → 289 passed (17 files), unchanged. `npx pnpm@9 --filter
@cvip/tourist-web exec tsc --noEmit` → clean. No test was added for `availabilityLabel`; it is a
pure function over `firstBookableDay` and worth covering next to the hysteresis tests above.

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
2. **`geofence.ts` unit tests** — the 250m/400m hysteresis has no guard tests and the function is
   pure, so they are cheap. The geofence is one of the two moats Ro named; it should not be the
   untested file. Do this first.
3. **The first live Stripe payment.** The backend is deployed and the webhook registered, but no
   end-to-end payment has ever been executed. Card `4242 4242 4242 4242` on the Vercel URL. Until
   that is done, M3 is not complete no matter what the code says.
4. **A licensed-media path in the pipeline** (~20 minutes). `manifest.json` and `fetch.py` are
   Commons-only *by design*, and will refuse anything else. Operator-supplied photography needs its
   own route with the permission recorded beside the file. Needed for every real vendor eventually,
   and it is what lets the Mystic Mountain photograph drop straight in the moment permission arrives.
5. **Commissioned photography** — see §8. The biggest single gap between this and a product.

**Screens not yet taken through the reference pass.** The 2026-09-22 UI work covered Welcome,
Profile, Explore's chips and the feature card. Against the eight-step journey map, these were
looked at and left:

- **Explore header** — the reference leads with the destination ("Welcome to Cayman Islands") more
  prominently than ours does.
- **Experience detail** — the reference pairs *Top Rated* / *Bestseller* badges above the title.
- **Offer/voucher popup** — works and reads well, but the reference uses a gold CTA where ours is
  green. Worth aligning if the gold CTA language from the new Welcome is adopted more widely.

### Still not drawn to the mockups

1. ~~**Vendor portal**~~ — visual language done 2026-09-10, built out to a real portal 2026-09-22.
2. **Map view** — blocked on OD-05. Ships as a stylised shape map; the notice that used to sit
   under it saying so was removed on 2026-09-22 with the rest of the demo labelling, so the map now
   presents without qualification while remaining non-geographic. Worth revisiting.

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

- **Nothing in either app now discloses that it is a demonstration.** All labelling was removed on
  2026-09-22 at Ro's instruction (§5). The seeded inventory, simulated payment, simulated position
  and rule-matched Irie all still are what they were. *(The offer is no longer purely timer-based —
  it fires on a real fix when there is one, and falls back to the timer otherwise.)* This is the
  single most important thing to know before showing the app to anyone who is not Ro.
- **The vendor portal's write actions are in-memory, not persisted.** *(Revised 2026-09-22 — they
  were previously inert.)* Edit, Publish/Unpublish, New listing and the availability slot capacities
  now all work: the pages are `'use client'`, seed local state from `vendorListings()`, and mutate
  it. Nothing reaches Supabase and everything resets on reload, which is correct for a demonstration
  and wrong for a product. `lib/vendorData.ts` itself remains read-only.
- **The geofence is wired but untested.** *(Revised 2026-09-22 — it was previously not wired at
  all.)* `Explore.tsx` calls `evaluateFences` on a real GPS fix and keeps the 6-second timer only as
  the fallback for simulated or consent-refused positions. **It still has no unit tests**, and the
  250m/400m hysteresis is exactly the kind of logic that needs them. See §5.
- **`packages/demo` and `supabase/seed/seed.sql` are out of step.** The `[Demo]` trading-name
  prefix was stripped from the TypeScript dataset only. They were deliberately kept identical
  before this; reseeding will reintroduce the prefix.
- **One guard test was removed, not fixed.** `store.test.ts`'s "labels every visible listing as
  demo content (operating rule 9)" asserted the `[Demo]` prefix. The instruction revoked the rule
  rather than the test catching a regression, so it was deleted and a dated marker left in its
  place. Suite is green at 289 (was 290).
- **The real Stripe path has not been tested end-to-end yet.** All infrastructure is deployed and
  configured (Edge Functions active, anonymous sign-in on, secrets set, webhook registered, app
  live on Vercel). The chain from `callCheckout` → Stripe → webhook → `supabaseStore.confirmBooking`
  → `BookingReturn` polling has never executed. Run card `4242 4242 4242 4242` on the live URL
  to confirm the full flow (see §5).
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
- **"Cruise-Friendly" on the Explore feature card is fabricated.** No field backs it. Its sibling
  "Open Now" was removed on 2026-09-22 for the same reason (see §5); this one was out of scope and
  survives. Either give `DemoExperience` a real flag or delete the badge.
- **Ratings are demo-only.** Real ratings aggregate over the `reviews` table; nothing computes that
  yet, so a live card shows no rating rather than a fabricated one.
- **No map renders.** OD-05 is open.
- **Photography is placeholder.** Freely licensed and correctly attributed, but it is not the actual
  vendors. Commissioned or licensed photography is still needed before anything ships publicly. See
  [`media-credits.md`](media-credits.md) and `scripts/seed-media/README.md`. *(Attribution moved
  to `/credits` on 2026-09-23 — it is no longer on individual images; the `Photo` component's `credit`
  prop is kept inert to prevent reintroduction.)*
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
