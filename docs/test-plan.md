# Test Plan

Per PRD §13: unit tests for pricing, permissions, voucher validation and booking state; integration
tests for payment webhook and redemption; end-to-end smoke tests for core journeys.

## Layers

| Layer | Tool | Runs where | Speed |
|---|---|---|---|
| Unit (pure domain) | Vitest | `packages/types` — no I/O, no database | milliseconds |
| Database / RLS | pgTAP against local Supabase | `supabase/tests` | seconds |
| Integration (Edge Functions) | Vitest + local Supabase + Stripe fixtures | `supabase/functions/**/*.test.ts` | seconds |
| End-to-end | Playwright (web), Maestro (Expo) | staging-like local stack | minutes |

CI runs unit + database + integration on every push. E2E runs on demand and before a milestone gate.

## What must be tested, and why

These are the tests that exist because getting them wrong loses money, leaks data, or breaks a PRD
guarantee. They are not optional and are written in the milestone that introduces the code.

### Pricing (T-04, "never trust totals submitted by the client")

Table-driven over `calculateBookingTotal`: adults/children/infants, add-ons, percentage and fixed
discounts, tax, service fee, rounding at every boundary, zero-guest and over-capacity rejection.
Plus: `checkout-ignores-client-total` — submit a tampered total, assert the server charges its own
figure.

### Capacity (V-03)

`capacity-race`: N concurrent `reserve_availability()` calls against a slot with capacity 1. Assert
exactly one succeeds and `booked_count` never exceeds `capacity`. A sequential-only test would pass
against a broken implementation, so this test must actually run concurrently.

### Webhook idempotency (T-05, "exactly once")

Replay the identical `checkout.session.completed` fixture three times; assert one booking, one
payment row, one voucher. Out-of-order delivery: `payment_intent.succeeded` before
`checkout.session.completed`. Signature verification: tampered payload rejected without a database
write. Unknown event type: ignored, 200 returned.

### Voucher codec and redemption (T-06, V-04, V-05)

- Codec: payload contains only a random id and version — asserted structurally, so a future change
  that adds an email or a booking reference fails the test.
- Tampered HMAC rejected before any database access.
- `redemption-duplicate`: two concurrent scans of the same valid voucher — one `ok`, one
  `already_redeemed` carrying the first scan's timestamp. Then a third sequential scan, same result.
- Every failure branch: expired, wrong vendor, booking not paid, cancelled, invalidated, unknown
  token. Each writes a `voucher_redemptions` row.

### RLS (T-01, T-03, V-02, PRD §14)

Negative cases carry the weight:

- `anon` cannot see a draft, pending, unpublished or rejected listing.
- `anon` cannot see a listing whose vendor is `pending_review` or `suspended`.
- Tourist A cannot read tourist B's booking, voucher, trip or AI conversation.
- Vendor staff at org X cannot read org Y's bookings.
- Vendor staff cannot read payout settings.
- Non-admin cannot write `platform_settings` or read `audit_logs`.
- `rls_enabled_everywhere`: enumerate `pg_tables` in `public`, fail if any has RLS off.
- `voucher_redemptions` and `audit_logs` reject UPDATE and DELETE from every role.

### Consent and cooldown (T-07, V-06)

Location is not requested and not transmitted unless OS permission **and** `offer_consent` are both
true. Cooldown suppresses a repeat impression inside the window. Expired, disabled,
inventory-exhausted, already-redeemed and wrong-island offers do not trigger. With consent revoked
mid-session, manual nearby discovery still returns results.

### Irie AI grounding (PRD §11)

Ask for a vendor that does not exist → the response says it is not available and invents nothing.
Every returned card carries a real `experience_id` that resolves to an approved row. With the
provider forced offline, the tab falls back to search. System prompt and internal IDs are not
present in any response.

### Degraded modes (PRD §14, §16)

Location denied · map provider fails · AI unavailable · payment pending · offline. Each renders a
usable state rather than an error screen. This is an explicit PRD requirement, so it is a test, not a
manual check.

## Fixtures

- Stripe: recorded test-mode event JSON committed under `supabase/functions/stripe-webhook/fixtures`.
  No live Stripe call in CI.
- Demo data: the Jamaica seed, all `is_demo = true`.
- Card numbers: Stripe's published test cards, referenced by documentation only — never hard-coded
  into application code.

## Milestone gate

A milestone is not done until: type-check passes, lint passes, its tests pass, migrations apply to a
fresh database, `setup.md` is current, and `implementation-status.md` + `traceability.md` are
updated. Commands and results are recorded in the verification log in `implementation-status.md` per
operating rule 5.
