# 010 — Every in-flight button wears the disabled treatment, so it looks broken exactly while it works

- **Status**: TODO
- **Severity**: MEDIUM
- **Category**: Missed opportunity + Cohesion
- **Estimated scope**: 1 CSS file ~25 lines, 3 TSX files 1 attribute each.

## Problem

`.btn` has one state for "you cannot press this":

```css
/* apps/vendor-web/app/vendor.css:196-199 — current */
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
```

Three buttons reach that state **while an async write is in flight**, not
because they are unavailable:

```tsx
/* apps/vendor-web/app/listings/page.tsx:344-345 — current */
<button type="button" className="btn btn--primary" onClick={saveEdit} disabled={busy}>
  {busy ? 'Saving…' : 'Save changes'}
</button>
```

```tsx
/* apps/vendor-web/app/listings/page.tsx:462-465 — current */
disabled={busy || !newForm.title.trim() || !newForm.summary.trim()}
…
{busy ? 'Creating…' : 'Create draft'}
```

```tsx
/* apps/vendor-web/components/Scanner.tsx:157-160 — current */
disabled={busy || manual.trim().length === 0}
className="btn btn--secondary"
…
{busy ? 'Checking…' : 'Check voucher'}
```

So the moment the vendor commits — saving a listing, creating a draft, checking a
voucher in front of a guest — the button drops to **45% opacity** and the label
changes. 45% opacity on `--green-900` against `--ivory` is below the contrast the
rest of the portal is held to, and PRD §16 governs this screen for sunlight
readability: the one label the vendor needs to read (`Saving…` — proof that the
tap registered) is the one rendered least legibly, at the one moment they are
waiting on it.

Worse, the treatment is **ambiguous**. `listings/page.tsx:462` dims for two
unrelated reasons — `busy`, and an empty title or summary. Dimmed-because-invalid
and dimmed-because-working look identical, so the vendor cannot tell "I need to
fill something in" from "it is working, wait".

And there is no motion of any kind: the label swap is a one-frame text change,
and nothing on screen indicates that time is passing. On island 4G a Supabase
round trip is seconds. The vendor's reasonable conclusion is that the tap missed,
and their next action is to tap again.

This is the same finding the tourist app's audit recorded against
`Checkout.tsx:590-604` (see `plans/README.md`, "Findings not yet planned"). The
portal's version is worse because there is no spinner anywhere in the app to fall
back on.

### Also: one async write has no busy state at all

```tsx
/* apps/vendor-web/app/availability/page.tsx:64-68 — current */
const saveEdit = useCallback(
  async (iso: string, slot: Slot) => {
    const parsed = Number.parseInt(editValue, 10);
    try {
      const next = await setSlotCapacity(slot, parsed);
```

`setSlotCapacity` is awaited and there is **no `busy` state in the component** —
`availability/page.tsx:29-32` declares `loading`, `error`, `editingSlot` and
`editValue` and nothing else. The `.slot__save` ✓ button stays fully enabled and
unchanged for the whole write, so a double-tap sends the capacity change twice.
**This is a state-management gap, not a motion gap, and it is out of scope here.**
It is recorded so it is not lost — see the Boundaries section and the report.

## Target

Carve the busy case out of the disabled treatment and give it motion.

```css
/* apps/vendor-web/app/vendor.css — target, replacing lines 196-199 */

/*
 * `:disabled` means unavailable. `[aria-busy="true"]` means working. They looked
 * identical before this split, so a vendor could not tell "fill the title in"
 * from "it is saving, wait" — and on island 4G the gap between those is seconds
 * during which the reasonable response to a greyed-out button is to tap again.
 *
 * The busy button therefore stays legible (0.78, not 0.45 — PRD §16: the one
 * label the vendor needs to read is this one) and breathes, because a still
 * screen after a tap reads as a tap that missed. The pulse is on opacity only,
 * so it is composite-only and cannot contend with the request it is reporting.
 */
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn[aria-busy='true'],
.btn[aria-busy='true']:disabled {
  opacity: 0.78;
  cursor: progress;
  animation: vendor-btn-busy 1.1s var(--ease-in-out) infinite;
}

/* The press response is suppressed while busy: a tap that cannot do anything
   should not pretend it did. */
.btn[aria-busy='true']:active {
  transform: none;
}

@keyframes vendor-btn-busy {
  50% {
    opacity: 0.58;
  }
}
```

`1.1s` is deliberately **not** one of the duration tokens and must not be
replaced with one. `--dur-press`, `--dur-fast` and `--dur-base` describe
responses to an action; this is an ambient loop reporting that time is passing,
and the same exemption is already documented in this file at
`vendor.css:387-394` for the onboarding progress bar. `--ease-in-out` is correct
for a continuous loop — plan 001 established that convention explicitly.

### TSX: three added attributes

```tsx
/* apps/vendor-web/app/listings/page.tsx:344 — target */
<button type="button" className="btn btn--primary" onClick={saveEdit} disabled={busy} aria-busy={busy}>
```

```tsx
/* apps/vendor-web/app/listings/page.tsx:458-462 — target, aria-busy added */
  aria-busy={busy}
  disabled={busy || !newForm.title.trim() || !newForm.summary.trim()}
```

```tsx
/* apps/vendor-web/components/Scanner.tsx:155-158 — target, aria-busy added */
<button
  type="submit"
  aria-busy={busy}
  disabled={busy || manual.trim().length === 0}
  className="btn btn--secondary"
>
```

