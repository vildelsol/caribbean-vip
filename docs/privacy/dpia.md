# DPIA: geofenced offers (DRAFT for counsel)

Why one is needed: the feature uses a guest's live location to decide when to show a vendor offer.
Systematic location tracking of visitors is a typical trigger for an impact assessment.
**[COUNSEL]** confirm the trigger under each applicable law.

## 1. What happens
1. Guest turns on **location** (device permission) and **offers** (separate switch). Both are off by default.
2. The app sends the position to the `eligible-offer` Edge Function.
3. The function checks both consents **on the server** (`profiles.location_consent`, `offer_consent`),
   then the vendor zone, then a cooldown. It returns an offer or nothing.
4. A shown offer is logged in `promotion_impressions` (user, offer, time).
5. Claiming needs the offer to have been shown in the last 30 minutes (`claim-offer`).

Does the position get stored? No. `eligible-offer` uses `lat`/`lng` in memory only; the one write is
`promotion_impressions` (promotion, geofence, user). The error log prints the message only. The
impression row implies proximity to a vendor but holds no coordinates. Hosting request logs
(Vercel, Supabase) may still hold request metadata **[UNKNOWN: confirm the POST body is not logged]**.

## 2. Data and people
Visiting tourists, Jamaica, Barbados, Cayman, plus EU/UK residents. Adults. No special-category data
is collected on purpose. Free-text chat could contain any.

## 3. Necessity and proportion
| principle | how it is met today |
|---|---|
| Consent, freely given | two separate switches; the app works without either; wording shown is hashed into a version |
| Provable | `consent_events`, append-only, written only by `record_consent()` |
| Minimisation | no coordinates stored; one impression row per offer shown |
| Withdraw as easily as give | Profile "Privacy & data" switches; withdrawal is recorded |
| Access and portability | `export_my_data()` |
| Erasure | `erase_my_data()` scrubs; bookings and payments stay for accounting |
| Server decides | the Edge Function ignores any consent the app claims |

## 4. Risks
| # | risk | likelihood | severity | mitigation | residual |
|---|---|---|---|---|---|
| 1 | Location history reveals where a guest stays or goes | low (not stored) | high | do not persist coordinates; keep impressions coordinate-free | **[COUNSEL]** |
| 2 | Offers shown without valid consent | low | medium | server-side double check; tests prove each denial | low |
| 3 | Anonymous user later linked to an email, joining history to identity | medium | medium | disclose in notice; export and erase cover it | **[COUNSEL]** |
| 4 | Impressions kept forever | high today | low | retention job (not built); only recent rows are needed | open |
| 5 | Erasure leaves bookings, payments, consent proof | certain | low | stated in the erase dialog; legal basis **[COUNSEL]** | accepted if counsel agrees |
| 6 | Staff read personal data | medium | medium | roles, `audit_logs` | medium until audit-log retention is set |
| 7 | Backup restore brings erased data back | low | medium | restore runbook must replay erasures (not written) | open |
| 8 | Tourists outside the three islands' laws | medium | unknown | **[COUNSEL]** which laws apply | open |

## 5. Open before launch
Retention periods; audit-log versus erasure rule; backup-restore replay; sign-in removal after erasure
(Edge Function using the Auth admin API); processor DPAs; the privacy notice; consultation with the
data protection authority if risk 1 stays high **[COUNSEL]**.

Sign-off: **[COUNSEL]** / Ro. Date: ______
