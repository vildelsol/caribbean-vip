# Animation plans

Plans 001-005 were produced by `improve-animations` against `apps/tourist-web` at
commit `19506a1`. Plans 006-012 are a separate audit of `apps/vendor-web`, which
the first audit did not cover.

Each plan is self-contained: an executor with no context from the audit can work
from the plan alone. Every value (curve, duration, scale, file:line) is spelled
out inside it.

## Plans — `apps/tourist-web` (001-005)

| # | Title | Severity | Category | Scope | Status |
| --- | --- | --- | --- | --- | --- |
| [001](001-motion-tokens-and-ease-out.md) | Add motion tokens and replace every `ease` transition with ease-out | HIGH | Easing + Cohesion | 12 files, ~55 lines | DONE |
| [002](002-irie-aura-composite.md) | Stop the Irie badge aura repainting on every screen | HIGH | Performance | 1 file, ~25 lines | TODO |
| [003](003-skeleton-shimmer-composite.md) | Stop the skeleton shimmer repainting every frame | HIGH | Performance | 1 file, ~20 lines | TODO |
| [004](004-reduced-motion-delay.md) | Reduced motion leaves the Welcome screen blank for 620ms | MEDIUM | Accessibility | 1 file, 2 lines | DONE |
| [005](005-route-transitions.md) | Give navigation a direction (View Transitions) | MEDIUM | Missed opportunity | 16 files, 1 new | TODO |

## Plans — `apps/vendor-web` (006-012)

The vendor portal had never been audited. `app/vendor.css` is 1,269 lines and
contained **three** `transition` declarations and **zero** `@keyframes`, while the
pages gained genuinely async writes (`lib/listings.ts`, `lib/availability.ts`)
with loading, busy and error states that have no motion at all.

| # | Title | Severity | Category | Scope | Status |
| --- | --- | --- | --- | --- | --- |
| [006](006-saved-flash-one-way.md) | The "Saved" flash only transitions on the way in, and transitions a property that cannot carry it | HIGH | Easing + Correctness | 1 file, ~14 lines | TODO |
| [007](007-modal-sheet-entrance.md) | The edit and new-listing sheets pop into existence | HIGH | Missed opportunity | 1 file, ~45 lines | TODO |
| [008](008-verdict-arrival.md) | The redemption verdict arrives with no motion | HIGH | Missed opportunity | 1 file ~30 lines, 1 TSX prop | TODO |
| [009](009-error-shoves-the-save-button.md) | An async error shoves the Save button under the vendor's thumb | MEDIUM | Missed opportunity + Correctness | 1 file, ~20 lines | TODO |
| [010](010-busy-button-looks-broken.md) | Every in-flight button wears the disabled treatment | MEDIUM | Missed opportunity + Cohesion | 1 CSS ~25 lines, 3 TSX attrs | TODO |
| [011](011-loading-states-are-static-text.md) | Every loading state is a static line of grey text | MEDIUM | Missed opportunity | 1 CSS ~20 lines, 2 TSX classes | TODO |
| [012](012-untransitioned-state-changes.md) | Nav, slots and secondary controls change state with no transition | LOW | Cohesion & tokens | 1 file, ~10 lines | TODO |

### Recommended order

```
006  →  012  →  007  →  008  →  009  →  010  →  011
```

**006 first.** It is the only one fixing a defect rather than adding motion: the
`transition` is declared on the state class so the flash never fades out, and the
property it transitions (`outline`) is not interpolable from nothing, so it never
faded in either. Two of its lines are the same class of fix as plan 004.

**012 second.** It establishes that a state change in the portal transitions at
all, which is the assumption every later plan builds on, and it pins the single
press depth (0.985) before 007-011 add controls that could acquire a second one.

**007 and 008 are the two HIGHs that add motion** and are independent of each
other. 008 is the higher-value one — redemption is the portal's only flow wired
end to end — but 007 is purely CSS while 008 needs one TSX prop, so 007 is the
cheaper of the two to land.

**009, 010 and 011 are all async-state motion** and touch disjoint selectors
(`.field-error`, `.btn[aria-busy]`, `.card__note--loading`). Any order, or in
parallel.

### Dependencies

| Plan | Depends on | Nature |
| --- | --- | --- |
| 006 | 001 | Hard — uses `--dur-base` / `--ease-out` / `--ease-entrance`. 001 is DONE. |
| 007 | 001 | Hard — uses `--ease-drawer`, `--dur-fast`, `--dur-base`. 001 is DONE. |
| 008 | 001 | Hard — uses `--ease-entrance`, `--dur-base`. 001 is DONE. |
| 009 | 001 | Hard — uses `--ease-out`, `--dur-fast`. 001 is DONE. |
| 010 | 001 | Hard — uses `--ease-in-out`. 001 is DONE. |
| 011 | 001 | Hard — uses `--ease-in-out`. 001 is DONE. |
| 012 | 001, 006 | 001 for the tokens; 006 soft — 012's grep counts transitions and 006 removes the dead one. |

No plan in this group needs a new token. The seven motion tokens 001 added are
the whole vocabulary.

