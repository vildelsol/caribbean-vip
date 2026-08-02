# Architecture

Caribbean VIP MVP. Derived from [`PRD.md`](PRD.md) §12–14 and the Section 16 technical direction.

---

## 1. System shape

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  apps/mobile     │   │ apps/vendor-web  │   │ apps/admin-web   │
│  Expo RN         │   │ Next.js          │   │ Next.js          │
│  Tourist app     │   │ Vendor portal    │   │ Admin console    │
└────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘
         │                      │                      │
         │  anon key + user JWT │  anon key + user JWT │
         ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Supabase                                │
│  Postgres + Row Level Security   │  Auth   │  Storage (private) │
│  Edge Functions (Deno)                                          │
│   ├─ checkout-session   (server-side pricing → Stripe)          │
│   ├─ stripe-webhook     (payment source of truth, idempotent)   │
│   ├─ redeem-voucher     (atomic redemption)                     │
│   ├─ nearby-offers      (geofence eligibility)                  │
│   └─ irie-ai            (grounded retrieval + LLM)              │
└──────────────┬──────────────────────────────┬───────────────────┘
               │                              │
               ▼                              ▼
        ┌────────────┐                 ┌──────────────┐
        │  Stripe    │                 │ AI provider  │
        │ test mode  │                 │  (adapter)   │
        └────────────┘                 └──────────────┘
