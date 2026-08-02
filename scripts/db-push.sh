#!/usr/bin/env bash
#
# Apply every migration in order, then the Jamaica seed, to a remote Supabase database.
#
#   ./scripts/db-push.sh "postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"
#
# Refuses to run against a database that already has application tables, so it cannot half-apply
# over an existing schema. To re-run against a project that has already been provisioned, reset it
# from the Supabase dashboard first (Settings → General → Reset database).
#
# The connection string contains the database password. Prefer passing it via the environment:
#   CVIP_DB_URL="postgresql://..." ./scripts/db-push.sh
# so it does not land in your shell history.

set -euo pipefail

DB_URL="${1:-${CVIP_DB_URL:-}}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "$DB_URL" ]]; then
  echo "Usage: $0 <postgres-connection-string>" >&2
  echo "   or: CVIP_DB_URL=<connection-string> $0" >&2
  exit 64
fi

export PGOPTIONS='--client-min-messages=warning'
PSQL=(psql --quiet --no-psqlrc -v ON_ERROR_STOP=1 "$DB_URL")

echo "==> Checking the target database is empty"
EXISTING=$("${PSQL[@]}" -t -A -c "
  select count(*) from pg_tables
   where schemaname = 'public' and tablename in ('experiences', 'bookings', 'vouchers');
")

if [[ "$EXISTING" != "0" ]]; then
  echo "" >&2
  echo "Refusing to run: this database already has Caribbean VIP tables." >&2
  echo "Applying migrations over an existing schema would half-apply and leave it inconsistent." >&2
  echo "Reset the database from the Supabase dashboard first, or apply new migrations by hand." >&2
  exit 1
fi

echo "==> Applying migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  printf '    %s\n' "$(basename "$f")"
  "${PSQL[@]}" -f "$f" >/dev/null
done

echo "==> Seeding Jamaica demo content"
"${PSQL[@]}" -f "$ROOT/supabase/seed/seed.sql" >/dev/null

echo "==> Verifying"
"${PSQL[@]}" -t -A -c "
  select 'tables: ' || count(*) from pg_tables where schemaname = 'public';
"
"${PSQL[@]}" -t -A -c "
  select 'rls disabled on: ' || coalesce(string_agg(c.relname, ', '), 'nothing (good)')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
"
"${PSQL[@]}" -t -A -c "select 'approved listings: ' || count(*) from experiences where status = 'approved';"
"${PSQL[@]}" -t -A -c "select 'destinations: ' || count(*) from destinations;"

echo "==> Done. Next: docs/supabase-provisioning.md step 3 (collect the keys)."
