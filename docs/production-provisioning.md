# Production provisioning checklist

Staging is `fsnkzpxgrckfifmhwsff`. Production is a **separate Supabase project**, never a schema in
staging. Humans do steps marked **[Ro]** (accounts, secrets, money). Everything else is scripted.
Tick each box only after you have seen the result, not after you have run the command.

## Hard rules

- **Never run `scripts/db-push.sh` against production.** It loads `supabase/seed/seed.sql`, which is
  demo content (`is_demo = true`, `[Demo]` vendors, invented prices). Production gets migrations only.
- **Never reuse a staging secret.** Production needs its own `VOUCHER_HMAC_SECRET`; a reused one lets
  a staging voucher redeem in production. Same for Stripe: live keys and a live webhook endpoint.
- **Never paste the `service_role` key or the database password into chat, a ticket or a file.**
- Apply a migration to production **before** shipping the client that calls it.

## 1. Gates before any production step

- [ ] Counsel confirmed the open items in `docs/open-decisions.md` that block live data (retention 7y,
      consent proof, transfers, registration). **[Ro]**
- [ ] DPA signed or confirmed for Supabase, Stripe, Vercel (`docs/privacy/processor-record.md`). **[Ro]**
- [ ] Backup facts filled in (`docs/privacy/backup-restore-runbook.md`: plan, frequency, PITR, region). **[Ro]**
- [ ] Breach contacts filled in (`docs/privacy/breach-runbook.md`). **[Ro]**
- [ ] CI `verify` and `database` green on `main`.

## 2. Create the project **[Ro]**

- [ ] Supabase → New project, name `caribbean-vip-production`, region as decided in the DPIA.
- [ ] Plan that includes backups and, ideally, point-in-time recovery. The free tier pauses; production must not.
- [ ] Enable the `pg_cron` extension (Database → Extensions). The purge migration is a no-op without it,
      and retention then never runs.
- [ ] Store the database password in a password manager.

## 3. Apply the schema by CI

- [ ] GitHub → Settings → Environments → `production`: add **required reviewers**, restrict to `main`.
- [ ] Add environment secret `PRODUCTION_DB_URL` (Supabase connection string, session pooler). **[Ro]**
- [ ] Run workflow **Migrate production** with `dry_run` on. Confirm the list is every migration in
      `supabase/migrations/` and nothing else.
- [ ] Run it again with `dry_run` off. The CLI records each migration in its ledger, so later runs
      apply only new files.
- [ ] Verify against production (read-only SQL):
  - `select count(*) from pg_tables where schemaname='public' and not rowsecurity` returns 0.
  - `select count(*) from experiences` returns 0. A non-zero count means the demo seed ran: stop.
  - `select jobname from cron.job` lists `cvip-purge-short-lived` and `cvip-purge-expired`.

## 4. Edge Functions

- [ ] Set secrets in Supabase → Edge Functions → Secrets **[Ro]**: `STRIPE_SECRET_KEY` (live),
      `STRIPE_WEBHOOK_SECRET` (live endpoint), `VOUCHER_HMAC_SECRET` (new, random, 32 bytes or more),
      `APP_URL` (production tourist URL, `https` only).
- [ ] `./scripts/deploy-functions.sh <production-ref>`. It sets `--import-map` and, for `stripe-webhook`
      only, `--no-verify-jwt`. Confirm all nine functions show as deployed.
- [ ] Stripe → Developers → Webhooks: add the production `stripe-webhook` URL, event
      `checkout.session.completed`. **[Ro]**
- [ ] CORS: confirm `apikey` is in Allow-Headers by calling a function from the production origin.

## 5. Apps (Vercel)

- [ ] Separate Vercel projects or environment scopes for production tourist, vendor and admin. Do not
      point production at the staging project.
- [ ] Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon key only) per app.
- [ ] Deploy and open each app. Check the browser console for CSP errors; admin has never run under CSP.
- [ ] The tourist app must be in **live mode**, not demo mode. The demo deploy stays on its own URL.

## 6. First admin **[Ro]**

- [ ] Register with the admin address, then run the `update profiles set role = 'super_admin'` statement
      from `docs/supabase-provisioning.md` step 5 in the SQL editor.
- [ ] Sign in to admin. Confirm a tourist account cannot reach admin screens.

## 7. Prove it end to end **[Ro]**

- [ ] Live Stripe card payment for the smallest real amount, voucher issued, scanner redeems it, refund it.
- [ ] Erasure and account removal on a throwaway account (`erase-processors`, `delete-my-account`).
- [ ] Restore drill into a scratch project (`docs/privacy/backup-restore-runbook.md`).

## 8. Monitoring

The rules live as data in `packages/types/src/monitoringPort.ts` (`ALERT_RULES`). A test fails if
this list and that one disagree, so neither becomes the stale copy. Each line below is a rule id.

- [ ] `edge-function-failures` — any non-2xx from a deployed function over 5 minutes. **page**
- [ ] `stripe-webhook-errors` — `stripe-webhook` returns non-2xx; Stripe retries, then gives up and
      the booking never confirms. **page**
- [ ] `bookings-stuck-pending` — a booking in `pending_payment` over 30 minutes; the guest may have
      been charged. **page**
- [ ] `retention-purge-missed` — no `audit_logs where action like 'retention.%'` for 8 days, so the
      weekly `pg_cron` job is dead or `pg_cron` was never enabled. **warn**

- [ ] The monitoring tool sits behind `MonitoringPort`, like every other outside tool. Until one is
      chosen the adapter is `createNullMonitoringPort()`, which sends nowhere.
- [ ] Add its row to `docs/privacy/processor-record.md` **before** it receives anything, and set its
      `region` on the port. **[Ro]**
- [ ] Alerts carry counts and opaque references only; `emitAlert` refuses anything else. Do not add a
      free-text field to get a guest's name into an alert — use the booking reference and the admin console.