`aria-busy` is the correct ARIA attribute for "this control's operation is in
progress", so this is not a CSS hook bolted onto markup — it is the attribute
that should already have been there, and the styling follows it.

## Repo conventions to follow

- Motion values from `packages/ui/tokens.css` where one fits: `--ease-in-out` for
  the loop. The `1.1s` period is an ambient duration and stays literal, with the
  comment explaining why — follow the precedent set in this file at
  `vendor.css:387-394`.
- `globals.css:12` imports `@cvip/ui/tokens.css`. No new import.
- Prefix keyframe names in `vendor.css` with `vendor-`.
- Both rules go under the existing `--- Buttons ---` banner (`vendor.css:176`),
  immediately after `.btn:disabled`. Do not create a new section.
- Comment the reason, not the rule.
- Boolean DOM attributes in this codebase are passed as JSX expressions
  (`disabled={busy}`), not strings. Match that: `aria-busy={busy}`.

## Steps

1. Add the three new CSS rules and the keyframe after `.btn:disabled`
   (`apps/vendor-web/app/vendor.css:196-199`). Leave `.btn:disabled` itself
   exactly as it is — the disabled case is correct, it was only being overloaded.
2. Add `aria-busy={busy}` to the button at `app/listings/page.tsx:344`.
3. Add `aria-busy={busy}` to the button whose `disabled` prop is at
   `app/listings/page.tsx:462`.
4. Add `aria-busy={busy}` to the submit button at `components/Scanner.tsx:155-158`.
5. Confirm there is no fourth busy button: run
   `grep -rn "disabled={busy" apps/vendor-web` and check every hit now also has
   `aria-busy`. If a hit exists that this plan does not list, add the attribute
   there too and note it in the report.
6. Run the checks in the Verification section.

## Boundaries

- Do NOT add a spinner, a progress bar, or an SVG. The portal has no spinner
  anywhere; introducing one is a design decision and would need a shape and a
  colour, which this plan is not permitted to add.
- Do NOT change `0.45` on `.btn:disabled`. The genuinely-unavailable case is
  correct.
- Do NOT animate `transform`, `width` or `background` on the busy button. Opacity
  only — a button that moves while you are waiting on it invites another tap, and
  `width` would reflow the `.modal__actions` row.
- Do NOT replace `1.1s` with a duration token. Reason given above.
- Do NOT add a `busy` state to `app/availability/page.tsx`. The missing busy flag
  on `setSlotCapacity` (`availability/page.tsx:64-68`) is a real defect and a real
  double-submit risk, but it is state management, not motion, and inventing the
  state here would put a behaviour change inside a motion plan. **Report it; do
  not fix it.** Once that state exists, this plan's CSS covers it for free by
  adding `aria-busy` to `.slot__save`.
- Do NOT touch `apps/tourist-web` or `apps/admin-web`. The tourist app's Pay
  button has the same finding and needs its own plan.
- Do NOT add a library.
- If `vendor.css:196` does not begin `.btn:disabled {`, or any cited TSX line does
  not contain the quoted code, STOP and report the drift.

## Verification

- **Mechanical**:
  - `pnpm lint` → passes.
  - `pnpm --filter @cvip/vendor-web typecheck` → passes.
  - `pnpm --filter @cvip/vendor-web build` → succeeds.
  - `grep -rn "disabled={busy" apps/vendor-web` → every hit's element also has
    `aria-busy`. Any that does not is a missed site.
  - `grep -c "@keyframes vendor-btn-busy" apps/vendor-web/app/vendor.css` → `1`.
  - `grep -n "aria-busy" apps/vendor-web` → exactly 3 hits (or more, if step 5
    found another button — which should be stated in the report).
- **Feel check**: `npx pnpm@9 demo`, open `http://localhost:3001/listings`.
  - DevTools → Network → throttle to **Slow 4G**, then Edit a listing and Save.
    The button must stay clearly readable and pulse gently for the whole write.
    Read the word `Saving…` at arm's length; if it is hard to read, the opacity is
    still too low.
  - Open **New listing** with an empty title. The button must be at `0.45` and
    **not** pulsing — invalid and busy must be visibly different states. Fill the
    fields, submit, and confirm it switches to the brighter pulsing treatment.
    That difference is the finding; if both look the same, `aria-busy` is not
    reaching the element.
  - Press and hold the button while it is busy. It must not shrink —
    `.btn[aria-busy='true']:active` suppresses the press.
  - On `/scan`, submit a code on Slow 4G. Same treatment on `btn--secondary`.
  - Take the phone outside, or set the display to maximum brightness and view at
    a glancing angle. The busy label must remain readable. This is the PRD §16
    check and it is the reason the number is 0.78.
  - Enable `prefers-reduced-motion: reduce` and save on Slow 4G. The pulse must
    **stop**, and the button must remain at the brighter `0.78` with `Saving…`
    legible — the vendor who asked for less motion still needs to know it is
    working. `globals.css:82-91` collapses the animation duration; confirm the
    opacity floor is the static `0.78` and not the keyframe's `0.58`. If it settles
    at `0.58`, move the pulse's low point into the keyframe's `0%`/`100%` instead
    and report the change.
- **Done when**: busy and invalid look different, the busy label is readable at
  arm's length in bright light, the pulse stops under reduced motion, and the
  button never shrinks while working.
