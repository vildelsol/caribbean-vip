# 001 — Add motion tokens and replace every `ease` transition with ease-out

- **Status**: DONE (2026-10-19)
- **Commit**: 19506a1
- **Severity**: HIGH
- **Category**: Easing & duration + Cohesion & tokens
- **Estimated scope**: 12 files — 1 token file, 11 stylesheets. ~55 single-line edits.

## Problem

### 1. There are no motion tokens

`packages/ui/tokens.css` defines colour, radius, spacing (`--s-xs`…`--s-xxl`),
elevation (`--e-card`, `--e-raised`, `--e-modal`) and layout tokens. It defines
**no easing or duration tokens at all**.

One stylesheet already assumes they exist:

```css
/* apps/tourist-web/src/screens/Irie.css:274 — current */
animation: irie-sweep 2.8s var(--ease-inout, ease-in-out) infinite;
```

`--ease-inout` is not defined anywhere in the repo, so this has silently been
falling back to the `ease-in-out` keyword since it was written.

### 2. Every transition in the app uses the `ease` keyword

A grep of all 27 `transition:` declarations across the app returns **51 easing
functions, and every single one is the bare `ease` keyword**:

```
$ grep -rho "transition:[^;]*" --include=*.css . | grep -o "ease[a-z-]*\|cubic-bezier([^)]*)" | sort | uniq -c
  51 ease
```

`ease` is `cubic-bezier(0.25, 0.1, 0.25, 1)` — an ease-in-out. It **starts
slow**. For a transition that responds to a tap, the first 40ms is the moment
the guest is actually watching, and the app spends it barely moving. This
affects every button press, card tap, chip toggle and bottom-nav change in the
product — the highest-frequency motion in the app.

Examples (all current):

```css
/* apps/tourist-web/src/components/kit.css:17 */
.btn { transition: transform 0.12s ease, opacity 0.12s ease, background-color 0.12s ease; }

/* apps/tourist-web/src/components/kit.css:261 */
.card--tappable { transition: transform 0.14s ease, box-shadow 0.14s ease; }

/* apps/tourist-web/src/components/BottomNav.css:47 */
.bottom-nav__icon { transition: background-color 0.15s ease, color 0.15s ease; }
```

### 3. Seven durations doing three jobs

```
17 × 0.12s    14 × 0.14s    9 × 0.15s    5 × 0.16s    3 × 0.2s    2 × 0.25s    1 × 0.1s
```

`0.14s`, `0.15s` and `0.16s` are not distinguishable by eye. They are three
spellings of one decision.

### Note: the keyframes are already right

`Welcome.css` and `Offer.css` use `cubic-bezier(0.16, 1, 0.3, 1)` for their
entrance keyframes, which is a strong expo-out and correct. **Do not change that
value.** This plan only gives it a name.

## Target

### Tokens appended to `packages/ui/tokens.css`

```css
  /* --- Motion -------------------------------------------------------------
   * One curve and three durations, because the app only makes three kinds of
   * motion decision: a press responds, a state changes, something larger moves.
   *
   * `--ease-out` is the default for anything a guest triggered. It starts at
   * full speed, so the interface has visibly reacted inside the first frame —
   * the CSS `ease` keyword it replaces is an ease-in-out that spends the first
   * 40ms barely moving, which is exactly the window the guest is watching.
   */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
  /* The entrance curve already used by the Welcome and Offer keyframes. Named,
     not changed — those screens are tuned and this only stops the number being
     retyped. */
  --ease-entrance: cubic-bezier(0.16, 1, 0.3, 1);

  --dur-press: 140ms;
  --dur-fast: 180ms;
  --dur-base: 240ms;
```

### Mapping to apply in every stylesheet

| Current duration | Replace with | Applies to |
| --- | --- | --- |
| `0.1s`, `0.12s` | `var(--dur-press)` | press/`:active` feedback |
| `0.14s`, `0.15s`, `0.16s` | `var(--dur-fast)` | state, colour, shadow changes |
| `0.2s`, `0.25s` | `var(--dur-base)` | larger moves (step pills, gallery dots) |

| Current easing | Replace with |
| --- | --- |
| `ease` in any `transition:` | `var(--ease-out)` |
| `var(--ease-inout, ease-in-out)` at `Irie.css:274` | `var(--ease-in-out)` |
| `cubic-bezier(0.16, 1, 0.3, 1)` in any `animation:` | `var(--ease-entrance)` |

Worked example:

```css
/* apps/tourist-web/src/components/kit.css:17 — target */
.btn {
  transition:
    transform var(--dur-press) var(--ease-out),
    opacity var(--dur-press) var(--ease-out),
    background-color var(--dur-press) var(--ease-out);
}
```

### Do NOT change

