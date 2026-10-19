# 011 — Every loading state is a static line of grey text

- **Status**: TODO
- **Severity**: MEDIUM
- **Category**: Missed opportunity
- **Estimated scope**: 1 file, ~20 lines (1 new rule, 1 keyframe), 2 TSX files 1 class each.

## Problem

Both async page loads report themselves with an unstyled sentence:

```tsx
/* apps/vendor-web/app/listings/page.tsx:216 — current */
{loading && <p className="card__note">Loading your listings…</p>}
```

```tsx
/* apps/vendor-web/app/availability/page.tsx:132 — current */
{loading && <p className="card__note">Loading the calendar…</p>}
```

`.card__note` is the portal's generic small-print class and carries no motion:

```css
/* apps/vendor-web/app/vendor.css:132-136 — current */
.card__note {
  margin: 0;
  color: var(--ink-muted);
  font-size: 14px;
}
```

`--ink-muted` is the same colour used for the demo-mode notice
(`listings/page.tsx:211`), the helper copy at `availability/page.tsx:113`, and the
empty state at `listings/page.tsx:225`. So "it is loading", "you have nothing
yet" and "here is some advice" are rendered **identically**, in the muted colour
the eye is trained to skip, with nothing moving.

The failure mode is specific. `loadListings` and `loadAvailability` are real
awaits against Supabase. On island 4G, the vendor opens `/listings`, sees a grey
line, and has no way to distinguish:

- a request in flight,
- a request that will never come back,
- an empty account.

All three look like a small grey sentence. There is no spinner, no skeleton and
no `@keyframes` anywhere in `apps/vendor-web/app/vendor.css` — the whole portal
has no indeterminate-progress vocabulary at all. The onboarding progress bar
(`vendor.css:387-394`) is the only motion in the file that reports progress, and
it is determinate and on a different screen.

The reason this is MEDIUM rather than HIGH: nothing is lost and no wrong action
is invited, unlike plan 009's moving button. But it is the state a vendor meets
**first**, on every cold open of the two pages they use most.

## Target

One pulsing variant of the existing note, applied only where the note means
"waiting".

```css
/* apps/vendor-web/app/vendor.css — target, added after .card__note at line 136 */

/*
 * `.card__note` is the portal's generic small print: the demo banner, the empty
 * state and the helper copy all use it, in the muted colour the eye skips. A
 * loading line rendered that way is indistinguishable from advice, so a vendor
 * on island 4G cannot tell a request in flight from an empty account.
 *
 * The pulse is the only thing separating them, and it is on opacity alone —
 * composite-only, so it cannot steal frames from the request it is reporting.
 * The period is long and the floor is high: this runs for as long as the network
 * takes, and a loading line that flashes hard is more irritating the longer it
 * lasts than one that breathes.
 */
.card__note--loading {
  animation: vendor-note-waiting 1.4s var(--ease-in-out) infinite;
}

@keyframes vendor-note-waiting {
  50% {
    opacity: 0.45;
  }
}
```

`1.4s` is an ambient period and deliberately not a duration token — the same
exemption already documented in this file at `vendor.css:387-394`.
`--ease-in-out` is the convention plan 001 established for continuous loops.

### TSX: one class on each of the two loading lines

```tsx
/* apps/vendor-web/app/listings/page.tsx:216 — target */
{loading && <p className="card__note card__note--loading">Loading your listings…</p>}
```

```tsx
/* apps/vendor-web/app/availability/page.tsx:132 — target */
{loading && <p className="card__note card__note--loading">Loading the calendar…</p>}
```

The two-class composition matches `card__note card__note--demo` already in use at
`listings/page.tsx:211` and `availability/page.tsx:115`, so this is the file's own
existing pattern rather than a new one.

## Repo conventions to follow

- The `--modifier` suffix on a shared base class is the established pattern here:
  `card__note--demo` (`vendor.css:558`), `btn--primary`, `slot--full`,
  `verdict--ok`. Follow it; do not introduce a standalone `.loading` class.
- `--ease-in-out` comes from `packages/ui/tokens.css`. The `1.4s` period stays
  literal with its comment, per the precedent at `vendor.css:387-394`.
