# Processor record (DRAFT for counsel)

Controller: **[COUNSEL]** legal operating entity not yet fixed (OD-01).

| processor | role | personal data it handles | where | contract / transfer basis |
|---|---|---|---|---|
| Supabase | database, sign-in (Auth), Edge Functions, file storage | every table in `data-inventory.md`; sign-in email; anonymous user ids | AWS `us-east-1` (`docs/supabase-provisioning.md`) | **[UNKNOWN]** DPA signed? **[COUNSEL]** transfer mechanism for EU/UK guests |
| Stripe | card payments | booking amount, email, Stripe customer and payment ids. Card numbers never reach our servers or database (`payments` holds ids only) | Stripe-managed | Stripe DPA applies on account terms **[UNKNOWN]** confirmed. Stripe is also an independent controller for its own fraud and compliance duties **[COUNSEL]** |
| Vercel | hosts the four web apps | request logs: IP address, user agent, URL | Vercel-managed | **[UNKNOWN]** DPA accepted on the account? |
| Email sender for sign-in codes | sends the 8-digit code | sign-in email address | **[UNKNOWN]** Supabase default sender or a custom SMTP provider | **[UNKNOWN]** |

## Not in use yet
Add a row, and a `data-inventory.md` entry if it stores data, before any of these goes live:

- Maps provider (`MAPS_PROVIDER` is `mock`; Google or Mapbox undecided, OD-05). A map that receives
  the guest's position is a new disclosure of location data.
- AI provider (`AI_PROVIDER` is `mock`; Anthropic planned). `ai_conversations` holds free text, so a
  real provider receives whatever guests type.
- Notification provider (OD-05).
- Analytics or error tracking: none today.
- Monitoring and alerting: none today. The adapter is `createNullMonitoringPort()`, which sends
  nowhere. Alerts carry counts and opaque references only (`MonitoringPort` enforces this), so a
  provider receives no personal data — but it still receives our operational pattern and needs a row
  here, and a `region`, before it is wired up. Rules: `docs/production-provisioning.md` §8.

## Sub-processors and onward disclosure
- Vendors receive the booking details needed to deliver the excursion: guest name, party size, slot.
  They are controllers for their own delivery. The vendor terms need a data clause **[COUNSEL]**.
- Admin staff read personal data through the admin app. Access is by role; `audit_logs` records it.

## Records of processing (Art 30) pointers
Purposes, categories, retention and erasure per table: `docs/data-inventory.md`. Retention periods
are blank until counsel sets them.
