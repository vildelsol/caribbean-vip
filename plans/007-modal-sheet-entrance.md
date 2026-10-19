# 007 — The edit and new-listing sheets pop into existence

- **Status**: TODO
- **Severity**: HIGH
- **Category**: Missed opportunity + Cohesion
- **Estimated scope**: 1 file, ~45 lines (2 rules extended, 3 keyframes added).

## Problem

The listings page has two modals, both rendered as bottom sheets:

```tsx
/* apps/vendor-web/app/listings/page.tsx:274-275 — current */
<div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit listing">
  <div className="modal">
```

```tsx
/* apps/vendor-web/app/listings/page.tsx:354-355 — current */
<div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="New listing">
  <div className="modal">
```

The CSS behind them:

```css
/* apps/vendor-web/app/vendor.css:1159-1181 — current */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(7, 40, 33, 0.55);
  display: flex;
  align-items: flex-end;
  padding: 16px;
}

.modal {
  background: #fff;
  border-radius: 20px 20px 16px 16px;
  width: 100%;
  max-width: 430px;
  margin: 0 auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 90dvh;
  overflow-y: auto;
}
```

There is **no `transition` and no `animation` on either rule**, and
`apps/vendor-web/app/vendor.css` contains **zero `@keyframes`** in all 1,269
lines:

```
$ grep -c "@keyframes" apps/vendor-web/app/vendor.css
0
```

So the sheet appears in a single frame: an opaque dark layer covers the whole
screen and a white panel is simply *there*. Two consequences, both specific to
this product rather than general polish.

1. **`align-items: flex-end` and `border-radius: 20px 20px 16px 16px` declare
   this to be a bottom sheet.** A sheet that does not rise is read as a page
   replacement, not as a layer over the page the vendor was on. Without the rise
   the vendor loses the fact that their listing list is still behind it — which
   is the one thing the sheet form exists to communicate.
2. **The backdrop at `rgba(7, 40, 33, 0.55)` arriving instantly is a hard
   luminance step across the entire viewport.** PRD §16 governs this screen for
   outdoor readability; a phone held in sunlight with auto-brightness high makes a
   full-screen 55% dark layer appearing in one frame genuinely startling, and the
   vendor is holding the phone in front of a guest.

The sheets are opened from `openEdit` and `openAdd` and closed by `closeEdit` /
`closeAdd`, which unmount them immediately — so an **exit** animation is not
reachable from CSS alone. See Boundaries.

## Target

```css
/* apps/vendor-web/app/vendor.css — target, replacing lines 1159-1181 */

/* ── Modal ── */

/*
 * The backdrop fades and the sheet rises. `--ease-drawer` is the token for a
 * large surface moving under its own momentum rather than snapping back from a
 * tap, and it is what the tourist app's drawer uses, so the two apps' sheets
 * read as one system.
 *
 * The backdrop is given the shorter duration so the page is legibly dimmed
 * before the panel finishes arriving — the dim is what says "the list is still
 * there, behind this", and it has to land first to say it.
 */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(7, 40, 33, 0.55);
  display: flex;
  align-items: flex-end;
  padding: 16px;
  animation: vendor-backdrop-in var(--dur-fast) var(--ease-out) both;
}

.modal {
  background: #fff;
  border-radius: 20px 20px 16px 16px;
  width: 100%;
  max-width: 430px;
  margin: 0 auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 90dvh;
  overflow-y: auto;
  animation: vendor-sheet-in var(--dur-base) var(--ease-drawer) both;
}

@keyframes vendor-backdrop-in {
  from {
    opacity: 0;
  }
}

/*
 * translateY only — no scale and no opacity on the sheet itself. The sheet
 * carries 16px form text that a vendor reads in sunlight (PRD §16); fading or
 * scaling type makes it briefly unreadable, and the backdrop fade already
 * provides the softening. A transform-only animation is also composite-only, so
 * it cannot drop frames behind the sheet's own layout.
 */
@keyframes vendor-sheet-in {
  from {
    transform: translateY(16px);
  }
}
```

Both `animation` shorthands use `both` so the `from` state is held during any
delay and the final state is retained — matching the `both`-fill convention the
reduced-motion block at `globals.css:76-91` was written for.

## Repo conventions to follow

- Every motion value comes from `packages/ui/tokens.css`: `--ease-drawer`,
  `--ease-out`, `--dur-fast`, `--dur-base`. Do not write a literal curve or
  duration, and do not add a new token — this plan needs none.
