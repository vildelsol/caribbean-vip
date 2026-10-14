# 005 — Give navigation a direction (View Transitions)

- **Status**: TODO
- **Commit**: 19506a1
- **Severity**: MEDIUM (missed opportunity — additive, not corrective)
- **Category**: Missed opportunities / Physicality
- **Estimated scope**: 1 new file, 1 stylesheet, `App.tsx`, + a mechanical hook
  rename across 14 screens

## Problem

Every navigation in the app is a hard cut.

```tsx
/* apps/tourist-web/src/App.tsx:36-39 — current */
useEffect(() => {
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}, [pathname]);
```

```tsx
/* apps/tourist-web/src/App.tsx:45-66 — current */
<Routes>
  <Route path="/" element={<Explore />} />
  …
</Routes>
<BottomNav />
```

One frame Explore is there; the next frame `ExperienceDetail` is, scrolled to
the top, with nothing connecting them. Pushing into an experience and popping
back out are the two most repeated transitions in any session — a guest browsing
a day of activities does them dozens of times — and neither says anything about
where the new screen came from or where the old one went.

This is the single largest gap between how the app reads and how a native travel
app reads, and it is the one an investor notices without being able to name it.

There are **55 `navigate(…)` calls across 14 screens**, so this cannot be fixed
at the call sites one by one.

## Target

Use the browser's **View Transitions API** through React Router 7's built-in
`viewTransition` navigate option. This needs **no new dependency**, and it
animates the outgoing screen as well as the incoming one — which a React-only
approach cannot do without keeping the old tree mounted.

It degrades to exactly today's behaviour on any browser without support, so
nothing regresses.

### 1. New file: `apps/tourist-web/src/lib/useAppNavigate.ts`

```ts
import { useCallback } from 'react';
import { useNavigate, type NavigateOptions, type To } from 'react-router-dom';

/**
 * `useNavigate`, with a direction and a transition.
 *
 * Every screen in the app navigates programmatically — 55 call sites across 14
 * screens — so opting into view transitions per call was never going to stay
 * true. Wrapping the hook once means a screen keeps writing `navigate('/trips')`
 * and gets the transition for free, and the day the transition needs to change
 * there is one place to change it.
 *
 * The direction is written to the document before the navigation, because CSS
 * is what decides which way the screens slide and it has no other way to know
 * whether this was a push or a pop.
 */
export function useAppNavigate() {
  const navigate = useNavigate();

  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      const isBack = typeof to === 'number' && to < 0;
      document.documentElement.dataset.nav = isBack ? 'back' : 'forward';

      if (typeof to === 'number') {
        navigate(to);
        return;
      }
      navigate(to, { ...options, viewTransition: true });
    },
    [navigate],
  );
}
```

> Note: `navigate(-1)` takes no options in React Router's types, so a back
> navigation does not opt in and will hard-cut. That is deliberate and correct
> for this step — see Boundaries.

### 2. `apps/tourist-web/src/App.tsx`

Give the bottom bar its own transition name so it stays put while the screens
move beneath it. Add to the existing render:

```tsx
<BottomNav />
```

stays as it is — the name is applied in CSS (step 3).

### 3. `apps/tourist-web/src/design/global.css` — append

```css
/* ---------------------------------------------------------------------------
   Route transitions
   ---------------------------------------------------------------------------

   The app frame is a phone, so a new screen should arrive from the side the way
   it does on one, rather than replacing the old screen between two frames.

   This is the browser's own View Transitions API rather than a React animation,
   for one reason: it animates the screen that is *leaving*. React cannot, unless
   the old tree is kept mounted, which means either a dependency or a second copy
   of every screen's state. A browser without support simply cuts, which is what
   the app does today, so nothing regresses on the way in.

   The bottom bar is named separately so it is captured as its own layer and sits
   still while the screens slide under it — it is furniture, not content.
   --------------------------------------------------------------------------- */

@keyframes screen-in-from-right {
  from { transform: translateX(28%); opacity: 0; }
  to   { transform: translateX(0);   opacity: 1; }
}

@keyframes screen-out-to-left {
  from { transform: translateX(0);    opacity: 1; }
  to   { transform: translateX(-12%); opacity: 0; }
}

@keyframes screen-in-from-left {
  from { transform: translateX(-28%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}

@keyframes screen-out-to-right {
  from { transform: translateX(0);   opacity: 1; }
  to   { transform: translateX(12%); opacity: 0; }
}

/* The outgoing screen moves less than the incoming one and leads it out of the
   way — the pair reads as one surface sliding, not two slides crossing. */
::view-transition-old(root) {
  animation: screen-out-to-left 260ms var(--ease-drawer) both;
}

::view-transition-new(root) {
  animation: screen-in-from-right 260ms var(--ease-drawer) both;
}

[data-nav='back']::view-transition-old(root) {
  animation: screen-out-to-right 260ms var(--ease-drawer) both;
}

[data-nav='back']::view-transition-new(root) {
  animation: screen-in-from-left 260ms var(--ease-drawer) both;
}

.bottom-nav {
  view-transition-name: bottom-nav;
}

/* Furniture does not travel with the content. */
::view-transition-group(bottom-nav) {
  animation-duration: 0ms;
}

/*
 * Reduced motion keeps the transition and drops the travel.
 *
 * A crossfade still answers "something changed" without moving anything across
 * the screen, which is the distinction the setting is actually asking for — not
 * "no transition at all".
 */
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(root),
  ::view-transition-new(root),
  [data-nav='back']::view-transition-old(root),
  [data-nav='back']::view-transition-new(root) {
    animation: none;
    mix-blend-mode: normal;
  }
  ::view-transition-old(root) { opacity: 1; }
  ::view-transition-new(root) { opacity: 1; }
}
```

