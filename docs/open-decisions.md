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

## Leaning, not decided

**OD-01 (recorded 2026-11-14). Leaning: marketplace, the platform is an intermediary and the vendor
is the seller and merchant of record. PENDING COUNSEL on every island. Not a decision.**

Ro's description of the business is a marketplace, which points to the platform as intermediary. That
only holds if the facts match: the vendor sets price and terms, is named to the guest as the seller,
and is paid directly, with the platform's commission taken at the split. If it were chosen:

- **Stripe Connect becomes the OD-02 answer**, not manual settlement. Manual settlement collects
  every guest payment into one platform account, which is how a seller behaves, and contradicts the
  intermediary position.
- `stripeProvider.ts` gains a destination account and an application fee (AD-09 says only that file
  changes). `vendors.stripe_account_id`, null today, must be set before a listing can sell.
- Vendor onboarding adds Connect KYC to the document checks.
- Refund authority (OD-08, admin only today) must follow whoever carries the liability.
- Checkout and terms name the vendor as seller and the platform as intermediary; the vendor agreement
  becomes a marketplace or agency agreement rather than a supplier agreement.
- No payout ledger is needed, because Stripe splits at charge time.

**Open risk before this can be chosen:** whether Stripe Connect can pay vendors in Jamaica, Barbados
and Cayman. A 2026-11-14 search found Jamaica listed as supported in some sources, Barbados listed as
unsupported in one and conflicting in others, and nothing on Cayman. None of those was Stripe's own
Connect country list. Check Stripe's cross-border payout documentation or Stripe support before
relying on any of it. If Connect cannot reach a vendor's country, the intermediary model needs a
different payment route, and that is a counsel question too.

**For counsel (also `vendor-document-requirements.md`):** is the platform an intermediary or the
seller on each island, who is merchant of record, what must be disclosed to the guest, and does the
platform risk being treated as the seller anyway if it sets cancellation terms or issues refunds itself.

## Surfaced during architecture

| ID | Question | Recommendation | Impact if changed later |
|---|---|---|---|
| OD-07 | Does a geofenced offer voucher require a paid booking, or can it stand alone? | PRD §9 implies both (T-08 saves without booking; Journey B step 6 links to a booking). Modelled as a `promotions.requires_booking` flag so both exist. | None — already configurable |
| OD-08 | Refund authority: vendor, admin, or both? | Admin only at MVP (PRD §7 puts refund state in admin booking operations; §6 does not give vendors refunds). | Small — a vendor-web screen and a policy change |
| OD-09 | Currency display vs settlement currency | **RESOLVED 2026-08-02: display localized, settle in USD.** Prices may be shown in the island's currency as an informational conversion, clearly labelled; every booking, payment and payout is denominated in USD. | Was significant; now locked before M3, which is the point at which it becomes expensive |
| OD-10 | What counts as a redemption anomaly on the admin dashboard? | PRD §7 lists the tile; nothing defines it, so the dashboard shows none rather than a guessed rule. **DECIDED 2026-11-03 and built:** see `docs/redemption-anomalies.md`. | Done; thresholds tunable in `platform_settings` | Before real vendors scan |

## Resolved

| ID | Decision | Resolved | Consequence |
|---|---|---|---|
| OD-09 | Display localized, settle in USD | 2026-08-02 | `platform_settings['pricing.settlement_currency']` is `USD`. Every `*_minor` column on `bookings` and `payments` is USD. An island's currency is a display concern only, and the conversion is labelled as indicative — never presented as the amount charged. Multi-currency settlement would now require a migration touching every monetary column, plus per-currency Stripe configuration. |

## Escalated earlier than originally filed

**OD-02 (Stripe Connect at launch, or manual settlement during pilot) is now due before M4, not
before the first payout.** If Connect is used at launch, vendor onboarding must embed the Connect
account-link and KYC flow — that is a material scope difference in the milestone that builds
onboarding, and discovering it mid-M4 would mean rebuilding the flow. The build proceeds
Connect-ready either way (AD-09), but the M4 onboarding UI cannot be finished without the answer.
