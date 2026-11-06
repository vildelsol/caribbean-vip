# Accessibility checks

Automated floor: `apps/tourist-web/src/screens/headings.test.ts` fails if a screen loses its `h1`.

Real check: run axe-core in a browser against the demo build. It is not a dependency; fetch it
on demand and keep it out of git.

1. `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --port 5174` in `apps/tourist-web` (demo mode, no backend).
2. Copy `axe.min.js` (npm `axe-core`) to `apps/tourist-web/public/axe-tmp.js`. Delete it afterwards.
3. In the browser console, load it and run `axe.run(document, { runOnly: ['wcag2a','wcag2aa','wcag21aa','best-practice'] })` on each route. Click through Welcome first, or every route shows only Welcome.

## Pass of 2026-11-06 (tourist app, demo mode)
Routes checked: Welcome, Explore, Nearby, Search, Irie, Trips, Profile, Credits, Offer, Experience, Checkout,
Confirmation, Ticket, Review, Redeem, Booking return, catalogue load-failure screen.
Fixed: unreadable load-failure screen (1.21:1), contrast on the gold badge, Nearby map labels and ticket hand-over text,
missing `h1` on Nearby, Search, Booking return, a map `role="img"` containing buttons, `aria-label` on a role-less star row.
Vendor and admin apps (demo mode): every route checked. Fixed one contrast miss (earnings rate pill) and the demo banner outside any landmark.
Tip: wait about 2 seconds after loading a Next route before running axe; run too early, the stylesheet is missing and it reports false contrast failures.
Not checked: keyboard-only walkthrough, screen-reader listening, text zoom to 200%, the live (non-demo) catalogue, the clash dialog.
