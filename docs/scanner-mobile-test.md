# First live scanner test, on a phone

Proves what the database harness cannot: Auth, JWT to `auth.uid()`, PostgREST finding
`redeem_voucher(p_token, p_vendor_org_id)`, and the camera on a real mobile browser.

Staging only. The demo scanner is untouched and must still work afterwards.

## Before you start

1. PR #7 merged and its CI green (`gh pr checks 7`).
2. Staging project `xtyuvtlnfougbjadkull` has every migration applied, including
   `20261019*` and `20261020*`. `scripts/db-push.sh` refuses a non-empty database, so apply the
   missing files in filename order from the SQL editor, or with `supabase db push`.
3. Auth settings: email provider on, and the vendor portal URL in **Auth, URL configuration,
   Redirect URLs**. Without it the magic link lands on the wrong host.
4. The vendor portal is deployed (Vercel preview of `apps/vendor-web`) with
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set to staging. The phone cannot
   reach `localhost`.
5. A real inbox you can open on the phone.

## Seed

Secrets go in the shell, never in a file. Paste the service role key and HMAC secret from the
Supabase dashboard (**Settings, API** and **Edge Functions, Secrets**).

Use `read -rs` so the secrets never enter shell history:

```bash
export SUPABASE_URL="https://xtyuvtlnfougbjadkull.supabase.co"
read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY
read -rs VOUCHER_HMAC_SECRET && export VOUCHER_HMAC_SECRET
export SCANNER_EMAIL="you+scanner@example.com"
export SCANNER_NOPERM_EMAIL="you+noperm@example.com"
pnpm scanner:seed
```

The script only runs against the allowlisted staging host, and refuses if either email already
belongs to a vendor member with a different role or permission. Use fresh addresses (a `+tag`
works). Check both addresses for typos: the account is created for whatever you type.

It creates the accounts (no passwords), grants `can_scan_vouchers` at
`[Demo] Negril Sunset Cruises`, and writes five QR codes to
`apps/tourist-web/scanner-test-out/index.html`. Open that page on a laptop.

The seeded QR codes redeem whatever `VOUCHER_HMAC_SECRET` is, because the database never checks
the signature: it looks up `sha256(token)`, and the script stores the hash of the exact token it
signed. The secret must equal the Edge Functions' value only when you later test vouchers the app
itself issues, since those are signed by the deployed function.

## Run on the phone

| # | Do | Pass when |
|---|---|---|
| 1 | Open the vendor portal on the phone, sign in as `SCANNER_EMAIL` via the magic link | Lands signed in, active organisation is Negril Sunset Cruises |
| 2 | Open Scan, allow the camera | Camera preview shows. No "who is scanning" box |
| 3 | Scan QR 1 | `ok` |
| 4 | Scan QR 2, then QR 2 again | `ok`, then `already_redeemed` with the first scan time and name |
| 5 | Scan QR 3 | `expired` |
| 6 | Scan QR 4 | `wrong_vendor` |
| 7 | Scan QR 5 | `unknown_token` |
| 8 | Sign out. Sign in as `SCANNER_NOPERM_EMAIL` | Scanner withholds itself. No camera |
| 9 | Reload the page mid-scan and rotate the phone | Scanner recovers and does not double-fire |

## Confirm in the database

```sql
select result, count(*) from voucher_redemptions
 where scanned_at > now() - interval '1 hour' group by result;
```

Run it after a single clean pass. A rerun or a repeat scan changes the counts. Expect `ok` 2, `already_redeemed` 1, `expired` 1, `wrong_vendor` 1, `unknown_token` 1. Check that
`redeemed_by` on the burned vouchers equals the scanner's `auth.users.id`, not a typed name.

## If it fails

| Symptom | Likely cause |
|---|---|
| `PGRST202` | Migration `20261020000003` not applied to staging |
| Every QR is `unknown_token` | Scanning an app-issued voucher signed with a different `VOUCHER_HMAC_SECRET`, or a QR read with extra characters |
| Permission error on a user who should scan | No `vendor_members` row, or `can_scan_vouchers` false |
| Magic link opens `localhost` | Redirect URL or site URL not set in Auth settings |
| Camera never starts | Page not served over HTTPS, or permission denied in the browser |

## Afterwards

The script prints the guest user id, the booking ids, and a cleanup SQL block. Run that in the SQL
editor, then delete `apps/tourist-web/scanner-test-out/`, since four of its QR codes are working
staging vouchers. Unset the shell variables (`unset SUPABASE_SERVICE_ROLE_KEY VOUCHER_HMAC_SECRET`).
Because the key was typed with `read -rs`, it is not in history, so nothing needs rotating.
