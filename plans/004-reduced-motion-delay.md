# 004 — Reduced motion leaves the Welcome screen blank for 620ms

- **Status**: TODO
- **Commit**: 19506a1
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file, 2 lines

## Problem

The global reduced-motion block collapses durations but **never touches delays**:

```css
/* apps/tourist-web/src/design/global.css:558-566 — current */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

The Welcome screen staggers its entrance with delays, and uses `both` fill:

```css
/* apps/tourist-web/src/screens/Welcome.css:400, 432, 477 — current */
.wl__islands-line { animation: wl-rise 720ms cubic-bezier(0.16, 1, 0.3, 1) 300ms both; }
.wl__proof        { animation: wl-rise 720ms cubic-bezier(0.16, 1, 0.3, 1) 500ms both; }
.wl__actions      { animation: wl-rise 720ms cubic-bezier(0.16, 1, 0.3, 1) 620ms both; }

/* Welcome.css:480-489 */
@keyframes wl-rise {
  from { opacity: 0; transform: translate3d(0, 14px, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
```

`animation-fill-mode: both` applies the `from` state **during the delay**. With
the duration forced to `0.001ms` but the delay left at `620ms`, a guest who has
asked for reduced motion gets:

- the headline invisible for 300ms,
- the proof list invisible for 500ms,
- **all three call-to-action buttons invisible for 620ms**,

and then each one snaps into existence with no transition at all.

This is the first screen of the app and the only route rendered before
onboarding completes (`App.tsx:41`). Someone who turned motion down because
movement makes them unwell is served a longer blank screen and a harder pop than
someone who left it on. That inverts the entire point of the setting.

The same block has the matching gap for `transition-delay`, which nothing in the
app relies on today but which will bite the moment someone adds a delayed
transition.

## Target

```css
/* apps/tourist-web/src/design/global.css — target */
/*
 * Reduced motion means less movement, not a slower screen.
 *
 * Collapsing `animation-duration` without collapsing `animation-delay` is worse
 * than leaving the animation alone: `wl-rise` on the Welcome screen fills `both`,
 * so the `from` state (opacity: 0) holds for the whole delay and the guest who
 * asked for less motion waits 620ms in front of three invisible buttons and then
 * gets a hard pop. The delays have to go to zero with the durations.
 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    transition-delay: 0ms !important;
    scroll-behavior: auto !important;
  }
}
```

## Repo conventions to follow

- The block already exists at `apps/tourist-web/src/design/global.css:558`.
  Extend it in place; do not add a second `@media (prefers-reduced-motion)` block.
- This file explains the reason above each rule at length (see the `overflow-x: clip`
  and `touch-action: manipulation` comments). The comment above is written to match.
- Four screens carry their own local `prefers-reduced-motion` blocks
  (`Irie.css:111`, `Irie.css:289`, `Irie.css:959`, `Offer.css:107`). They use
  `animation: none` and are unaffected by this change — leave them alone.

## Steps

1. In `apps/tourist-web/src/design/global.css`, add `animation-delay: 0ms !important;`
   immediately after the existing `animation-duration` line in the
   `@media (prefers-reduced-motion: reduce)` block.
2. Add `transition-delay: 0ms !important;` immediately after the existing
   `transition-duration` line in the same block.
3. Add the explanatory comment above the `@media` rule.

## Boundaries

- Do NOT change `Welcome.css`. The delays are correct for guests who have not
  asked for reduced motion, and the staggered entrance is a deliberate,
  well-tuned effect. This plan fixes the override, not the animation.
- Do NOT touch the four local `prefers-reduced-motion` blocks.
- Do NOT add `animation-fill-mode` overrides — the fill is what makes the
  non-reduced version correct.
- Do NOT touch any other file.

## Verification

- **Mechanical**: `pnpm --filter @cvip/tourist-web build` → succeeds.
- **Feel check**: `pnpm tourist`. Clear LocalStorage so the Welcome screen shows
  (it only renders while `state.onboarded` is false — `App.tsx:41`).
  - DevTools → Rendering → **Emulate CSS prefers-reduced-motion: reduce**, then
    hard-reload.
  - The headline, the proof list and all three buttons must be **present and
    legible in the very first painted frame**. Time it with DevTools →
    Performance → screenshots if unsure: there must be no frame in which the
    buttons are missing.
  - Turn the emulation off and reload. The staggered rise must be completely
    unchanged — headline at 300ms, proof at 500ms, actions at 620ms.
  - Confirm the Irie sparkles and the badge halo are still stopped under reduced
    motion (they were before; this change must not revive them).
- **Done when**: with reduced motion emulated, no element on the Welcome screen
  is invisible in the first frame, and with it off the entrance is byte-identical
  to before.
