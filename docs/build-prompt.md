# Section 16 — Master Build Prompt (operating contract)

Transcribed from Section 16 of the source PDF. This is the standing operating contract for the build.

## Operating rules

1. Read `docs/PRD.md` completely before changing files. Treat it as the product source of truth.
2. Build in milestones M0 through M8. Do not attempt the entire product in one uncontrolled pass.
3. At the start, inspect the repository and produce: an implementation plan, architecture decisions,
   assumptions requiring confirmation, risks and external credentials required.
4. Do not stop merely because a credential is unavailable. Build the integration behind an
   environment variable, provide a safe mock/test adapter, document the missing credential, and keep
   the rest of the flow operational.
5. Never claim a feature works unless the relevant checks have been run. Record commands and results.
6. Do not silently omit a requirement. Mark each requirement as complete, partial, blocked or
   deferred in `docs/implementation-status.md`.
7. Prioritize correctness of authentication, authorization, price calculation, payment webhook
   handling, booking state, voucher signing and redemption over decorative UI.
8. Preserve the Caribbean VIP parent brand and localized in-app island experience: VIP Jamaica, VIP
   Cayman and future islands. Jamaica is the populated MVP market.
9. Use realistic seeded demo data but label it as demo content. Do not claim live prices,
   availability, reviews or vendor verification.
10. Do not put secrets in source control. Create `.env.example` files with clear variable names and
    setup instructions.

## Required technical direction

- Monorepo with `apps/mobile`, `apps/vendor-web`, `apps/admin-web`, `packages/ui`, `packages/types`,
  `packages/config` and `supabase` folders.
- TypeScript throughout.
- Expo React Native tourist app.
- Next.js vendor and admin portals.
- Supabase for PostgreSQL, authentication, storage and Row Level Security.
- Stripe test mode for checkout and webhook-confirmed payments. Design payment services so Stripe
  Connect can be introduced without rewriting booking logic.
- Shared runtime validation schemas for API inputs and domain objects.
- Provider adapters for maps/geolocation, notifications and AI so they can be mocked in local
  development.
- Automated tests for pricing, access control, capacity, webhook idempotency and QR redemption.

## First deliverable — do not skip

- `docs/architecture.md`
- `docs/implementation-plan.md`
- `docs/implementation-status.md`
- `docs/setup.md`
- `docs/test-plan.md`
- an initial database entity relationship summary → `docs/erd.md`
- a requirement traceability table mapping PRD IDs to code areas and tests → `docs/traceability.md`

Then present the plan and begin M0 unless a genuinely blocking product decision is required.

## Build order

| | |
|---|---|
| M0 | Repository foundation |
| M1 | Auth, database, RLS, roles, islands, destinations and seeded Jamaica content |
| M2 | Tourist discovery, search, filters, maps, details and saved items |
| M3 | Availability, server-side pricing, Stripe checkout, webhook, bookings, Trips and QR vouchers |
| M4 | Vendor onboarding, listings, availability, bookings, promotions and mobile QR scan/redemption |
| M5 | Admin approvals, moderation, configuration, booking operations and audit logs |
| M6 | Geofenced nearby offers, consent, cooldown, saved vouchers and promotion eligibility |
| M7 | Irie AI grounded recommendations and itinerary generation with a non-AI fallback |
| M8 | Security, accessibility, testing, observability, performance and deployment hardening |

## Core business rules

- Only approved vendors and approved active listings are public.
- Prices and totals are calculated server-side.
- Capacity cannot be oversold; booking writes must be transactionally safe.
- Stripe webhook state is authoritative for payment completion.
- Webhook and booking operations must be idempotent.
- QR codes contain opaque signed references, not raw personal or payment data.
- Voucher redemption is atomic and cannot be completed twice.
- Geofenced offers require explicit user permission and offer consent, include cooldowns, and have a
  manual discovery fallback.
- Irie AI may recommend only approved inventory or curated platform content; it must not invent
  availability or vendor facts.
- Every privileged admin action and voucher redemption is audit logged.

## User experience

Implement the visual language from the existing Caribbean VIP direction: clean, bright, premium but
inclusive, warm neutral backgrounds, deep Caribbean green, turquoise and restrained coral/gold
accents. Keep the mobile interface readable outdoors. Use consistent cards, spacing and navigation.
**Irie AI is the centre bottom-navigation item.** The application must remain useful when location,
notifications or AI access is denied.

## Demo content

Seed Jamaica with destinations including Ocho Rios, Montego Bay, Negril, Kingston, Port Antonio and
South Coast. Include clearly labelled demo vendors and experiences across waterfalls, beaches,
adventure, food, culture, nightlife, wellness, transportation, shopping, family activities, day trips
and water sports. Include a demo geofenced offer such as "Free rum punch with a qualifying booking,"
with explicit terms and expiry.

## Payment demo

Use Stripe test mode. Provide a documented demo flow with Stripe-provided test payment information;
never hard-code real card data. On successful test payment, create a paid booking, add it to Trips
and generate the voucher. Provide failure and pending states.

## Quality gates for each milestone

- Type-check passes.
- Lint passes.
- Relevant unit/integration tests pass.
- Migrations apply cleanly to a fresh local/test database.
- Setup documentation is updated.
- `implementation-status.md` and requirement traceability are updated.
- No unresolved critical security or data-integrity defect is knowingly carried forward.

## When ambiguity is encountered

Choose the simplest architecture that satisfies the MVP and document the decision. Ask only when the
choice materially changes commercial behaviour, legal obligations or user-visible scope. Do not ask
for approval for ordinary engineering decisions.

## Final handover

- Fully documented source code.
- Environment and deployment instructions.
- Database migrations and seed scripts.
- Demo accounts and roles.
- Automated test instructions and results.
- Known limitations.
- Production-readiness checklist.
- App-store and vendor/admin deployment checklist.
- A concise list of decisions still required before accepting real customer payments or onboarding
  real vendors.
