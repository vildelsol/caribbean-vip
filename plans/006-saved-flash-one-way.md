# 006 — The "Saved" flash only transitions on the way in, and transitions a property that cannot carry it

- **Status**: TODO
- **Severity**: HIGH
- **Category**: Easing & duration + Correctness
- **Estimated scope**: 1 file, ~14 lines. The core defect is 2 lines and is the same class as plan 004.

## Problem

`apps/vendor-web/app/listings/page.tsx` adds a state class for 1800ms after a save:

```tsx
/* apps/vendor-web/app/listings/page.tsx:100-101 — current */
setSaved(id);
setTimeout(() => setSaved(null), 1800);
```

```tsx
/* apps/vendor-web/app/listings/page.tsx:232 — current */
<li key={l.id} className={`listing ${saved === l.id ? 'listing--saved' : ''}`}>
```

The CSS it toggles:

```css
/* apps/vendor-web/app/vendor.css:1213-1217 — current */
.listing--saved {
  outline: 2px solid var(--green-900, #16302a);
  border-radius: 10px;
  transition: outline var(--dur-base) var(--ease-out);
}
```

Three defects, in order of consequence.

### 1. The transition lives on the state class, so it only applies on entry

A `transition` declared inside the modifier class is read from the element's
computed style **in its new state**. Going in, `.listing--saved` is present, the
browser sees the transition and animates. Coming out 1800ms later, the class is
gone, so no `transition` property applies at all and the outline **vanishes in
one frame**. The acknowledgement therefore fades in and then hard-cuts out — the
asymmetry is visible, and the hard cut is the half the vendor is most likely to
catch, because by 1800ms they have looked back at the row.

This is the same defect class as plan 004: the fix is to move the declaration
onto the base selector so it is present in both states.

### 2. `outline` is the wrong property to transition

`.listing` has no `outline` declaration, so the transition's `from` value is the
initial `outline-color: currentColor` with `outline-style: none` and
`outline-width: medium`. An `outline-style` change from `none` to `solid` is
**not interpolable** — style is a discrete property. The result is that the
outline's *presence* snaps and only its colour has anything to interpolate, from
`currentColor` (near-black ink) to `--green-900`. Those two are close enough that
the "fade" the declaration promises is invisible even on the way in. The
transition is, in practice, dead code.

### 3. The notice text appears with no motion and reflows the row

```tsx
/* apps/vendor-web/app/listings/page.tsx:263-265 — current */
{saved === l.id && (
  <p className="listing__saved-notice" aria-live="polite">Saved</p>
)}
```

`.listing` is `display: flex; flex-wrap: wrap` (`vendor.css:904-911`), so this
paragraph is inserted as a new flex line and the row grows by its height, then
shrinks again 1800ms later. Every listing below it jumps twice per save. The
notice itself has no entrance (`vendor.css:1219-1225`).

### Note: `border-radius: 10px` is a restyle, not motion

`.listing--saved` also changes the row's `border-radius` for 1800ms. That is a
visual-design question, not a motion one, and is **explicitly out of scope for
this plan** — leave the line exactly as it is. It is recorded here only so the
executor does not think it was overlooked.

## Target

