# 012 — Nav, slots and the secondary controls change state with no transition at all

- **Status**: TODO
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file, ~10 single-line edits.

## Problem

`apps/vendor-web/app/vendor.css` is 1,269 lines and contains exactly **three**
`transition` declarations:

```
$ grep -n "transition" apps/vendor-web/app/vendor.css
189:  transition: transform var(--dur-press) var(--ease-out), background var(--dur-press) var(--ease-out);
393:  transition: width 0.4s var(--ease-out);
1216:  transition: outline var(--dur-base) var(--ease-out);
```

Line 189 is `.btn`. Line 393 is the onboarding progress bar. Line 1216 is the
dead one that plan 006 removes. So after plan 006 lands, **`.btn` is the only
interactive element in the entire portal with a transition**, and everything else
changes state in a single frame.

### 1. Navigation

```css
/* apps/vendor-web/app/vendor.css:676-694 — current */
.vnav__link {
  flex: none;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-muted, #4a5c56);
  text-decoration: none;
  white-space: nowrap;
}

.vnav__link:hover {
  background: var(--ivory-sunken, #f2ede3);
}

.vnav__link--on {
  background: var(--green-900, #16302a);
  color: #fffdf7;
}
```

Four tabs, a pill that moves between them on every navigation
(`VendorNav.tsx:30-36`), and no transition — so the dark pill vanishes from one
tab and appears on another with nothing connecting the two. The hover state at
`:687` is also an instant background flash, which on a trackpad reads as a glitch.
`.vnav__scan` / `.vnav__scan--on` (`:696-710`) have the same gap.

### 2. Availability slots

```css
/* apps/vendor-web/app/vendor.css:1001-1024 — current */
.slot--open { border-color: #b9d8d3; background: #eaf5f3; }
.slot--tight { border-color: #e0c98c; background: #faf2df; }
.slot--full { border-color: transparent; background: #ece9e1; opacity: 0.7; }
```