### 4. Swap the hook in all 14 screens

Mechanical rename, no logic change:

```diff
-import { useNavigate } from 'react-router-dom';
+import { useAppNavigate } from '../lib/useAppNavigate';
-  const navigate = useNavigate();
+  const navigate = useAppNavigate();
```

Files (all in `apps/tourist-web/src/screens/`): `Offer.tsx`, `Trips.tsx`,
`Confirmation.tsx`, `Redeem.tsx`, `Search.tsx`, `Irie.tsx`, `BookingReturn.tsx`,
`Checkout.tsx`, `Nearby.tsx`, `Ticket.tsx`, `ExperienceDetail.tsx`,
`Profile.tsx`, `Credits.tsx`, `Explore.tsx`.

Several of these import other things from `react-router-dom` on the same line
(`useParams`, `Link`, `useSearchParams`). Keep those imports; remove only
`useNavigate` from the list, and delete the whole `react-router-dom` import line
only if `useNavigate` was the sole named import on it.

## Repo conventions to follow

- Shared hooks live in `apps/tourist-web/src/state/` (`useGuestPosition.ts`) and
  shared helpers in `apps/tourist-web/src/lib/` (`api.ts`, `supabase.ts`).
  This is a navigation helper, not guest state → `src/lib/`.
- `--ease-drawer` comes from **plan 001**. If 001 has not landed, write
  `cubic-bezier(0.32, 0.72, 0, 1)` literally and let 001 tokenise it.
- `global.css` is organised into `/* --- Name --- */` banner sections. Append
  this one after the existing `QR` section, before `.sr-only`.
- Exemplar for the comment voice: the `overflow-x: clip` block at
  `global.css:95-110` — state the defect, then the mechanism.

## Steps

1. Create `apps/tourist-web/src/lib/useAppNavigate.ts` with the file above.
2. Append the Route transitions section to
   `apps/tourist-web/src/design/global.css`.
3. In each of the 14 screens listed, swap `useNavigate` for `useAppNavigate`.
   Do not change any `navigate(…)` call body.
4. Leave `App.tsx` unchanged. The `scrollTo` effect and the `<Routes>` block
   both stay exactly as they are.
5. Run `grep -rn "useNavigate" apps/tourist-web/src/screens` — it must return
   nothing.

## Boundaries

- Do NOT add a dependency. No `framer-motion`, no `react-transition-group`, no
  `motion`. If the View Transitions approach cannot be made to work, STOP and
  report rather than reaching for a library.
- Do NOT animate back navigations in this plan. `navigate(-1)` and the browser's
  own back gesture both produce a `POP` that React Router does not route through
  the `viewTransition` option, so they will keep cutting. The `[data-nav='back']`
  CSS is written now so that a later plan can switch them on without touching
  the stylesheet; shipping a half-working back animation is worse than a
  consistent cut.
- Do NOT change the `scrollTo` effect in `App.tsx:36-39`. It is load-bearing and
  the comment above it documents a real React hook-order bug that was fixed there.
- Do NOT give individual screens `view-transition-name`. Only `root` and
  `.bottom-nav` are named; naming more creates independent layers that will
  fight each other.
- Do NOT touch `apps/admin-web` or `apps/vendor-web`.

## Verification

- **Mechanical**:
  - `pnpm --filter @cvip/tourist-web typecheck` → passes.
  - `pnpm lint` → passes.
  - `pnpm --filter @cvip/tourist-web build` → succeeds.
  - `grep -rn "useNavigate" apps/tourist-web/src/screens` → **no output**.
- **Feel check**: `pnpm tourist`, in Chrome (View Transitions required) at
  phone width.
  - Tap an experience card on Explore. The detail screen must come in **from the
    right** while Explore slides a shorter distance to the left and fades. They
    must read as one surface moving, not two screens crossing over.
  - **The bottom bar must not move at all.** If it slides with the content,
    `view-transition-name: bottom-nav` is missing or misspelled.
  - DevTools → Animations panel, playback 10%. Watch one push: the incoming
    screen should cover most of its distance early and settle (that is
    `--ease-drawer` doing its job). If it looks linear or symmetric, the easing
    did not apply.
  - Tap through four screens quickly without waiting. Each transition must
    either finish or be replaced cleanly — no screen should be left stranded
    half-way across, and no blank frame should appear.
  - Confirm the new screen still arrives **scrolled to the top** (the `scrollTo`
    effect runs inside the transition window; if a screen arrives mid-scroll,
    report it rather than editing `App.tsx`).
  - DevTools → Rendering → **Emulate prefers-reduced-motion: reduce**. Navigation
    must crossfade with no sideways travel at all — and must not become an
    instant cut.
  - Open in Firefox (or any browser without View Transitions). Navigation must
    hard-cut exactly as it does today, with no errors in the console.
- **Done when**: a push slides in from the right over a still bottom bar, back
  still cuts (by design), reduced motion crossfades, and an unsupported browser
  behaves exactly as it does at commit `19506a1`.