```

**Trust boundary.** Client apps hold only the Supabase *anon* key and the signed-in user's JWT. All
privileged work — price calculation, Stripe session creation, webhook handling, voucher signing and
redemption — happens in Edge Functions holding the service-role key. No client ever sees the
service-role key, the Stripe secret key, the voucher signing secret, or the AI provider key.

---

## 2. Architecture decisions

Recorded per Section 16 ("choose the simplest architecture that satisfies the MVP and document the
decision"). Decisions that materially change commercial behaviour are escalated in
[`open-decisions.md`](open-decisions.md) instead.

### AD-01 — pnpm workspaces (revised during M0)

The PRD requires a monorepo but not a specific tool. This started as npm workspaces, on the grounds
that it needs no extra install. **That did not survive contact with the actual dependency graph** and
was changed during M0:

Expo SDK 52 targets React 18.3.1; Next.js 15 targets React 19. npm workspaces hoist a single copy of
each package to the root, so the two React majors collided in three separate ways:

1. `expo-asset` pulled React Native 0.86 alongside the 0.76.5 Expo SDK 52 requires, and Metro
   bundled the wrong one (a `match` expression in RN 0.86 source failed the Hermes parser).
2. Hoisting `expo-router` above `apps/mobile` moved it outside the app's Babel root, so
   `apps/mobile/babel.config.js` never applied to it and
   `require.context(process.env.EXPO_ROUTER_APP_ROOT)` was left un-inlined.
3. The Next builds failed outright with "Incompatible React versions: react 18.3.1 /
   react-dom 19.2.8".

pnpm's isolated `node_modules` gives each app the React it asks for, which is also Expo's own
recommendation for monorepos. Two settings in `.npmrc` are load-bearing and should not be removed:

- `node-linker=isolated` — the whole point; a flat linker reintroduces every problem above.
- `hoist-pattern[]=!@types/react` / `!@types/react-dom` — pnpm otherwise hoists all packages into
  `node_modules/.pnpm/node_modules`, where TypeScript finds React 19's types when resolving from
  React Navigation's real paths and leaks an incompatible `ReactNode` into the mobile type-check.

Shared packages carry an explicit `@babel/runtime` dependency because Metro transpiles them and
isolated linking will not let them borrow it from an app.

Turborepo can be layered on later without moving files.

### AD-02 — Fat testable core, thin Edge Function adapter (refined before M3)

Three clients (Expo, vendor-web, admin-web) need the same pricing, voucher and redemption logic. If
it lived in a Next.js route the Expo app would depend on a web app being deployed. Edge Functions
are client-agnostic and colocated with the database, and deploy with one command — which matters
for a small team that should not be operating a separate API service.

**But Edge Functions run on Deno, so vitest cannot import them and `supabase functions serve`
requires Docker.** Written the obvious way, the code that takes money would be the least-tested
code in the repository — the exact inversion of operating rule 7.

So the split is deliberate and load-bearing:

- **`packages/payments`** holds the orchestration: what a checkout does, how a webhook event
  changes booking state, when a voucher is issued. Pure functions over *injected* dependencies
  (a booking store, a payment provider, a clock, an id generator). No Deno, no network, no
  Supabase import. Tested in vitest against recorded Stripe fixtures, in milliseconds.
- **`supabase/functions/*`** are thin Deno adapters: parse the request, build the real
  dependencies, call the core, serialize the result. Tens of lines each, with no branching logic
  worth testing.

The rule of thumb: **if it can be got wrong, it belongs in the core.** A bug in an adapter breaks
the endpoint loudly and immediately; a bug in the orchestration double-charges someone quietly.

This preserves the original decision — the logic still runs in Edge Functions, deployed the same
way — while moving everything worth testing into a runtime that can be tested here.

### AD-03 — Postgres functions for the two atomicity-critical paths

Capacity reservation and voucher redemption are the two places where a race loses money or lets a
voucher be used twice. Both are implemented as `SECURITY DEFINER` Postgres functions using
`SELECT … FOR UPDATE` inside a single transaction, called from Edge Functions:

- `reserve_availability(slot_id, seats)` — locks the slot row, checks `booked_count + seats <=
  capacity`, increments, returns success/failure. Satisfies V-03.
- `redeem_voucher(token_hash, scanner_user_id, vendor_id, metadata)` — locks the voucher row,
  validates state/time window/vendor match, flips to `redeemed`, writes an immutable
  `voucher_redemptions` row, returns a typed result. Satisfies V-04 and V-05.

Doing this in application code with a read-then-write would be a TOCTOU bug under simultaneous scans.

### AD-04 — Vouchers use an opaque signed token; the database stores only a hash

PRD §9 forbids raw personal or payment data in the QR. The QR encodes
`cvip://v1/<base64url(payload)>.<hmac>` where the payload holds only a random 128-bit voucher id and
a version byte. The server stores `sha256(token)`, never the token itself, so a database read cannot
mint a working QR. The human-readable booking reference (e.g. `VIPJ-7M24-83A1`) is displayed
alongside for support, and is *not* accepted as a redemption credential.

### AD-05 — Money is integer minor units, everywhere; settlement is USD

All amounts are `bigint` minor units (cents) with an explicit ISO-4217 currency code. No floats, no
decimals in transit. This matches Stripe's own representation and removes a whole class of rounding
defect from the pricing tests.

**Settlement currency is USD** (OD-09, resolved 2026-08-02). PRD §3 asks for localized *currency
display*, which is a presentation concern: an island's currency may be shown alongside the price as
an indicative conversion, clearly labelled as such. Every `bookings` and `payments` amount is USD.
This keeps commission, refunds and reconciliation single-currency for the MVP; multi-currency
settlement would now require a migration across every monetary column plus per-currency Stripe
configuration.

### AD-06 — Pricing is a pure function, quoted server-side, re-verified at checkout

`calculateBookingTotal(input): PriceBreakdown` in `packages/types` is pure and fully unit-tested.
The client calls a quote endpoint to display a total (T-04), but the checkout Edge Function
**recomputes** the total from database state and ignores any client-supplied amount (PRD §10, "never
trust totals submitted by the client"). Fee, tax and commission rates come from a
`platform_settings` table, never constants (PRD §10 "configuration-driven rather than hard-coded").

### AD-07 — Provider adapters for maps, notifications and AI

Section 16 requires these be mockable. Each is a TypeScript interface in `packages/types` with a real
implementation and a `mock` implementation selected by env var. Local development runs entirely on
mocks, so the repo is runnable with zero third-party credentials — which also satisfies operating
rule 4. Maps provider and notification provider are still an open commercial decision
([`open-decisions.md`](open-decisions.md) OD-05), so the adapter boundary is what protects that
choice.

### AD-08 — Island scoping is a first-class column, not a deployment

PRD §3 requires one account, one wallet, one trip history across islands. So `island_id` is a foreign
key on destinations, vendor organizations, experiences and promotions, and localization is a runtime
theme + content switch driven by `profiles.selected_island_id`. There is no per-island build, no
per-island database, and no per-island app-store listing.

### AD-09 — Stripe Connect-ready without Connect

Payments go through a `PaymentProvider` interface whose booking-facing methods (`createCheckout`,
`handleWebhookEvent`, `refund`) never mention the destination account. Adding Connect later means
adding a `transfer_data`/`on_behalf_of` field inside the Stripe adapter and a
`vendor_organizations.stripe_account_id` column — no change to booking logic. Whether Connect is used
at launch is OD-02.

### AD-10 — Guest browsing via RLS on anonymous role, not a separate public API

T-01 requires browsing without an account. Rather than a second unauthenticated read path, the
`experiences`, `islands`, `destinations`, `experience_media` and `experience_options` tables carry an
RLS policy granting `SELECT` to `anon` **only** where the row is approved and active and its vendor
is approved. That makes T-03 ("inactive/unapproved listing never appears publicly") a database
guarantee rather than a query convention any developer could forget.

---

## 3. Package layout

| Path | Contents |
|---|---|
| `apps/mobile` | Expo Router tourist app. 5-tab navigation per PRD §5: Explore, Nearby, **Irie AI** (centre), Trips, Profile. |
| `apps/vendor-web` | Next.js App Router vendor portal. Separate deployment per PRD §6. Camera QR scan works in a phone browser. |
| `apps/admin-web` | Next.js App Router admin console per PRD §7. |
| `packages/types` | Zod schemas, domain types, pure pricing, voucher payload codec, booking/voucher state machines. No I/O. Depended on by all three apps and by the Edge Functions. |
| `packages/ui` | Design tokens (the Caribbean VIP palette) plus primitives shared where practical. Tokens are the real shared asset; RN and web components are kept separate. |
| `packages/config` | Base `tsconfig`, ESLint config, Prettier config, env schema. |
| `supabase/migrations` | Ordered SQL migrations. Schema, RLS, functions, triggers. |
| `supabase/functions` | Deno Edge Functions listed in §1. |
| `supabase/seed` | Jamaica demo content, clearly labelled as demo per operating rule 9. |

---

## 4. Design tokens

Sampled from the supplied mockup, which per the founder is a **colour-scheme reference only**. Coral
is specified by PRD §16 ("restrained coral/gold accents") but is not present in the mockup, so it is
chosen to harmonize and marked as such.

| Token | Hex | Source | Use |
|---|---|---|---|
| `sand` (background) | `#FBF1E3` | sampled | Warm neutral app background |
| `sandDeep` | `#F3E6D2` | derived | Card wells, dividers |
| `green900` | `#073A32` | sampled | Primary brand, headers, bottom nav |
| `green700` | `#0B5A53` | sampled | Primary buttons, active states |
| `green500` | `#1F5C54` | sampled | Secondary surfaces |
| `turquoise` | `#10828A` | sampled | Links, map accents, info |
| `turquoiseLight` | `#97CFE4` | sampled | Water/hero gradients, chips |
| `gold` | `#DBAA50` | sampled | Premium accent, VIP marks, CTA on dark |
| `goldDeep` | `#9E8541` | sampled | Gold text on light backgrounds (contrast) |
| `coral` | `#D9694F` | **chosen** | Restrained accent: alerts, expiry badges |
| `ink` | `#12211D` | derived | Body text |

Outdoor readability (PRD §16) is a hard constraint: body text is `ink` on `sand` (≈13:1) and
`sand` on `green900` (≈12:1). `gold` is never used for body text on `sand` — `goldDeep` is used
instead. Contrast pairs are asserted in a token test rather than trusted by eye.

---

## 5. Data flow: the three paths that must not be got wrong

### Booking + payment (T-04, T-05, PRD §10)

```
client → quote()            Edge Fn: recompute price from DB, return breakdown (display only)
client → createCheckout()   Edge Fn: recompute price AGAIN, reserve_availability(),
                            create booking(status=pending_payment) with idempotency key,
                            create Stripe session, return URL
Stripe → stripe-webhook     verify signature → upsert on (stripe_event_id) → mark payment paid,
                            booking confirmed, issue voucher, create trip_item — all in one tx
```

Idempotency has two layers: a unique index on `payments.stripe_event_id` makes replayed webhooks
no-ops, and a client-supplied idempotency key on `bookings` makes a double-tapped checkout return the
existing booking rather than a second one. T-05's "exactly once" is enforced by the index, not by
application care.

If the webhook never arrives, the booking stays `pending_payment` and a reconciliation job releases
the held capacity after a timeout. Capacity is reserved at checkout rather than at webhook time so
two people cannot both pay for the last seat.

### Voucher redemption (T-06, V-04, V-05, PRD §9)

```
vendor scans QR → token → redeem-voucher Edge Fn
  verify HMAC (reject unsigned/tampered without touching DB)
  hash token → redeem_voucher() Postgres fn:
     SELECT … FOR UPDATE on voucher
     assert state=active, now within window, vendor matches, booking paid, promo not exhausted
     UPDATE state=redeemed; INSERT voucher_redemptions (immutable)
  → typed result: ok | already_redeemed(at, by) | expired | wrong_vendor | invalid | not_paid
```

Every branch — including failures — writes a `voucher_redemptions` row, so V-05's "show original
redemption timestamp" is a read of real data and the audit trail captures attempted fraud.

### Geofenced offer (T-07, V-06, PRD §9)

Consent is checked twice: the OS permission, and a separate `profiles.offer_consent` flag. Both must
be true before any location leaves the device. Eligibility is evaluated server-side
(`nearby-offers`) so promotion inventory and cooldowns cannot be manipulated client-side. A
`promotion_impressions` row records the cooldown. The Nearby tab always offers manual discovery, so
denying location degrades the feature rather than breaking the app.

---

## 6. Security posture (PRD §14)

- RLS on **every** user-accessible table; the migration suite includes a test asserting no table in
  `public` has RLS disabled.
- `vendor_documents` and private media in a non-public bucket, reachable only via short-lived signed
  URLs minted server-side after an ownership check.
- Role and vendor-membership checks are Postgres helper functions (`is_admin()`,
  `is_vendor_member(org_id)`) used inside policies, so authorization lives in one place.
- Rate limiting on auth, AI, scan and sensitive mutations via a `rate_limit_events` table keyed by
  actor + action.
- Structured logs exclude PAN, CVC, full tokens and precise coordinates.
- Every privileged admin action and every redemption writes `audit_logs`.

---

## 7. Environments

| Environment | Supabase | Stripe | AI / Maps / Notifications |
|---|---|---|---|
| Local | Supabase CLI, Docker | Test keys, `stripe listen` | Mock adapters, zero credentials |
| Staging | Hosted project | Test keys | Real providers, test tier |
| Production | Hosted project | **Live keys — gated on the release gate and open decisions** | Real providers |

Per the final build principle, production-approved is not the same as production-like. The repo can
reach a deployable staging state without any of the open decisions being resolved.
