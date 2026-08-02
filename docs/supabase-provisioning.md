# Provisioning the Supabase project

One-time setup, done by a human because it involves creating an account and handling secrets.
Everything after step 4 is automated.

**Why now rather than at deployment.** Three things are currently unproven because there has never
been a real instance: Storage bucket policies, real Supabase Auth behaviour, and the PostgREST
embedded-select syntax the experience detail page uses. Each additional milestone built without a
real backend adds to that pile. Doing this before M3 means the payment flow is built against
reality rather than against a harness.

---

## 1. Create the project

At [supabase.com](https://supabase.com) → **New project**.

| Setting | Value |
|---|---|
| Name | `caribbean-vip-staging` |
| Region | `us-east-1` (closest to Jamaica of the available regions) |
| Database password | Generate a strong one and store it in a password manager |
| Plan | Free is sufficient for M3–M8 |

The free tier pauses after a week of inactivity and resumes on the next request — fine for
development, and worth knowing before someone reports "the app is broken" on a Monday.

## 2. Apply the schema

**Settings → Database → Connection string → URI.** Copy it, then from the repository root:

```bash
./scripts/db-push.sh "postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
```

That applies every migration in order and then the Jamaica seed. It refuses to run against a
database that already has tables, so it cannot silently half-apply over an existing schema.

If you would rather not put the password on a command line, paste each file from
`supabase/migrations/` into the SQL editor in filename order, then `supabase/seed/seed.sql`.

## 3. Collect the keys

**Settings → API.** Two values matter, and the difference between them is the whole security model:

| Key | Where it goes | Sensitivity |
|---|---|---|
| Project URL | every app's `.env` | public |
| `anon` / publishable key | every app's `.env` | **public by design** — it ships inside the app bundle and RLS is what protects the data behind it |
| `service_role` key | **nowhere yet** | **secret** — it bypasses every RLS policy. Needed only when Edge Functions are deployed in M3. |

Do not paste the `service_role` key into a chat, a ticket, or a file that is not `.env`. If it ever
leaks, rotate it in **Settings → API → Generate new key**.

## 4. Configure the apps

```bash
cp apps/mobile/.env.example apps/mobile/.env && cp apps/vendor-web/.env.example apps/vendor-web/.env && cp apps/admin-web/.env.example apps/admin-web/.env
```

Fill in the URL and anon key in each. The `EXPO_PUBLIC_` and `NEXT_PUBLIC_` prefixes are load-
bearing: anything carrying them is compiled into the client bundle, which is why no secret may ever
use one. `pnpm test` asserts that the client env schema contains no secret-shaped key names.

## 5. Create the first admin

`profiles.role` defaults to `tourist` and cannot be self-assigned — a trigger rejects any role
change made by anyone but a super admin, which is what stops a tourist promoting themselves into
the admin console.

So the first one is set from the SQL editor, where there is no end-user context:

1. Register through the vendor portal or the mobile app with the address that should be the admin.
2. **SQL editor**, then:

```sql
update profiles set role = 'super_admin'
where id = (select id from auth.users where email = 'you@example.com');
```

## 6. Verify

```bash
pnpm vendor
```

Sign in with that account. A correctly configured project shows the vendor portal's "no vendor
organization yet" state rather than "no backend configured" — proving Auth, RLS and the anon key
are all working together.

---

## What this unblocks

| Currently unverified | Verified once the project exists |
|---|---|
| Storage bucket policies (the storage migration no-ops outside Supabase) | Private `vendor-documents` bucket rejects a cross-vendor read |
| Real Supabase Auth (the test harness stubs `auth.users` and `auth.uid()`) | Signup trigger creates a profile; JWT claims drive RLS |
| PostgREST embedded-select syntax in `loadExperience()` | The experience detail page returns real nested data |
| Stripe webhook delivery to a deployed endpoint | M3 end-to-end payment |

## Later: production

Staging and production should be **separate projects**, not separate schemas. A shared project
means a migration mistake reaches real customer data. Production also needs its own
`VOUCHER_HMAC_SECRET` — reusing staging's would let a staging voucher be redeemed in production.
