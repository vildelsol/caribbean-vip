# Caribbean VIP

> One platform. Every island.

A mobile-first regional tourism marketplace connecting tourists with verified local excursions,
attractions, restaurants and transport — with geofenced offers, QR vouchers and a grounded AI
concierge. Jamaica is the populated launch market; the architecture is island-aware from day one.

**Status:** M0 complete. Nothing here is production-approved — see
[`docs/implementation-status.md`](docs/implementation-status.md).

## Documentation

| Document | What it is |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | **Product source of truth.** Sections 1–15 of the founding PRD. |
| [`docs/build-prompt.md`](docs/build-prompt.md) | Section 16 — the standing operating contract for the build. |
| [`docs/architecture.md`](docs/architecture.md) | System shape, numbered architecture decisions, design tokens, security posture. |
| [`docs/erd.md`](docs/erd.md) | Entity relationship summary for all 24 PRD entities. |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | M0–M8 with per-milestone exit criteria. |
| [`docs/implementation-status.md`](docs/implementation-status.md) | Live status, verification log, missing credentials, known limitations. |
| [`docs/traceability.md`](docs/traceability.md) | Every PRD requirement ID → code area → test. |
| [`docs/test-plan.md`](docs/test-plan.md) | Test layers and the specific cases that must not be skipped. |
| [`docs/open-decisions.md`](docs/open-decisions.md) | Commercial and legal decisions still owned by the founding team. |
| [`docs/setup.md`](docs/setup.md) | How to run it. |

## Layout

```
apps/
  mobile/       Expo React Native tourist app — Explore · Nearby · Irie AI · Trips · Profile
  vendor-web/   Next.js vendor portal (separate experience; QR scanning in a phone browser)
  admin-web/    Next.js admin console
packages/
  types/        Domain types, Zod schemas, pure pricing, voucher codec, state machines
  ui/           Design tokens
  config/       Shared TypeScript / ESLint / Prettier config
supabase/       Migrations, Edge Functions, seed data
```

## Quick start

Requires **pnpm** — npm workspaces will not work here, and the reason is documented as AD-01 in
[`docs/architecture.md`](docs/architecture.md).

```bash
npx pnpm@9 install
```

```bash
pnpm test
```

```bash
pnpm vendor
```

Full instructions in [`docs/setup.md`](docs/setup.md).

## Ground rules

Carried from the PRD's operating rules, and enforced in code where possible:

- Prices are calculated server-side; a client-supplied total is never trusted.
- The Stripe webhook is the source of truth for payment, and it is idempotent.
- Capacity cannot be oversold; voucher redemption is atomic and cannot happen twice.
- QR codes carry an opaque signed reference — never personal or payment data.
- Geofenced offers require both an OS location permission and a separate in-app opt-in.
- Irie AI recommends only approved inventory. It does not invent vendors, prices or availability.
- Seeded demo content is labelled as demo. No live prices, availability or verified vendors are
  claimed.