```css
/* apps/vendor-web/app/vendor.css — target, replacing lines 1213-1225 */

/* ── Listing saved flash ── */

/*
 * The acknowledgement is a box-shadow ring rather than an outline: `outline-style`
 * is a discrete property, so an outline appearing from nothing cannot be
 * interpolated and the previous `transition: outline` never ran. box-shadow is
 * interpolable from `0 0 0 0`, is composited, and — unlike a border — still does
 * not affect layout, which matters because the row is a wrapping flex container.
 *
 * The transition sits on `.listing`, not on `.listing--saved`, so it is in the
 * computed style in BOTH states and the ring fades out as well as in. Declared on
 * the modifier it only ever applied on entry and the ring vanished in one frame.
 */
.listing {
  transition: box-shadow var(--dur-base) var(--ease-out);
}

.listing--saved {
  box-shadow: 0 0 0 2px var(--green-900, #16302a);
  border-radius: 10px;
}

/*
 * The notice is absolutely positioned out of flow. In flow it added a wrapped
 * flex line, so the row grew for 1800ms and every listing below it jumped twice
 * per save — a vendor reaching for the next row's Edit button would have it move
 * under their thumb.
 */
.listing__saved-notice {
  position: absolute;
  right: 0;
  bottom: 16px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--green-900, #16302a);
  text-align: right;
  margin-top: 4px;
  animation: vendor-saved-in var(--dur-base) var(--ease-entrance) both;
}

@keyframes vendor-saved-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

The absolute positioning needs a containing block, which `.listing` does not
currently establish. Add one line to the existing `.listing` rule:

```css
/* apps/vendor-web/app/vendor.css:904-911 — target, one line added */
.listing {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding: 16px 0;
  border-top: 1px solid var(--border, rgba(22, 48, 42, 0.1));
  flex-wrap: wrap;
  position: relative; /* containing block for .listing__saved-notice */
  transition: box-shadow var(--dur-base) var(--ease-out);
}
```

`.listing__actions` sits at the row's right edge with its own bottom padding, so
`bottom: 16px; right: 0` places the notice under the Publish button rather than
over it. Verify this visually — if it overlaps on a narrow viewport, move the
notice to `top: 16px` instead of changing the row's layout.

## Repo conventions to follow

- Motion values come from `packages/ui/tokens.css` (`--ease-out`, `--ease-entrance`,
  `--dur-base`). Do not write a literal curve or duration.
- `apps/vendor-web/app/globals.css:12` imports `@cvip/ui/tokens.css`, so every
  variable above is already in scope in `vendor.css`. No new import.
- `vendor.css` uses `── Name ──` section comments in its lower half and
  `--- Name ---` banners in its upper half. Keep whichever the surrounding block
  already uses; do not renumber or reorder sections.
- This repo comments the *reason* for a rule, not the rule. The comments in the
  Target block are the deliverable, not decoration — keep them.
- `vendor.css` contains **no `@keyframes` at all** today. `vendor-saved-in` will
  be the first. Prefix every keyframe name added to this file with `vendor-` so
  it can never collide with the tourist app's global keyframe namespace.

## Steps

1. Add `position: relative;` and the `transition: box-shadow …` line to the
   existing `.listing` rule at `apps/vendor-web/app/vendor.css:904-911`.
2. Replace the body of `.listing--saved` (`vendor.css:1213-1217`) with the
   `box-shadow` + `border-radius` pair from the Target section. Delete its
   `outline` and its `transition` lines.
3. Replace `.listing__saved-notice` (`vendor.css:1219-1225`) with the Target
   version and add the `@keyframes vendor-saved-in` block directly beneath it.
4. Do not touch `app/listings/page.tsx`. The 1800ms timer and both class
   toggles are already correct; this plan is CSS only.
5. Run the greps in the Verification section.

## Boundaries

- Do NOT change the 1800ms timer at `listings/page.tsx:101`. 1800ms is long
  enough to be noticed by someone whose eyes left the screen, which is the point.
- Do NOT remove `border-radius: 10px` from `.listing--saved`, and do NOT add a
  transition for it. It is a restyle question, deliberately left alone.
- Do NOT add a colour. `--green-900` is already the colour in use here; the
  `box-shadow` reuses it.
- Do NOT touch `apps/tourist-web` or `apps/admin-web`.
- Do NOT add a library.
- If `vendor.css:1213` does not contain `outline: 2px solid var(--green-900`,
  STOP and report the drift rather than guessing which rule was meant.

## Verification

- **Mechanical**:
  - `pnpm lint` → passes.
  - `pnpm --filter @cvip/vendor-web build` → succeeds.
  - `grep -n "transition: outline" apps/vendor-web/app/vendor.css` → **no output**.
  - `grep -n "transition" apps/vendor-web/app/vendor.css | grep -c "listing--saved"`
    → `0`. Any hit means the transition is still on the modifier and the exit is
    still a hard cut.
  - `grep -n "@keyframes" apps/vendor-web/app/vendor.css` → exactly one hit,
    `vendor-saved-in`.
- **Feel check**: `npx pnpm@9 demo`, open `http://localhost:3001/listings`.
  - Edit a listing and save. The ring should fade **in** over ~240ms and, 1800ms
    later, fade **out** over ~240ms. If either end snaps, that end's transition is
    not applying.
  - Watch the listing immediately below the saved one. It must not move at any
    point. Any vertical jump means the notice is still in flow.
  - In DevTools → Animations, set playback to 10% and save again. Both the ring's
    arrival and its departure should be visible as gradients, not steps.
  - Enable `prefers-reduced-motion: reduce` in DevTools → Rendering and save. The
    ring and the notice should both appear instantly and still **disappear after
    1800ms** — the acknowledgement must survive, only its motion is removed. The
    block at `globals.css:82-91` handles this; confirm it does.
- **Done when**: both greps are clean, the ring fades at both ends, and no row
  below the saved one moves.
