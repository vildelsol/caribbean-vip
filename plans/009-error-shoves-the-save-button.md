# 009 — An async error appears with no motion and shoves the Save button under the vendor's thumb

- **Status**: TODO
- **Severity**: MEDIUM
- **Category**: Missed opportunity + Correctness
- **Estimated scope**: 1 file, ~20 lines (1 rule extended, 1 keyframe added).

## Problem

The portal's writes are genuinely async (`lib/listings.ts`,
`lib/availability.ts`) and each failure path renders `.field-error`:

```tsx
/* apps/vendor-web/app/listings/page.tsx:334-346 — current */
{error && (
  <p className="field-error" role="alert">
    {error}
  </p>
)}

<div className="modal__actions">
  <button type="button" className="btn btn--secondary" onClick={closeEdit}>
    Cancel
  </button>
  <button type="button" className="btn btn--primary" onClick={saveEdit} disabled={busy}>
    {busy ? 'Saving…' : 'Save changes'}
  </button>
```

The same pattern appears three more times:

- `app/listings/page.tsx:218-222` — listing load failure
- `app/listings/page.tsx:449-453` — new-listing save failure, again directly
  above `.modal__actions` at `:455`
- `app/availability/page.tsx:134-138` — calendar load failure

And the rule it uses has no motion at all:

```css
/* apps/vendor-web/app/vendor.css:563-568 — current */
.field-error {
  margin: 0;
  font-size: 14px;
  color: var(--coral-text);
  font-weight: 600;
}
```

The consequence is mechanical, not aesthetic. `.modal` is
`display: flex; flex-direction: column; gap: 16px` (`vendor.css:1169-1181`), so
inserting the error above `.modal__actions` pushes the actions row **down by the
error's height plus 16px of gap, in one frame**. The vendor just tapped *Save*;
they are watching the button and their thumb is still over it. The error appears
and the button moves out from under the thumb while they are mid-gesture — on a
one-handed phone, in sunlight, the most likely next event is a mis-tap on
*Cancel*, which at `listings/page.tsx:341` calls `closeEdit` and **discards the
form they were trying to save**.

Two distinct defects, then:

1. The error has no entrance, so a vendor whose eyes were on the button may not
   register that anything new appeared — they see the layout shift and read it as
   the tap not working.
2. The shift itself is instant and un-cushioned, so there is no interval in which
   a thumb already in flight can be redirected.

Note `.auth-error` (`vendor.css:551-556`) is a near-identical rule with the same
gap. It is included below because the two are the same decision spelled twice.

## Target

```css
/* apps/vendor-web/app/vendor.css — target, replacing lines 551-568 */

/*
 * An error is inserted above `.modal__actions` in a 16px-gap flex column, so it
 * moves the Save and Cancel buttons down by its full height the instant it
 * appears — while the vendor's thumb is still over the button they just tapped,
 * with Cancel (which discards the form) now where Save was.
 *
 * The animation does two things. The 180ms it occupies is time in which a thumb
 * already in flight can be redirected, and growing from zero height means the
 * buttons slide rather than jump, so the eye can follow them to their new
 * position instead of relosing them.
 *
 * `grid-template-rows` is animated rather than `height`: it interpolates from
 * `0fr` to `1fr` without the content's height needing to be known, which is the
 * whole reason a server-supplied error message — any length, any wrapping — can
 * be animated at all here.
 */
.auth-error,
.field-error {
  margin: 0;
  font-size: 14px;
  color: var(--coral-text);
  font-weight: 600;
  display: grid;
  grid-template-rows: 1fr;
  animation: vendor-error-in var(--dur-fast) var(--ease-out) both;
}

@keyframes vendor-error-in {
  from {
    grid-template-rows: 0fr;
    opacity: 0;
  }
}
```

`grid-template-rows` on a `0fr`→`1fr` track is interpolable in current Chrome,
Safari and Firefox. Where it is not supported the `from` block is dropped, the
element renders at full height immediately, and the result is exactly today's
behaviour — the degradation is the current state, not a broken one.

Because `.field-error` becomes a grid container, its text child needs to be
allowed to collapse. The text is a bare text node inside `<p>`, which grid wraps
in an anonymous item; add `overflow: hidden` so the clipped height is honoured:

```css
.auth-error,
.field-error {
  /* …as above… */
  overflow: hidden;
}
```

## Repo conventions to follow

