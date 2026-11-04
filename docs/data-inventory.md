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
| `profiles` | yes | display name, interests, party size, locale, currency, role, three consent flags | account, personalisation, current consent state | contract; consent for the three flags | none defined | `erase_my_data()` scrubs name, interests, party size, island and consents; the shell stays until an Edge Function removes the sign-in (not built) |
| `bookings` | yes | who booked what, amounts, status, cancellation reason | contract, accounting | contract; legal obligation | 7 years from the transaction date, then anonymise (decided 2026-11-04; AML, tax and accounting duty) **[COUNSEL]** confirm | `erase_my_data()` scrubs the cancellation reason and keeps the row for the retention duty (GDPR Art 17(3)(b)); the guest is told what stayed and until when |
| `booking_guests` | yes | attendee names | contract | contract | follows its booking | `erase_my_data()` clears attendee names |
| `payments` | yes | Stripe ids, amounts, refunds, failure text; no card data | accounting, refunds | contract; legal obligation | 7 years from the transaction date, then anonymise (decided 2026-11-04; AML, tax and accounting duty) **[COUNSEL]** confirm | retained for the retention duty (Art 17(3)(b)); restricted to that purpose; no path |
| `vouchers` | yes | voucher state tied to a user, token hash only | redeeming an offer or booking | contract; consent for offers | offer vouchers: none defined; booking vouchers follow their booking (7 years) | `erase_my_data()` detaches offer vouchers from the user; booking vouchers stay with the booking |
| `voucher_redemptions` | yes | scanner user, result, device metadata | fraud control, audit | legitimate interest | scanner and device fields cleared 2 years after the scan (decided 2026-11-04, working default) **[COUNSEL]** confirm; the row itself stays, append-only otherwise | scanner id is set to null when the account is deleted; device fields cleared at 2 years |
| `promotion_impressions` | yes | which offer a guest was shown and when, which implies they were near the vendor | offer cooldown | consent (offer and location) | its geofence's cooldown plus one day, then `purge_short_lived_records()` removes it (not scheduled) | `erase_my_data()` deletes the rows |
| `consent_events` | yes | user, purpose (location, offers, notifications), granted or withdrawn, wording version, time | proof of consent (Art 7(1)) | legal obligation; legitimate interest (demonstrating consent) | 7 years from the last event, then delete (decided 2026-11-04, matches the other accountability records) **[COUNSEL]** confirm; append-only | cascades with the profile; whether proof must outlive an erased account is a question for counsel |
| `privacy_requests` | yes | pseudonymous subject id, kind of request (export, erasure or account removal), time, counts-only outcome; no names or content | accountability: showing a request was honoured (Art 5(2)) | legal obligation | 7 years from the request, then delete (decided 2026-11-04) **[COUNSEL]** confirm; append-only | kept by design after erasure, with no link to the profile; no free text |
| `redemption_anomaly_reviews` | yes | which flag an admin reviewed (pattern, scanner or voucher id), the admin's id, a short note (500 characters), time; ids carry no link to profiles | accountability: showing a flagged scan pattern was looked at | legitimate interest (fraud control) | none defined; append-only; follows `voucher_redemptions` **[COUNSEL]** | none: ids are pseudonymous and unlinked by design so the erasure cascade is not blocked; whether a scanner's id here must be scrubbed on erasure is a question for counsel |
| `ai_conversations` | yes | free-text chat history | Irie assistant | consent | `expires_at` defaults to 30 days; `purge_short_lived_records()` removes expired rows (not scheduled) | `erase_my_data()` deletes the rows; the PRD clear-history control is not built |
| `notifications` | yes | messages to a user | service messages | contract; consent for marketing | none defined | `erase_my_data()` deletes the rows |
| `saved_items` | yes | listings a guest saved | personalisation | contract | none defined | `erase_my_data()` deletes the rows |
| `trips` | yes | a guest's trip title and dates | personalisation | contract | none defined | `erase_my_data()` deletes the rows |
| `trip_items` | yes | items on a guest's trip | personalisation | contract | follows its trip | `erase_my_data()` deletes the rows with their trip |
| `reviews` | yes | a guest's rating and text | public reviews | legitimate interest | none defined | `erase_my_data()` deletes the rows |
| `rate_limit_events` | yes | actor key and action, for throttling | abuse prevention | legitimate interest | 7 days, then `purge_short_lived_records()` removes it (not scheduled; nothing writes the table yet) | no path |
| `audit_logs` | yes | acting admin, before and after snapshots which may contain personal data | accountability | legal obligation; legitimate interest | 7 years from the entry, then delete (decided 2026-11-04) **[COUNSEL]** confirm; append-only | the append-only guard allows two things only: the actor id set to null when the account is deleted (the row and snapshots stay), and deletion of rows over 7 years old by `purge_expired_records()`. Snapshots may still name the person until then **[COUNSEL]** |
| `vendor_members` | yes | link between a user and a vendor organisation | access control | contract | none defined | removed when the membership ends; no path |
| `vendor_documents` | yes | licence and identity documents, file names, review notes | vendor verification | legal obligation; legitimate interest | 7 years after the vendor relationship ends (`vendor_organizations.closed_at`, set by an admin; decided 2026-11-04; due diligence records) **[COUNSEL]** confirm | after 7 years: a storage job deletes each file from the private bucket, marks it with `mark_vendor_document_file_removed()`, and only then does `purge_expired_records()` delete the row. **The file-removal job is not built yet**; `vendor_documents_due()` lists what it owes. Earliest possible due date is 2033 |
| `vendor_organizations` | business | legal name, contact email and phone, payout account id | vendor onboarding and contact | contract | kept while bookings exist (7 years); `closed_at` marks the end of the relationship; the row itself is business data and has no purge yet **[COUNSEL]** whether a sole trader's contact details need one | no path |
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

1. **Consent proof: closed 2026-11-02 for location and offers** (`consent_events`, `record_consent()`).
   Every change records purpose, answer, time and a wording version that is a hash of the displayed
   text. A direct update of a consent flag is refused. Not covered: `notification_consent` has no
   screen yet; service-role writes leave no event; the text behind an old version is recovered from
   git history, not stored.
2. **Erasure and export: database side built 2026-11-03** (`export_my_data()`, `erase_my_data()`).
   Erasure deletes or scrubs everything outside a legal retention duty and keeps bookings, payments
   and consent proof; it tells the guest what stayed. Profile buttons built 2026-11-03. Removal of
   the sign-in is built but **switched off** (`privacy.account_removal_enabled` is `false`): the
   `delete-my-account` Edge Function calls the Auth admin API only after `begin_account_removal()`
   agrees (switch on, erasure in the last hour, no bookings, tourist only). It stays off until counsel
   rules on consent proof, because deleting the Auth user cascades `consent_events`. A guest with bookings cannot
   be fully deleted, by design (`bookings.user_id` is `ON DELETE RESTRICT`). Staff accounts are
   refused. Every request is recorded in `privacy_requests` (no link to the profile, so it survives
   erasure). `rate_limit_events` is keyed by an opaque actor string and is not reached.
3. **No retention enforced.** 7 years is decided for financial and accountability tables (2026-11-04) and `purge_expired_records()` (service role only, migration `20261104000002`) applies it to bookings and payments but nothing schedules it; other tables are not covered yet. A floor is enforced: a trigger refuses to delete a `bookings` or `payments` row under 7 years old (migration `20261104000001`); only the future job, setting `cvip.retention_purge`, can purge older rows. `ai_conversations` has an expiry column and no job that uses it; every
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
