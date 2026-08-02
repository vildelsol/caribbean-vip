# Open Decisions

The six assumptions PRD §16 defers to the founding team, plus decisions surfaced during
architecture. **None block the M0–M8 build.** All of them block accepting real customer payments or
onboarding real vendors.

| ID | Decision | Why it matters | Build proceeds by | Needed before |
|---|---|---|---|---|
| OD-01 | Legal operating entity and merchant-of-record structure | Determines who is contractually selling the excursion and who carries refund/chargeback liability | Treating the platform as MoR in the data model; `bookings` carries vendor and platform amounts separately so either model fits | Live Stripe account |
| OD-02 | Stripe Connect at launch, or manual settlement during pilot | Changes payout code, vendor onboarding (KYC), and cash flow | Connect-ready abstraction (AD-09); `stripe_account_id` column exists and stays null | First real vendor payout |
| OD-03 | Final subscription tiers and booking commission model | PRD gives a USD 65–161/mo range and requires config-driven fees | `platform_settings` holds rates; seed uses placeholder tiers clearly marked demo | Vendor contracts |
| OD-04 | Jamaica privacy notice, geolocation consent language, cancellation rules, vendor verification standard | Legal text and policy thresholds; geolocation consent wording is regulated | Placeholder copy marked `TODO-LEGAL`; consent *mechanism* is built correctly regardless of wording | Public launch |
| OD-05 | Maps provider and notification provider | Cost and deployment environment | Adapter interfaces with mock implementations (AD-07); either provider swaps by env var | Staging with real maps |
| OD-06 | Native app-store launch vs Expo-managed pilot distribution | Changes build pipeline, review timeline and update cadence | Expo managed workflow, which supports both paths | Distribution decision |

## Surfaced during architecture

| ID | Question | Recommendation | Impact if changed later |
|---|---|---|---|
| OD-07 | Does a geofenced offer voucher require a paid booking, or can it stand alone? | PRD §9 implies both (T-08 saves without booking; Journey B step 6 links to a booking). Modelled as a `promotions.requires_booking` flag so both exist. | None — already configurable |
| OD-08 | Refund authority: vendor, admin, or both? | Admin only at MVP (PRD §7 puts refund state in admin booking operations; §6 does not give vendors refunds). | Small — a vendor-web screen and a policy change |
| OD-09 | Currency display vs settlement currency | Display in the island's currency per PRD §3; **settle in USD** so Stripe and commission maths stay single-currency at MVP. FX display rate is informational and labelled as such. | Significant if changed after M3 — multi-currency settlement touches every money column |

OD-09 is the one worth a decision before M3, because reversing it later is expensive. The
recommendation is the simplest option that satisfies PRD §3's "currency display" wording without
committing to multi-currency settlement.
