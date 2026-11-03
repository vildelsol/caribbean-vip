# Redemption anomalies: proposed rule (OD-10)

PROPOSAL. Nothing here is built. Ro picks the numbers; then one SQL view and one dashboard tile.

## Data we already have
`voucher_redemptions`: one row per scan, ok or not, with scanner, vendor, result, time and device
metadata. Unknown tokens are logged too. Append-only. An index already serves "recent non-ok scans".

## Proposed anomalies
Each is counted per scanner (or voucher) over a rolling window. Defaults are starting points to tune
against pilot data, and live in `platform_settings`, not in code.

| # | pattern | default | what it may mean |
|---|---|---|---|
| A | one scanner, `unknown_token` scans | 10 in 1 hour | someone guessing or forging QR codes |
| B | one scanner, `wrong_vendor` scans | 3 in 24 hours | scanning another vendor's vouchers, or a mix-up at the door |
| C | one voucher, `already_redeemed` scans | 3 total | a screenshot being shared, or a reused QR |
| D | one scanner, `ok` scans | 10 in 1 minute | scanning without guests present |
| E | one vendor, non-ok share of scans | over 30% of at least 20 in 7 days | a vendor with a process or fraud problem |

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

## Decisions for Ro
1. Keep, drop or change each of A to E.
2. The default numbers.
3. Who reviews flags (admin only, as with refunds in OD-08)?