### What the vendor plans deliberately do not do

- **No restyle.** No new colour, type size, spacing or layout. Every plan adds a
  `transition`, an `animation`, a `@keyframes`, or a `transform`, and nothing
  else. 010's `0.78` and 011's `0.45` are opacity floors on existing colours, not
  new colours.
- **No spinner and no skeleton.** The portal has neither anywhere, and both need a
  shape and a colour that only a design decision can supply. 010 and 011 use an
  opacity pulse on the element that is already there instead, and each says why.
- **No exit animations.** The sheets (007) and the errors (009) unmount
  synchronously, so an exit needs TSX state the plans are not permitted to add.
  Each says so explicitly rather than leaving the asymmetry unexplained.
- **No sliding nav pill.** 012 rejects it: `VendorNav.tsx` renders four
  independent `<Link>`s, so a single moving pill is a shared-element transition,
  not a motion tweak.
- **No new keyframe without a `vendor-` prefix.** `vendor.css` had no keyframes at
  all, and the prefix keeps the portal's names from ever colliding with the
  tourist app's.

### Vendor findings not planned

| Sev | Location | Finding |
| --- | --- | --- |
| MED | `app/availability/page.tsx:64-68` | `setSlotCapacity` is awaited with **no `busy` state in the component at all** (`:29-32` declares `loading`, `error`, `editingSlot`, `editValue`). The ✓ button stays enabled for the whole write, so a double-tap sends the capacity change twice. State management, not motion — 010 covers it for free once the flag exists. |
| LOW | `app/vendor.css:1213-1215` | `.listing--saved` also changes the row's `border-radius` for 1800ms. A restyle question; 006 leaves it alone deliberately. |
| LOW | `app/vendor.css:393` | `transition: width 0.4s` on the onboarding progress bar lays out every frame. Only one element and a determinate bar on a once-per-vendor screen, so the cost is bounded — but it is the same mechanism as the tourist app's gallery-dot finding. |
| LOW | `components/Scanner.tsx:120` | The camera region (`.camera`, `vendor.css:220`) appears and disappears with no transition when the camera starts and stops, on the screen held in front of a guest. |

## Recommended order — `apps/tourist-web`

```
004  →  001  →  002  →  003  →  005
```

**004 first.** Two lines, no dependencies, fixes a real accessibility defect, and
it is the cheapest thing on the list. Land it and move on.

**001 second, and it gates two others.** It introduces `--ease-out`,
`--ease-in-out`, `--ease-drawer`, `--ease-entrance` and the three duration
tokens. Plans 002 and 005 reference those tokens in their target code. Both say
what to write if 001 has not landed, so they are not hard-blocked — but doing
001 first avoids writing literals that have to be swapped again.

**002 and 003 are independent** of each other and of everything else. They touch
one file each and can be done in parallel or in either order. Together they
remove both of the app's permanent paint loops.

**005 last.** It is the largest change, the only one that adds a file, and the
only one that touches TSX. Do it when the rest is green so that if a transition
misbehaves you know the cause is 005 and nothing else.

## Dependencies — `apps/tourist-web`

| Plan | Depends on | Nature |
| --- | --- | --- |
| 001 | — | — |
| 002 | 001 | Soft — uses `--dur-fast` / `--ease-out`; fallback literal given in the plan |
| 003 | — | — |
| 004 | — | — |
| 005 | 001 | Soft — uses `--ease-drawer`; fallback literal given in the plan |

## What the tourist plans deliberately do not do

- **No motion library.** The app has none and does not need one for this work.
  Every plan is CSS, except 005's one small hook. Any plan that would require
  `framer-motion` or similar was rejected rather than written.
- **No restyling.** 002 and 003 change the *mechanism* of an animation and are
  verified by the result being visually identical. The look was already right.
- **No entrance animations on list content.** Staggering the Explore rails was
  considered and rejected: Explore is the home tab, opened dozens of times per
  session, and an entrance you see that often stops reading as delight and starts
  reading as latency.
- **No back-navigation animation** (yet). 005 explains why shipping a half-working
  back transition is worse than a consistent cut, and leaves the CSS in place for
  a follow-up.

## Tourist findings not yet planned

From the audit, still open:

| Sev | Location | Finding |
| --- | --- | --- |
| MED | `Checkout.tsx:590-604` | The Pay button reuses the `opacity: 0.45` disabled treatment while the payment is in flight — the highest-stakes button signals "broken" exactly while it works. No spinner. |
| MED | `ExperienceDetail.css:494`, `Welcome.css:637` | `transition: width` on gallery dots and step pills — layout every frame, and siblings reflow with them. |
| LOW | 23 sites | Five press depths (`.99` ×10, `.97` ×6, `.985` ×4, `.96`, `.98`) with no rule. `.irie-badge` and `.ex-mood` invert the size relationship. |
| LOW | `Checkout.tsx:584-589` | `payError` is inserted above the Pay button with no motion, shoving it down. |
| LOW | `Confirmation.css` | Contains no motion of any kind — the screen reached after paying, and the one a demo lands on. |