- `globals.css:12` imports `@cvip/ui/tokens.css`, so the variables are in scope
  in `vendor.css`. No new import.
- Prefix every keyframe name added to `vendor.css` with `vendor-`. This file has
  had no keyframes until now; the prefix keeps the portal's names from ever
  colliding with the tourist app's.
- `vendor.css` marks subsections with `── Name ──`. Keep the existing
  `/* ── Modal ── */` banner at line 1157 where it is.
- Comment the reason, not the rule. The comments above are part of the target.
- `translateY` distance: **16px**, matching the backdrop's own `padding: 16px`
  and the sheet's internal `gap: 16px`. The portal's spacing is in 16px steps;
  motion distance follows the same step rather than inventing a number.

## Steps

1. Add the `animation: vendor-backdrop-in …` line to `.modal-backdrop`
   (`apps/vendor-web/app/vendor.css:1159-1167`), as the last declaration in the
   rule. Change nothing else in it.
2. Add the `animation: vendor-sheet-in …` line to `.modal`
   (`vendor.css:1169-1181`), as the last declaration in the rule. Change nothing
   else in it.
3. Add both `@keyframes` blocks, with their comments, immediately after the
   `.modal` rule and before `/* ── Modal head ── */`'s `.modal__head` at line
   1183.
4. Do not touch `app/listings/page.tsx`.
5. Run the checks in the Verification section.

## Boundaries

- **Entrance only.** `closeEdit` / `closeAdd` unmount the sheet synchronously
  (`listings/page.tsx:278`, `:358` call them from the close button), so there is
  no interval during which an exit animation could run. Adding one requires
  holding the component mounted through an exit state in TSX — deliberately out
  of scope. A sheet that rises in and cuts out is better than one that does
  neither, and the cut-out is the less-watched end: the vendor's attention is on
  the list they are returning to. **Do not** attempt an exit by adding state to
  the page in this plan.
- Do NOT animate `opacity` or `scale` on `.modal`. Stated above with the reason;
  changing it defeats the point of the plan.
- Do NOT change `rgba(7, 40, 33, 0.55)`, the border-radius, `max-height`, or any
  other declaration in either rule. Motion only.
- Do NOT add `will-change`. The sheet animates once per open and is composited
  for the 240ms it moves; a permanent layer hint costs more than it saves.
- Do NOT touch `apps/tourist-web` or `apps/admin-web`.
- Do NOT add a library. No `framer-motion`, no `@headlessui`.
- If `vendor.css:1159` does not begin `.modal-backdrop {`, STOP and report the
  drift rather than guessing which rule was meant.

## Verification

- **Mechanical**:
  - `pnpm lint` → passes.
  - `pnpm --filter @cvip/vendor-web build` → succeeds.
  - `grep -n "animation:" apps/vendor-web/app/vendor.css` → includes
    `vendor-backdrop-in` and `vendor-sheet-in`.
  - `grep -n "@keyframes vendor-" apps/vendor-web/app/vendor.css` → both names
    present.
  - `grep -n "cubic-bezier\|[0-9]ms\|0\.[0-9]*s" apps/vendor-web/app/vendor.css | grep -n "modal\|sheet\|backdrop"`
    → **no output**. Any hit is a literal that should have been a token.
- **Feel check**: `npx pnpm@9 demo`, open `http://localhost:3001/listings`.
  - Tap **Edit** on a listing. The sheet must rise from below while the page dims;
    it must not already be in place when the dim lands.
  - Tap **New listing**. Identical motion — the two sheets share both rules, so a
    difference between them means one rule did not take.
  - In DevTools → Animations, set playback to 10% and open the sheet. The backdrop
    should finish dimming at roughly the three-quarter point of the sheet's rise.
    If the sheet lands first, the two durations are swapped.
  - Read the form labels during the rise at 10% speed. They must stay crisp and
    fully opaque throughout. Any fade or blur means opacity or scale crept in.
  - Enable `prefers-reduced-motion: reduce` in DevTools → Rendering and open the
    sheet. It must appear **immediately and fully** — no hold, no partial offset.
    The block at `globals.css:82-91` collapses both duration and delay, so this
    should pass without further work; if the sheet appears offset by 16px and
    stays there, the `both` fill is interacting with the collapse and should be
    reported rather than patched around.
  - Throttle the network to Slow 4G and open the sheet. The motion must be
    unaffected — it is composite-only and must not wait on anything.
- **Done when**: both sheets rise, the dim lands first, the form text never
  fades, and reduced motion gets an instant sheet.
