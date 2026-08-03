# Setup

Everything here has been run on a clean checkout. Commands and results are recorded in the
verification log in [`implementation-status.md`](implementation-status.md).

## Requirements

| Tool | Version used | Notes |
|---|---|---|
| Node | 20+ (verified on 26.4.0) | |
| pnpm | 9.15.9 | **Required — npm workspaces will not work.** See AD-01 in [`architecture.md`](architecture.md). |
| PostgreSQL | 17 (client + server) | Required for the database tests. `brew install postgresql@17 && brew services start postgresql@17` |
| Supabase CLI | latest | Only needed to run the full Supabase stack or regenerate types |
| Docker | latest | Optional — only for `supabase start`. **The test suite does not need it.** |

> The database tests run against a plain PostgreSQL instance plus
> [`supabase/tests/_harness.sql`](../supabase/tests/_harness.sql), which stands in for the pieces of
> Supabase the migrations touch (`auth.users`, `auth.uid()`, the `anon`/`authenticated`/
> `service_role` roles). That keeps migrations, RLS and the atomicity functions verifiable without
> Docker, in CI as well as locally. It is not a Supabase emulator — Storage policies and Auth
> behaviour still need a real project before staging.

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

Rebuild a fresh database, apply every migration in order, seed Jamaica and run the SQL suite:

```bash
pnpm db:test
```

The concurrency suite — V-03 and V-05 with 16 real simultaneous connections. Worth running after
any change to `reserve_availability` or `redeem_voucher`, because the sequential tests pass even
against an implementation with no row lock:

```bash
pnpm db:concurrency
```

Everything the milestone gate requires, in one command:

```bash
pnpm verify
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
cp apps/vendor-web/.env.example apps/vendor-web/.env && cp apps/admin-web/.env.example apps/admin-web/.env
```

**The variable-naming rule matters.** Anything prefixed `EXPO_PUBLIC_` or `NEXT_PUBLIC_` is compiled
into the client bundle and must never hold a secret (PRD §14). Service-role keys, the Stripe secret
key, the Stripe webhook secret and `VOUCHER_HMAC_SECRET` belong only to Edge Functions, and
`packages/types/src/env.ts` splits the two schemas so the boundary is enforced rather than
remembered. `pnpm test` asserts it.

## What works today (M0–M2)

- `packages/types` — money, pricing, voucher codec, state machines, env schemas, all unit-tested.
- `packages/ui` — Caribbean VIP design tokens with contrast tests.
- `packages/supabase` — client factories that refuse a service-role key in a client bundle.
- `supabase/` — the full schema for all 24 PRD entities, RLS on every table, the two atomicity
  functions, and seeded Jamaica demo content.
- `apps/tourist-web` — React + TypeScript tourist app on Vite. Guest browsing (T-01), island and
  destination switching (T-02), Explore, Nearby with distance sorting over a stylised map, a
  rule-matched Irie AI, Trips and Profile. It needs no environment file: it runs entirely on the
  demo catalogue and LocalStorage. The Expo app it replaced is retired in `.archive/mobile`.
- `apps/vendor-web` — membership-gated portal shell.
- `apps/admin-web` — role-gated console shell.

Every app runs against a real database as soon as one is configured, and renders a labelled
unconfigured state when one is not.

## Connecting to Supabase

Nothing above requires a hosted project. To use one:

1. Create a Supabase project.
2. Apply the migrations — either `supabase db push`, or run the SQL in
   `supabase/migrations/` in filename order.
3. Optionally seed demo content with `supabase/seed/seed.sql`.
4. Put the project URL and **anon** key in each app's `.env`.

Regenerate the database types once the project exists, replacing the hand-written file:

```bash
supabase gen types typescript --project-id <your-project-id> > packages/supabase/src/database.types.ts
```

### Creating the first admin

`profiles.role` defaults to `tourist` and **cannot be self-assigned** — a trigger rejects any role
change made by a non-super-admin, which is what stops a tourist promoting themselves into the admin
console. The first admin therefore has to be set from the SQL editor, where there is no end-user
context:

```sql
update profiles set role = 'super_admin' where id = '<the user uuid>';
```

## Optional providers

Everything runs on mocks by default, so no third-party account is needed.

| Variable | Default | Effect |
|---|---|---|
| `EXPO_PUBLIC_MAPS_PROVIDER` | `mock` | `mock` renders Nearby as a distance-sorted list with an explicit "map view unavailable" notice. Set to `google` or `mapbox` (with `EXPO_PUBLIC_MAPS_PUBLIC_KEY`) to enable the map. The provider is still an open decision — see OD-05. |

The mock location provider deliberately reports permission as **denied**. That means the
location-denied path — an explicit PRD §14 requirement — is the one you exercise by default,
rather than the one nobody sees until release.
