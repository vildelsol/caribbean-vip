# Personal data inventory

Privacy by design is a standing rule for this product: GDPR (Articles 5, 7, 17, 20, 25, 30, 35) for EU
and UK visitors, alongside the Jamaica Data Protection Act 2020, Barbados Data Protection Act 2019 and
Cayman Data Protection Act 2017. Counsel confirms which apply and the lawful basis for each purpose
(OD-04); this file records what the system holds so that conversation starts from facts.

**Guard:** `packages/supabase/src/dataInventory.test.ts` fails when a migration creates a table that is
not listed here, when a listed table does not exist, or when a table marked personal has no retention
or erasure entry. A new table cannot ship without someone deciding what it holds.

**Columns.** `personal`: `yes` (about a guest or a person at a vendor), `business` (a business contact
or address), `no`. `basis` is *proposed*, not settled. `retention` is what the system does today, not
what we intend; "none defined" means rows live until the profile row is deleted, and no deletion path
exists yet. `erasure` is what a deletion request would do today.

| table | personal | data held | purpose | basis (proposed) | retention | erasure |
|---|---|---|---|---|---|---|
| `profiles` | yes | display name, interests, party size, locale, currency, role, three consent flags | account, personalisation, consent record | contract; consent for the three flags | none defined | no path; deleting the row cascades to dependent tables |
| `bookings` | yes | who booked what, amounts, status, cancellation reason | contract, accounting | contract; legal obligation | none defined; accounting period set by counsel | anonymise, not delete, while a legal retention period runs; no path |
| `booking_guests` | yes | attendee names | contract | contract | follows its booking | anonymise with the booking |
| `payments` | yes | Stripe ids, amounts, refunds, failure text; no card data | accounting, refunds | contract; legal obligation | none defined | retained for accounting; no path |
| `vouchers` | yes | voucher state tied to a user, token hash only | redeeming an offer or booking | contract; consent for offers | none defined | cascades with the profile |
| `voucher_redemptions` | yes | scanner user, result, device metadata | fraud control, audit | legitimate interest | none defined; append-only | pseudonymise the scanner and device fields; no path |
| `promotion_impressions` | yes | which offer a guest was shown and when, which implies they were near the vendor | offer cooldown | consent (offer and location) | none defined; only recent rows are needed for the cooldown | cascades with the profile |
| `ai_conversations` | yes | free-text chat history | Irie assistant | consent | `expires_at` defaults to 30 days; no purge job found in the repository | cascades with the profile; PRD requires a clear-history control, not built |
| `notifications` | yes | messages to a user | service messages | contract; consent for marketing | none defined | cascades with the profile |
| `saved_items` | yes | listings a guest saved | personalisation | contract | none defined | cascades with the profile |
| `trips` | yes | a guest's trip title and dates | personalisation | contract | none defined | cascades with the profile |
| `trip_items` | yes | items on a guest's trip | personalisation | contract | follows its trip | cascades with the trip |
| `reviews` | yes | a guest's rating and text | public reviews | legitimate interest | none defined | no path; text may need removal rather than deletion |
| `rate_limit_events` | yes | actor key and action, for throttling | abuse prevention | legitimate interest | none defined; should be hours or days | no path |
| `audit_logs` | yes | acting admin, before and after snapshots which may contain personal data | accountability | legal obligation; legitimate interest | none defined; append-only | conflicts with append-only: needs a documented rule |
| `vendor_members` | yes | link between a user and a vendor organisation | access control | contract | none defined | removed when the membership ends; no path |
| `vendor_documents` | yes | licence and identity documents, file names, review notes | vendor verification | legal obligation; legitimate interest | none defined | no path; files live in private storage and need deleting too |
| `vendor_organizations` | business | legal name, contact email and phone, payout account id | vendor onboarding and contact | contract | none defined | no path |
| `vendor_locations` | business | business address and coordinates | showing where the vendor is | contract | none defined | no path |
| `availability_slots` | no | capacity and times | scheduling | n/a | n/a | n/a |
| `destinations` | no | places | catalogue | n/a | n/a | n/a |
| `experience_media` | no | listing media | catalogue | n/a | n/a | n/a |
| `experience_options` | no | prices and options | catalogue | n/a | n/a | n/a |
| `experiences` | no | listings | catalogue | n/a | n/a | n/a |
| `geofences` | no | vendor-defined offer zones | offer eligibility | n/a | n/a | n/a |
| `islands` | no | island settings | catalogue | n/a | n/a | n/a |
| `platform_settings` | no | configuration | operation | n/a | n/a | n/a |
| `promotion_experiences` | no | links between offers and listings | catalogue | n/a | n/a | n/a |
| `promotions` | no | vendor offers | offers | n/a | n/a | n/a |

## What the design already gets right (as of 2026-11-02)

- **Position is not stored.** `eligible-offer` receives a guest's coordinates, decides, and writes only
  an impression (promotion, fence, user, time). Errors are logged without request data.
- **Consent is read server-side**, from the profile, never from the request; both flags must be true.
- **Row Level Security** is enabled on every table (policy quality is a separate review), and a guest
  can update only their own profile row, consent columns included.
- **Card data never reaches this system**; Stripe holds it.

## Gaps, ranked by consequence (as of 2026-11-02)

1. **No proof of consent (Art 7(1)).** Consent is a bare boolean: no timestamp, no wording version, no
   history of withdrawal. A regulator can ask when a guest agreed and to what text; the system cannot say.
2. **No erasure or export path (Art 17, 20).** Nothing lets a guest delete their account or download
   their data, and nothing defines what is erased versus retained for accounting.
3. **No retention enforced.** `ai_conversations` has an expiry column and no job that uses it; every
   other personal table keeps rows indefinitely, including `promotion_impressions`, which records where
   a guest was.
4. **No processor record.** Supabase, Stripe, Vercel, any email sender, and the Irie model
   provider (OD-07) are processors; no data processing agreements, hosting regions or transfer
   mechanisms for EU visitors are recorded here.
5. **No DPIA.** Geofenced marketing on precise location is the kind of processing Art 35 asks to be
   assessed before launch.
6. **Audit log versus erasure.** An append-only log of before and after snapshots needs a rule for
   personal data inside it.

Closing 1 to 3 needs a migration (consent history, retention jobs, an erasure function) and counsel's
retention periods; 4 and 5 are documents and need Ro.