- Motion values from `packages/ui/tokens.css`: `--ease-out`, `--dur-fast`. No
  literals, no new tokens.
- `globals.css:12` imports `@cvip/ui/tokens.css`. No new import.
- Prefix keyframe names in `vendor.css` with `vendor-`.
- `.auth-error` and `.field-error` sit under the `--- Auth helpers ---` banner
  (`vendor.css:545`). Combine them into one selector list there; do not move
  either rule to a new section.
- Comment the reason, not the rule. The comment above is the deliverable, and it
  is long because the mis-tap mechanism is not obvious from the CSS.
- `--coral-text` is already the error colour in this file. Do not introduce
  another.

## Steps

1. Read `apps/vendor-web/app/vendor.css:545-570` and confirm `.auth-error` and
   `.field-error` have the bodies quoted in the Problem section. They differ only
   in that `.auth-error` has no additional declarations — if either carries a
   declaration not quoted here, keep it.
2. Replace both rules with the single combined rule from the Target section,
   including `overflow: hidden`.
3. Add the `@keyframes vendor-error-in` block immediately after it.
4. Do not touch any TSX. All four call sites already render the element
   conditionally, which is all the animation needs.
5. Run the checks in the Verification section.

## Boundaries

- Do NOT reserve space for the error by giving the container a `min-height`. An
  always-present empty gap above the actions row in a sheet that is already
  `max-height: 90dvh` costs the form a visible line on a small phone, every time,
  to cushion an event that is rare.
- Do NOT move `.field-error` below `.modal__actions` to avoid the shift. `role="alert"`
  and DOM order determine what a screen reader announces and in what order; the
  error belongs before the controls it describes.
- Do NOT animate `height` or `max-height` with a hardcoded value. The messages
  are server- and validation-supplied (`listings/page.tsx:117-118`,
  `availability/page.tsx:81-82`) and wrap to one, two or three lines; any fixed
  height is wrong for two of those.
- Do NOT add an exit animation. The error is cleared by `setError(null)` in five
  places (`listings/page.tsx:115, 125, 130, 135, 141`) and unmounts immediately;
  an exit needs TSX state and is out of scope. The error leaving is also the
  moment the vendor has stopped caring about it.
- Do NOT change `--coral-text`, the font size, or the weight. Motion only.
- Do NOT touch `apps/tourist-web` or `apps/admin-web`. The tourist app has the
  same finding recorded against `Checkout.tsx:584-589` in `plans/README.md`; it
  is a separate app and a separate plan.
- Do NOT add a library.
- If `vendor.css:563` does not begin `.field-error {`, STOP and report the drift.

## Verification

- **Mechanical**:
  - `pnpm lint` → passes.
  - `pnpm --filter @cvip/vendor-web build` → succeeds.
  - `grep -n "field-error" apps/vendor-web/app/vendor.css` → one rule only. Two
    means the old one was left behind and the later declaration wins.
  - `grep -n "min-height\|max-height" apps/vendor-web/app/vendor.css | grep -i error`
    → **no output**.
  - `grep -c "@keyframes vendor-error-in" apps/vendor-web/app/vendor.css` → `1`.
- **Feel check**: `npx pnpm@9 demo`, open `http://localhost:3001/listings`.
  - Open **Edit**, clear the title to whitespace only, tap **Save changes**. The
    validation error must grow in over ~180ms and the two buttons must **slide**
    down with it. If they jump, `grid-template-rows` is not interpolating — check
    the `from` block and `overflow: hidden`.
  - Repeat with a three-line error (paste a long title to trip a length rule).
    The motion must still be smooth; a fixed height would clip or overshoot here.
  - Open **New listing**, submit it invalid, and confirm the same motion at
    `listings/page.tsx:449`.
  - Go to `/availability`, trigger a capacity error (enter a non-number and tap
    ✓). Same motion.
  - With DevTools → Animations at 10% playback, trigger the error and watch the
    Save button. There must be a visible interval during which it is between its
    two positions. That interval is the fix.
  - Enable `prefers-reduced-motion: reduce` and trigger an error. It must appear
    **immediately at full height** — the vendor who asked for less motion must
    not get a collapsed, unreadable error. The block at `globals.css:82-91`
    collapses the duration; confirm the text is fully visible.
- **Done when**: all four call sites animate, a multi-line error animates
  correctly, the buttons slide rather than jump, and reduced motion shows the
  full message instantly.
