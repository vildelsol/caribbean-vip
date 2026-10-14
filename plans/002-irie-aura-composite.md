# 002 — Stop the Irie badge aura repainting on every screen

- **Status**: TODO
- **Commit**: 19506a1
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 1 file, ~25 lines

## Problem

The bottom navigation's centre badge runs a gold "presence" halo, forever, on
every screen in the app:

```css
/* apps/tourist-web/src/components/BottomNav.css:97-122 — current */
@keyframes irie-aura {
  0%, 100% {
    box-shadow:
      0 8px 18px rgba(12, 74, 63, 0.34),
      0 0 0 0 rgba(212, 175, 106, 0);
  }
  55% {
    box-shadow:
      0 8px 18px rgba(12, 74, 63, 0.34),
      0 0 0 7px rgba(212, 175, 106, 0.18);
  }
}

.irie-badge {
  animation: irie-aura 3.2s ease-in-out infinite;
}

.irie-badge--on {
  animation: irie-aura 3.2s ease-in-out infinite;
  transform: scale(1.04);
}
```

`box-shadow` is a **paint** property. It cannot be handed to the compositor, so
the browser re-rasterises the badge and its surroundings on every frame of a
3.2-second loop that never ends. `BottomNav` is rendered by `App.tsx` outside
`<Routes>`, so this runs on every screen, for the entire session, including
while the guest is scrolling Explore.

PRD §16 targets one-handed outdoor use on a phone. A permanent paint loop is
the one thing guaranteed to compete with scroll on a mid-range Android and to
draw battery for the whole session.

Two secondary problems in the same block:

1. The keyframes re-declare the **static** drop shadow
   (`0 8px 18px rgba(12, 74, 63, 0.34)`) on every keyframe, purely so the
   animated ring does not erase it. That shadow is already on `.irie-badge:107`.
2. `.irie-badge--on` re-declares a byte-identical `animation` shorthand. It is
   harmless today (an unchanged computed `animation-name` does not restart the
   animation) but it is a trap: change the duration in one place and the two
   silently disagree.

## Target

Move the halo onto a pseudo-element and animate `transform` + `opacity`, both of
which the compositor can run without repainting anything.

```css
/* apps/tourist-web/src/components/BottomNav.css — target */

.irie-badge {
  width: 52px;
  height: 52px;
  margin-top: -20px;
  border-radius: var(--r-pill);
  background: var(--green-900);
  border: 3px solid var(--ivory-raised);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 18px rgba(12, 74, 63, 0.34);
  transition: transform var(--dur-fast) var(--ease-out);
  /* The halo below is positioned against this. */
  position: relative;
}

/*
 * Irie's presence halo.
 *
 * This was a `box-shadow` spread animated from 0 to 7px, which reads correctly
 * and repaints the badge on every one of the ~190 frames in each 3.2s cycle —
 * forever, on every screen, because the bar lives outside <Routes>. A ring drawn
 * once and then scaled is the same picture with none of the paint: `transform`
 * and `opacity` are the only two properties the compositor can animate on its
 * own, so the main thread is free to scroll.
 *
 * `inset: -7px` with a 7px border puts the ring's inner edge exactly on the
 * badge's edge at rest scale; scale(0.79) is 52/66, which collapses it back
 * under the badge where it is invisible anyway at opacity 0.
 */
.irie-badge::before {
  content: '';
  position: absolute;
  inset: -7px;
  border-radius: var(--r-pill);
  border: 7px solid rgb(212, 175, 106);
  opacity: 0;
  pointer-events: none;
  animation: irie-aura 3.2s ease-in-out infinite;
}

@keyframes irie-aura {
  0%,
  100% {
    opacity: 0;
    transform: scale(0.79);
  }
  55% {
    opacity: 0.18;
    transform: scale(1);
  }
}

.irie-badge--on {
  transform: scale(1.04);
}
```

## Repo conventions to follow

- This codebase comments **why**, at length, above a rule — never line-by-line.
  The comment block above `.irie-badge::before` is written in that voice and
  should be kept as-is.
- Exemplar of a pseudo-element used for a non-painting job:
  `apps/tourist-web/src/design/global.css:150-170`, the `::after` 44px tap
  targets ("Purely a target. It must never paint").
- Colour normally comes from a token (`kit.css:1`: "Colour only ever comes from
  a custom property"). The gold here is already a raw `rgba(212, 175, 106, …)`
  literal in the current code; keep the literal so this plan changes only the
  mechanism. Do not invent a token for it.
- `transition: transform var(--dur-fast) var(--ease-out)` assumes **plan 001 has
  landed**. If it has not, write `transition: transform 0.15s ease;` unchanged
  and leave the easing to 001.

## Steps

1. In `apps/tourist-web/src/components/BottomNav.css`, add `position: relative;`
   to the `.irie-badge` rule at line ~76 (the first one, which sets width/height).
2. Replace the `@keyframes irie-aura` block (lines ~97-112) with the
   `transform`/`opacity` version from Target.
3. Replace the second `.irie-badge { animation: … }` rule (line ~116) with the
   `.irie-badge::before` rule from Target.
4. Replace `.irie-badge--on` (lines ~120-122) with the two-line version that
   sets `transform: scale(1.04)` only — delete its duplicate `animation` line.
5. Confirm `.irie-badge`'s static `box-shadow: 0 8px 18px rgba(12, 74, 63, 0.34)`
   is still present exactly once and is no longer repeated in any keyframe.

## Boundaries

- Do NOT change the halo's colour, its 7px size, its 3.2s period, its 55% peak,
  or its 0.18 peak opacity. The look must be indistinguishable; only the
  mechanism changes.
- Do NOT touch `.bottom-nav__item--centre:active .irie-badge` (line ~93). The
  press scale must keep working, and because the ring is a child it will scale
  with the badge — which is correct.
- Do NOT add `will-change`. A 52px element is already cheap once it is
  composited; adding a permanent layer hint here would trade one always-on cost
  for another.
- Do NOT touch any other file.

## Verification

- **Mechanical**: `pnpm --filter @cvip/tourist-web build` → succeeds.
- **Feel check**: `pnpm tourist`.
  - Side-by-side against `git stash`: the halo must look the same — same gold,
    same thickness, same slow breath. If it looks thinner or harder-edged, the
    `inset`/`border` pair is wrong.
  - **The actual proof**: DevTools → Rendering → tick **Paint flashing**. Before
    the change the bottom-nav centre flashes green ~3× per second on every
    screen. After, it must not flash at all while idle.
  - DevTools → Performance → record 5s sitting idle on Explore. The main thread
    should be flat. Before the change it shows a regular paint sawtooth.
  - Scroll Explore hard with one finger while watching the badge. The halo must
    keep breathing smoothly during the scroll.
  - Tap the Irie tab. The badge grows to 1.04 and the halo grows with it; the
    breath must NOT jump back to the start of its cycle.
  - Press and hold the badge: it shrinks to 0.96, ring included.
  - Toggle `prefers-reduced-motion: reduce` in DevTools → Rendering. The ring
    must be invisible and still, not frozen mid-pulse.
- **Done when**: paint flashing shows nothing on the idle bottom nav, and the
  halo is visually identical to the stashed version.
