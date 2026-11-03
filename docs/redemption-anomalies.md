# Redemption anomalies: proposed rule (OD-10)

**Decided 2026-11-03 (Ro, on Claude's recommendation). Built:** migration `20261103000004`, test `supabase/tests/redemption_anomalies.test.sql`, dashboard tile in admin-web. Pattern E was dropped for the pilot (too few scans for a share to mean anything); revisit with real volume.

## Data we already have
`voucher_redemptions`: one row per scan, ok or not, with scanner, vendor, result, time and device
metadata. Unknown tokens are logged too. Append-only. An index already serves "recent non-ok scans".

## Proposed anomalies
Each is counted per scanner (or voucher) over a rolling window. Defaults are starting points to tune
against pilot data, and live in `platform_settings` (`redemption.anomaly_thresholds`), not in code.

| # | pattern | default | what it may mean |
|---|---|---|---|
| A | one scanner, `unknown_token` scans | 10 in 1 hour | someone guessing or forging QR codes |
| B | one scanner, `wrong_vendor` scans | 3 in 24 hours | scanning another vendor's vouchers, or a mix-up at the door |
| C | one voucher, `already_redeemed` scans | 2 in 7 days | a screenshot being shared, or a reused QR |
| D | one scanner, `ok` scans | 20 in 1 minute | scanning without guests present (a boat check-in can be 10+, so 20) |

An anomaly is a flag for a person to look at, not a block. It never changes a redemption result.

## Not flagged
- `expired`, `not_yet_valid`, `cancelled`: ordinary guest mistakes on their own.
- `booking_not_paid`: a payment state, shown in booking operations.

## What the tile shows
Count of open flags in the last 7 days, linking to a list: pattern, scanner, vendor, count, first and
last time. A flag with no new scans for 7 days closes itself. A person can mark one reviewed.

## Privacy
Scanner and device fields are personal data about vendor staff (`data-inventory.md`, row
`voucher_redemptions`, basis: legitimate interest). Flags reuse those rows and add no new personal
data. Retention follows that row **[COUNSEL]**. Tell vendor staff in the vendor terms that scans are
logged and reviewed.

## Safeguards built in
Each is proven by deleting it and watching a test fail.

- **Admin only.** `redemption_anomalies()` refuses tourists, vendor staff and anon; revoked from public and anon.
- **Thresholds cannot switch a pattern off.** A trigger rejects a value that is missing, fractional, text, below 1 or above a hard ceiling (A 50, B 20, C 10, D 100). Only super admin can write the setting.
- **A bad stored value tightens or loosens nothing.** The reader falls back to the default for each invalid value, and for a deleted setting.
- **Cannot be erased by the scanner.** Flags are computed from `voucher_redemptions`, which is append-only and logs every failure.
- **A failed check never reads as zero.** The dashboard shows "did not run" with the error, not 0.
- **Rolling windows, not totals.** Ten unknown tokens over ten hours do not flag; ten inside an hour do.

## Not built
Marking a flag reviewed. It needs a table (and a `data-inventory.md` row), so it is a separate change. Until then flags close by themselves after 7 days with no new scans.

## Decisions settled
Reviewer: admin only, as with refunds in OD-08. Thresholds: A 10 per hour, B 3 per day, C 2 per voucher, D 20 per minute.
