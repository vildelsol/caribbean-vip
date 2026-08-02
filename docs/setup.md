# Setup

Everything here has been run on a clean checkout. Commands and results are recorded in the
verification log in [`implementation-status.md`](implementation-status.md).

## Requirements

| Tool | Version used | Notes |
|---|---|---|
| Node | 20+ (verified on 26.4.0) | |
| pnpm | 9.15.9 | **Required — npm workspaces will not work.** See AD-01 in [`architecture.md`](architecture.md). |
| Supabase CLI | latest | Needed from M1 onward, not for M0 |
| Docker | latest | Local Supabase |

No third-party credentials are needed to install, type-check, lint, test or build. Maps,
notifications, AI and payments all default to mock adapters (operating rule 4).

## Install

```bash
npx pnpm@9 install
```

If you prefer pnpm on your PATH: `npm install -g pnpm@9`, then use `pnpm` in place of `npx pnpm@9`
below.

## Everyday commands

Run from the repository root.

```bash
pnpm test
```

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm vendor
```

```bash
pnpm admin
```

```bash
pnpm mobile
```

Vendor portal serves on `http://localhost:3001`, admin console on `http://localhost:3002`. `pnpm
mobile` starts the Expo dev server; press `i` for the iOS simulator or scan the QR code with Expo
Go.

To verify the mobile app bundles without launching a simulator:

```bash
pnpm bundle:mobile
```

## Environment

Each app ships a `.env.example`. Copy it and fill in locally — never commit the result
(operating rule 10).

```bash
cp apps/mobile/.env.example apps/mobile/.env && cp apps/vendor-web/.env.example apps/vendor-web/.env && cp apps/admin-web/.env.example apps/admin-web/.env
```

**The variable-naming rule matters.** Anything prefixed `EXPO_PUBLIC_` or `NEXT_PUBLIC_` is compiled
into the client bundle and must never hold a secret (PRD §14). Service-role keys, the Stripe secret
key, the Stripe webhook secret and `VOUCHER_HMAC_SECRET` belong only to Edge Functions, and
`packages/types/src/env.ts` splits the two schemas so the boundary is enforced rather than
remembered. `pnpm test` asserts it.

## What works today (M0)

- `packages/types` — money, pricing, voucher codec, state machines, env schemas, all unit-tested.
- `packages/ui` — Caribbean VIP design tokens with contrast tests.
- `apps/vendor-web`, `apps/admin-web` — Next.js shells that build and serve.
- `apps/mobile` — Expo app that bundles, with the PRD §5 five-tab navigation
  (Explore · Nearby · **Irie AI** · Trips · Profile).

Nothing connects to a database yet. Supabase, auth, seed data and the Jamaica content arrive in M1;
see [`implementation-plan.md`](implementation-plan.md).

## Coming in M1

```bash
supabase start
supabase db reset
```

This section will be filled in with the real commands and their output when M1 lands, not before.
