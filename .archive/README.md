# Archive

Retired code. **Nothing in here is built, type-checked, linted or tested**, and nothing outside it
may import from it. It is outside the pnpm workspace (`pnpm-workspace.yaml` globs `apps/*` and
`packages/*`) and ignored by ESLint.

It is kept in the tree rather than deleted because reading retired code is occasionally useful and
`git log` is a worse interface for that than a directory. Everything here is also in history, so
deleting the directory later loses nothing.

---

## `mobile/` — the Expo tourist app

**Retired 2026-08-03.** Replaced by `apps/tourist-web`.

It implemented the same product surface as the web app — the tourist journey — in React Native via
Expo Router. It reached M3 in demo mode: guest browsing, island and destination switching, search,
Nearby, listing detail, the rum-punch offer, date/party selection, simulated payment, the QR
voucher, and a rule-matched Irie AI.

### Why it was retired

1. **It was a second implementation of one product surface.** Every change was either made twice or
   the two drifted apart. Drift was the real risk to the product's integrity — not the choice of
   framework.

2. **A silent regression proved the point within an hour.** When `packages/ui` was rewritten to the
   Caribbean VIP Journey design, the typography tokens began naming `CormorantGaramond_*` and
   `Manrope_*`, which this app neither installed nor loaded. Every `Text` in it fell back to the
   platform default. Type-check, lint and all 238 tests passed regardless. A second app that nobody
   is actively running rots without telling anyone.

3. **Its claim to being "the native app" was never proven.** It had never run on a device or a
   simulator — only in a browser via `react-native-web`, which is what the web app does, with more
   traps: the `pointerEvents` prop deprecation, Metro resolving optional dependencies that were
   never installed, the `@types/react` hoisting rule, and a 4.46 MB bundle.

4. **It was drawn to a superseded design.** Migrating it meant redrawing every screen to the Journey
   design for no near-term benefit, since the investor demonstration is the web app.

### What this does *not* foreclose

OD-06 — app store versus an Expo pilot — is still open. Retiring this app does not decide it. If a
native app is built, it should be built from the shared packages against the current design, not
resurrected from screens drawn to the old one. What is archived here is a stale draft of the native
path, not the path itself.

### What survived, and where it went

The valuable parts were never in this app to begin with; they are in `packages/`, still tested, and
now consumed by the web app:

| What | Where it lives |
|---|---|
| Pricing, and the order of operations behind every total | `@cvip/types` — `calculateBookingTotal` |
| Voucher signing, verification, hashing, booking references | `@cvip/types` — `signVoucherToken` and friends |
| Booking and voucher state machines | `@cvip/types` — `states.ts` |
| Distance, radius, bounds | `@cvip/types` — `geo.ts` |
| The demo catalogue, and the RLS-mirroring visibility rule | `@cvip/demo` — `isPubliclyVisibleDemo` |
| Design tokens | `@cvip/ui` — mirrored into CSS by `apps/tourist-web`, with a parity test |
| The demo photography and its credits | `apps/tourist-web/public/demo`, `@cvip/demo/credits` |

Two things here have no successor and were deliberately not carried over:

- **`lib/demoMedia.ts`** — a hand-written static `require` map, needed only because Metro cannot
  resolve a dynamic asset path. The web app builds URLs dynamically. The test in
  `packages/demo/src/store.test.ts` that guarded it now checks only that every credited media key
  has a file, which is the half that always mattered.
- **`lib/localCurrency.ts`** — the "≈ JAM $11,700" display figures. Worth reinstating in the web app
  if the multi-currency story is wanted in a demonstration; it was display-only and never took part
  in a calculation that led to a charge (OD-09).