`availability/page.tsx:182` picks the modifier from the slot's remaining
capacity. When a capacity save succeeds, `saveEdit`
(`availability/page.tsx:69-77`) replaces the slot in state, so a chip can go from
`slot--open` to `slot--tight` to `slot--full` — a border and background change
with no transition. This is the **only acknowledgement that the write succeeded**
(there is no success flash here, unlike listings' `listing--saved`), and it is a
one-frame recolour the vendor will miss if they blinked.

The same applies to leaving edit mode: `.slot--editing` (`:1237-1245`) is a
different size, border and background from `.slot`, and the swap in both
directions is instant.

### 3. Controls that are not `.btn` have no press feedback

`.btn:active` gives `transform: scale(0.985)` (`vendor.css:192-194`). These
tappable controls get nothing:

- `.modal__close` (`vendor.css:1194-1202`) — the ✕ on both sheets
- `.vnav__scan` (`:696-706`) — the accent action, the most-tapped thing in the
  portal per `VendorNav.tsx:9-11`
- `.slot__save` (`:1256-1269`) — the ✓ that commits a capacity change
- `.auth-link` (`vendor.css:577-584`) — styled as a bare button

So the portal has two press vocabularies: `.btn` responds, everything else does
not. On a phone, with no hover to confirm the target, a control that does not
respond to touch is a control the vendor taps twice.

## Target

```css
/* apps/vendor-web/app/vendor.css:676 — target, one line added to .vnav__link */
.vnav__link {
  /* …existing declarations unchanged… */
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}

/* apps/vendor-web/app/vendor.css:696 — target, one line added to .vnav__scan */
.vnav__scan {
  /* …existing declarations unchanged… */
  transition: background var(--dur-fast) var(--ease-out), transform var(--dur-press) var(--ease-out);
}

/* apps/vendor-web/app/vendor.css:1001 — target, one line added to .slot */
.slot {
  /* …existing declarations unchanged… */
  /* The recolour from open → tight → full is the only sign a capacity write
     landed; at one frame the vendor misses it. --dur-base rather than --dur-fast
     because this reports a result rather than answering a tap. */
  transition: background var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out),
    opacity var(--dur-base) var(--ease-out);
}
```

```css
/* apps/vendor-web/app/vendor.css — target, added after .btn:active at line 194 */

/*
 * One press vocabulary. `.btn` already shrinks to 0.985 on press; these four are
 * equally tappable and had no response at all, so the portal had two classes of
 * control — and on a phone, with no hover to confirm the target, a control that
 * does not react is one the vendor taps twice. 0.985 is the portal's single press
 * depth; do not introduce a second.
 */
.modal__close,
.vnav__scan,
.slot__save,
.auth-link {
  transition: transform var(--dur-press) var(--ease-out);
}

.modal__close:active,
.vnav__scan:active,
.slot__save:active,
.auth-link:active {
  transform: scale(0.985);
}
```

`.vnav__scan` appears in both blocks; keep both — the first adds its background
transition, the second its press depth. Alternatively fold the `transform` into
the `.vnav__scan` rule's own `transition` as shown above and leave it out of the
selector list. Either is acceptable; **do not** end up with two conflicting
`transition` declarations on the same selector.

## Repo conventions to follow

- Every value from `packages/ui/tokens.css`: `--ease-out`, `--dur-press`,
  `--dur-fast`, `--dur-base`. The mapping is the one plan 001 established —
  `--dur-press` for press feedback, `--dur-fast` for colour and state changes,
  `--dur-base` for something larger or for reporting a result.
- `globals.css:12` imports `@cvip/ui/tokens.css`. No new import.
- **0.985 is the portal's only press depth.** `.btn:active` uses it
  (`vendor.css:193`); reuse it exactly. The tourist app's audit found five
  undisciplined press depths across 23 sites (`plans/README.md`, "Findings not
  yet planned") — the portal currently has one and must keep having one.
- Add each `transition` as the **last** declaration in its existing rule. Do not
  reorder or reformat the rules around it.
- Comment the reason, not the rule. Two comments are specified above; do not add
  one to every line.

## Steps

1. Add the `transition` line to `.vnav__link` (`apps/vendor-web/app/vendor.css:676-685`).
2. Add the `transition` line to `.vnav__scan` (`vendor.css:696-706`).
3. Add the `transition` line, with its comment, to `.slot` (`vendor.css:1001-1012`).
   Read the rule first — the Problem section quotes only its modifiers, so confirm
   which of `background`, `border-color` and `opacity` the base rule actually sets
   and transition only properties the modifiers change.
4. Add the press-feedback block, with its comment, immediately after `.btn:active`
   (`vendor.css:192-194`).
5. Resolve the `.vnav__scan` overlap as described in the Target section so that
   selector ends up with exactly one `transition` declaration.
6. Re-run the grep from the Problem section. It should now return 8 or more
   declarations rather than 3.

## Boundaries

- Do NOT transition `.slot--editing`'s `padding` or `border-width`. Those change
  the chip's size, so transitioning them reflows the seven-day grid every frame
  of the animation — the exact defect the tourist audit recorded against
  `ExperienceDetail.css:494` and `Welcome.css:637`. The background and border
  colour change is enough.
- Do NOT add a sliding-pill indicator to the nav. Moving the active pill between
  tabs as a single element needs either a shared-element transition or an absolute
  overlay, and `VendorNav.tsx` renders four independent `<Link>`s. A background
  crossfade on each is the honest version of this change; a sliding pill is a
  separate, larger piece of work.
- Do NOT introduce a second press depth. 0.985 everywhere.
- Do NOT add a `:hover` state to anything that does not already have one. The
  portal is a phone-first product used one-handed; hover is not the input it is
  designed for and new hover states are a restyle.
- Do NOT change any colour, size, padding or border width. Motion only — every
  edit in this plan adds a `transition` or a `transform`, and nothing else.
- Do NOT transition `width` or `height` on any of these selectors.
- Do NOT touch `.btn` itself (`vendor.css:189`), the progress bar
  (`vendor.css:393`), or `.listing--saved` (`vendor.css:1216`, owned by plan 006).
- Do NOT touch `apps/tourist-web` or `apps/admin-web`.
- Do NOT add a library.
- If any cited line does not contain the selector quoted here, STOP and report the
  drift rather than guessing which rule was meant.

## Verification

- **Mechanical**:
  - `pnpm lint` → passes.
  - `pnpm --filter @cvip/vendor-web build` → succeeds.
  - `grep -c "transition" apps/vendor-web/app/vendor.css` → at least `8`.
  - `grep -n "transition:[^;]*ease[,;) ]" apps/vendor-web/app/vendor.css` →
    **no output**. Any hit is a bare `ease` keyword that should be `var(--ease-out)`
    — this is plan 001's invariant and this plan must not break it.
  - `grep -n "scale(0\." apps/vendor-web/app/vendor.css` → every hit is
    `scale(0.985)`. Any other value is a second press depth.
  - `grep -n "transition" apps/vendor-web/app/vendor.css | grep -c "vnav__scan"`
    → `1`. `2` means step 5 was not done.
- **Feel check**: `npx pnpm@9 demo`, open `http://localhost:3001`.
  - Tap between Today / Listings / Availability / Earnings. Each pill should fade
    in as the previous fades out, so the eye can follow the change rather than
    relocating it. If it still hard-cuts, the transition is on the `--on` modifier
    instead of the base class — the same defect plan 006 fixes, and the reason
    step 1 says to edit `.vnav__link`, not `.vnav__link--on`.
  - Press **Scan a code** and the ✕ on a sheet. Both must shrink identically to a
    `.btn`. Put them side by side mentally: if one feels deeper, a second press
    depth got in.
  - On `/availability`, edit a slot's capacity down until it goes **Full**, and
    tap ✓. The chip must recolour over ~240ms. That recolour is the only
    confirmation the write succeeded — if it is instant, the plan is not done.
  - Watch the seven-day grid during that recolour. No chip may change size or move.
    Any reflow means `padding` or `border-width` was transitioned.
  - Enable `prefers-reduced-motion: reduce` and repeat all four checks. Every state
    change must be instant and land in the correct final state — the pill dark on
    the right tab, the chip the right colour. `globals.css:82-91` handles this.
- **Done when**: the nav pill crossfades, all four secondary controls press like a
  `.btn` at one depth, a slot recolours visibly on save, nothing reflows, and plan
  001's no-bare-`ease` grep is still clean.