- The `ease-in-out` keyword inside **infinite ambient `animation:` shorthands**
  (`irie-twinkle`, `irie-aura`, `irie-breeze`, `irie-drift`, `irie-spark`,
  `wl-sheen`, `skeleton-shimmer`). Those are continuous loops, not responses to
  a tap, and ease-in-out is correct for them. Only `transition:` easings and the
  two named `cubic-bezier` cases above are in scope.
- `linear` at `Welcome.css:46` (`wl-frame-fade`) — a crossfade on a timer is
  constant motion and `linear` is correct.
- Any keyframe `cubic-bezier` value that is **not** `0.16, 1, 0.3, 1`
  (e.g. `Offer.css:98` uses `0.22, 0.61, 0.36, 1` — leave it).

## Repo conventions to follow

- All shared tokens live in `packages/ui/tokens.css` inside the single `:root`
  block, grouped under a `/* --- Name --- */` banner comment. Append the Motion
  group **after** the Layout group, before the closing `}`.
- Exemplar to imitate for comment style and grouping: the `/* --- Elevation --- */`
  group at the end of `packages/ui/tokens.css`.
- `apps/tourist-web/src/design/global.css` imports `@cvip/ui/tokens.css` on line
  1, so every screen stylesheet already sees these variables. No new imports.
- This repo comments the *reason* for a rule, not the rule. Keep the comment
  above the Motion group; do not add a comment to every swapped line.

## Steps

1. Append the Motion token group to `packages/ui/tokens.css`, immediately before
   the final `}`.
2. In each of these 11 files, replace every `ease` **inside a `transition:`
   declaration** with `var(--ease-out)`, and every duration with its token from
   the mapping table. All 27 declarations, by exact line:
   - `components/kit.css` — 17, 67, 261
   - `components/BottomNav.css` — 47, 88
   - `screens/Welcome.css` — 504, 637, 764, 809 (multi-line body, lines 810-813), 870, 875
   - `screens/Irie.css` — 354, 400, 640, 780
   - `screens/Explore.css` — 193, 222, 657
   - `screens/Checkout.css` — 61, 119
   - `screens/Trips.css` — 389, 411
   - `screens/Nearby.css` — 138, 269
   - `screens/Profile.css` — 186
   - `screens/ExperienceDetail.css` — 494
   - `screens/Offer.css` — 406

   All paths are relative to `apps/tourist-web/src/`. Note `Welcome.css:809` is a
   multi-line `transition:` body — all four of its lines need the swap.
3. Fix the broken token reference at `apps/tourist-web/src/screens/Irie.css:274`:
   `var(--ease-inout, ease-in-out)` → `var(--ease-in-out)`.
4. Replace the literal `cubic-bezier(0.16, 1, 0.3, 1)` with `var(--ease-entrance)`
   at `Welcome.css:400`, `Welcome.css:432`, `Welcome.css:477`, `Welcome.css:594`,
   `Welcome.css:676`, and `Offer.css:208`.
5. Re-run the grep from the Problem section. `ease` should now return 0 matches
   inside `transition:` declarations.

## Boundaries

- Do NOT touch any `@keyframes` **body** (the percentage blocks). Only the
  `animation:` shorthand's easing argument, and only for the two named cases.
- Do NOT change any duration that is not in the mapping table.
- Do NOT change markup, class names, or any TSX file.
- Do NOT add dependencies.
- Do NOT touch `apps/admin-web` or `apps/vendor-web`.
- If a cited line number does not contain the code quoted here, STOP and report
  the drift rather than guessing which line was meant.

## Verification

- **Mechanical**:
  - `pnpm --filter @cvip/tourist-web typecheck` → passes.
  - `pnpm lint` → passes.
  - `pnpm --filter @cvip/tourist-web build` → succeeds.
  - `grep -rn "transition:[^;]*ease[,;) ]" apps/tourist-web/src --include=*.css`
    → **no output**. Any hit is a missed site.
  - `grep -rn "\-\-ease-inout" apps/tourist-web/src` → **no output**.
- **Feel check**: `pnpm tourist`, open on a phone or in device emulation.
  - Press and hold the primary button on Checkout. It must begin shrinking on
    the *first* frame of the touch, not ease into it.
  - Tap between bottom-nav tabs rapidly. The green disc should feel like it
    snaps into place and settles, not like it drifts.
  - In DevTools → Animations, set playback speed to 10% and press a card. The
    scale-down should cover most of its distance in the first third of the
    timeline. If it looks symmetric, an `ease` was missed.
  - Open the Irie screen and confirm the sweep still loops smoothly (step 3 changed
    a real value there — it was falling back to the weak `ease-in-out` keyword and
    is now the strong curve; it should read as more deliberate, not broken).
- **Done when**: both greps return empty, the build passes, and a press visibly
  reacts within the first frame.
