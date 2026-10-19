# 003 — Stop the skeleton shimmer repainting every frame

- **Status**: TODO
- **Commit**: 19506a1
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 1 file, ~20 lines

## Problem

```css
/* apps/tourist-web/src/components/kit.css:308-326 — current */
.skeleton {
  display: block;
  background: linear-gradient(
    90deg,
    var(--ivory-sunken) 25%,
    var(--ivory-raised) 50%,
    var(--ivory-sunken) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.3s ease-in-out infinite;
}

@keyframes skeleton-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}
```

`background-position` is a **paint** property. Every frame of the 1.3s loop
re-rasterises a gradient across each skeleton element.

Skeletons never appear alone. `kit.tsx:328` renders `.skeleton` as a sized
`<span>`, and six screens render them in groups while content loads:

```tsx
/* apps/tourist-web/src/components/kit.tsx:328 — current */
return <span className="skeleton" style={{ height, width, borderRadius: radius }} aria-hidden />;
```

So the cost multiplies by the number of placeholders on screen, and it lands at
exactly the worst moment — while the app is already busy fetching, parsing and
rendering the real data. The shimmer that exists to say "this is loading, it is
fine" is itself making the load slower.

## Target

Keep the plate flat and sweep a gradient across it with `transform`, which the
compositor can run without touching paint.

```css
/* apps/tourist-web/src/components/kit.css — target */

/*
 * The sweep moves, the plate does not.
 *
 * This was a `background-position` animation, which repaints the element on
 * every frame — multiplied by however many placeholders a screen is showing,
 * and spent at precisely the moment the main thread is busy with the data the
 * placeholders are standing in for. Translating a child instead is the same
 * picture on the compositor, so a loading screen costs nothing to animate.
 */
.skeleton {
  display: block;
  position: relative;
  overflow: hidden;
  background: var(--ivory-sunken);
}

.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--ivory-raised) 50%,
    transparent 100%
  );
  transform: translateX(-100%);
  animation: skeleton-shimmer 1.3s ease-in-out infinite;
}

/* `translateX(100%)` is the pseudo-element's own width, so the sweep always
   crosses the full plate whatever size the caller passed inline. */
@keyframes skeleton-shimmer {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}
```

## Repo conventions to follow

- Colour comes only from a custom property (`kit.css:1`). `var(--ivory-sunken)`
  and `var(--ivory-raised)` are carried over unchanged; `transparent` is a
  keyword, not a colour choice.
- `kit.tsx:328` passes `height`, `width` and `borderRadius` **inline**. The
  `overflow: hidden` added to `.skeleton` is what makes the inline
  `borderRadius` clip the sweep — do not move the radius into CSS.
- Exemplar for the pseudo-element pattern in this codebase:
  `apps/tourist-web/src/design/global.css:150-170`.

## Steps

1. In `apps/tourist-web/src/components/kit.css`, replace the `.skeleton` rule
   (lines 308-318) with the Target version.
2. Add the `.skeleton::after` rule immediately below it.
3. Replace the `@keyframes skeleton-shimmer` block (lines 320-326) with the
   `transform` version.

## Boundaries

- Do NOT change `kit.tsx`. The component's props, inline styles and `aria-hidden`
  stay exactly as they are.
- Do NOT change the 1.3s period or the `ease-in-out` timing. A looping shimmer
  is continuous motion and `linear` would arguably suit it better, but the
  current rhythm is a deliberate, tuned look — this plan changes the mechanism
  only. If `linear` is wanted, that is a separate decision.
- Do NOT add `will-change`.
- Do NOT touch any other file.

## Verification

- **Mechanical**: `pnpm --filter @cvip/tourist-web build` → succeeds.
- **Feel check**: `pnpm tourist`, then DevTools → Network → throttle to **Slow
  4G** so skeletons stay on screen long enough to study.
  - The sweep must still read as a soft light passing left-to-right across each
    placeholder, with rounded ends matching the caller's `borderRadius`. If a
    corner shows a square edge, `overflow: hidden` is missing.
  - **The actual proof**: DevTools → Rendering → **Paint flashing**. Before, every
    skeleton flashes continuously. After, none of them should flash.
  - On a screen showing several skeletons at once, all sweeps should stay in sync
    with each other exactly as they do now (they share one unstaggered animation).
  - Toggle `prefers-reduced-motion: reduce`. The plate must sit flat and still at
    `--ivory-sunken` with no sweep — not frozen with the gradient parked
    mid-plate.
- **Done when**: paint flashing is clean on a screen full of skeletons, and the
  shimmer is visually unchanged from the stashed version.