- `globals.css:12` imports `@cvip/ui/tokens.css`. No new import.
- Prefix keyframe names in `vendor.css` with `vendor-`.
- The new rule goes under the existing banner that contains `.card__note`
  (`vendor.css` upper half, before `--- Fields ---` at line 138). Do not create a
  new section and do not move `.card__note`.
- Comment the reason, not the rule.

## Steps

1. Add `.card__note--loading` and `@keyframes vendor-note-waiting`, with their
   comment, immediately after `.card__note` (`apps/vendor-web/app/vendor.css:136`)
   and before the `--- Fields ---` banner at line 138.
2. Add `card__note--loading` to the loading line at `app/listings/page.tsx:216`.
3. Add `card__note--loading` to the loading line at `app/availability/page.tsx:132`.
4. Confirm there is no third loading line: run
   `grep -rn "{loading &&" apps/vendor-web` and check each hit. If one exists that
   this plan does not list, add the class and note it in the report.
5. Run the checks in the Verification section.

## Boundaries

- Do NOT add skeleton rows. A skeleton has to match the shape of what it replaces
  — `.listing` is a wrapping flex row with a pill, a title, a summary and two
  buttons, and `.avail__day` is a seven-day grid of slots. Building two skeletons
  means inventing two new blocks of layout and at least one new background colour,
  which this plan is not permitted to do. It is a reasonable follow-up once a
  design decision exists.
- Do NOT add the pulse to bare `.card__note`. Three of its four uses are static
  copy that must not move; a pulsing demo-mode banner or a pulsing empty state
  would be worse than the problem.
- Do NOT animate `transform`, `width` or anything that affects layout. These lines
  sit above content that is about to replace them; moving them makes the swap
  worse.
- Do NOT replace `1.4s` with a duration token. Reason given above.
- Do NOT change `.card__note`'s colour, size or margin. Motion only.
- Do NOT touch the error branches at `listings/page.tsx:218` or
  `availability/page.tsx:134` — those are `.field-error` and belong to plan 009.
- Do NOT touch `apps/tourist-web` (which has its own skeleton shimmer, covered by
  plan 003) or `apps/admin-web`.
- Do NOT add a library.
- If `vendor.css:132` does not begin `.card__note {`, or either cited TSX line does
  not contain the quoted JSX, STOP and report the drift.

## Verification

- **Mechanical**:
  - `pnpm lint` → passes.
  - `pnpm --filter @cvip/vendor-web typecheck` → passes.
  - `pnpm --filter @cvip/vendor-web build` → succeeds.
  - `grep -rn "card__note--loading" apps/vendor-web` → 3 hits: the CSS rule and
    the two JSX sites.
  - `grep -rn "{loading &&" apps/vendor-web` → every hit carries the class.
  - `grep -c "@keyframes vendor-note-waiting" apps/vendor-web/app/vendor.css` → `1`.
- **Feel check**: `npx pnpm@9 demo`.
  - DevTools → Network → throttle to **Slow 4G**, then hard-reload
    `http://localhost:3001/listings`. The loading line must breathe for the whole
    wait. Compare it against the demo-mode banner directly above it
    (`listings/page.tsx:211`) — the banner must be completely still. If both move,
    the pulse was put on the base class.
  - Hard-reload `/availability` on Slow 4G. Same behaviour.
  - Load with an empty account (or temporarily make `loadListings` return `[]`).
    The empty state at `listings/page.tsx:225` must be still. "Nothing here" and
    "still fetching" must be visually distinguishable at a glance — that is the
    finding.
  - Watch one full cycle at normal speed. The floor is `0.45` against
    `--ink-muted`; it must stay readable at the dimmest point, not blink out.
  - Enable `prefers-reduced-motion: reduce` and reload on Slow 4G. The pulse must
    stop and the line must stay at **full** opacity — the vendor who asked for
    less motion still needs to read it. `globals.css:82-91` collapses the
    animation; confirm it settles at `1`, not at `0.45`. If it settles dim, move
    the floor into the keyframe's `0%`/`100%` and report the change.
- **Done when**: the loading line pulses, every other `.card__note` on the same
  screens is still, and reduced motion leaves the line static and fully opaque.
