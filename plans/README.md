# Animation plans — `apps/tourist-web`

Produced by `improve-animations` against commit `19506a1`.

Each plan is self-contained: an executor with no context from the audit can work
from the plan alone. Every value (curve, duration, scale, file:line) is spelled
out inside it.

## Plans

| # | Title | Severity | Category | Scope | Status |
| --- | --- | --- | --- | --- | --- |
| [001](001-motion-tokens-and-ease-out.md) | Add motion tokens and replace every `ease` transition with ease-out | HIGH | Easing + Cohesion | 12 files, ~55 lines | TODO |
| [002](002-irie-aura-composite.md) | Stop the Irie badge aura repainting on every screen | HIGH | Performance | 1 file, ~25 lines | TODO |
| [003](003-skeleton-shimmer-composite.md) | Stop the skeleton shimmer repainting every frame | HIGH | Performance | 1 file, ~20 lines | TODO |
| [004](004-reduced-motion-delay.md) | Reduced motion leaves the Welcome screen blank for 620ms | MEDIUM | Accessibility | 1 file, 2 lines | TODO |
| [005](005-route-transitions.md) | Give navigation a direction (View Transitions) | MEDIUM | Missed opportunity | 16 files, 1 new | TODO |

## Recommended order

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

## Dependencies

| Plan | Depends on | Nature |
| --- | --- | --- |
| 001 | — | — |
| 002 | 001 | Soft — uses `--dur-fast` / `--ease-out`; fallback literal given in the plan |
| 003 | — | — |
| 004 | — | — |
| 005 | 001 | Soft — uses `--ease-drawer`; fallback literal given in the plan |

## What these plans deliberately do not do

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

## Findings not yet planned

From the audit, still open:

| Sev | Location | Finding |
| --- | --- | --- |
| MED | `Checkout.tsx:590-604` | The Pay button reuses the `opacity: 0.45` disabled treatment while the payment is in flight — the highest-stakes button signals "broken" exactly while it works. No spinner. |
| MED | `ExperienceDetail.css:494`, `Welcome.css:637` | `transition: width` on gallery dots and step pills — layout every frame, and siblings reflow with them. |
| LOW | 23 sites | Five press depths (`.99` ×10, `.97` ×6, `.985` ×4, `.96`, `.98`) with no rule. `.irie-badge` and `.ex-mood` invert the size relationship. |
| LOW | `Checkout.tsx:584-589` | `payError` is inserted above the Pay button with no motion, shoving it down. |
| LOW | `Confirmation.css` | Contains no motion of any kind — the screen reached after paying, and the one a demo lands on. |
