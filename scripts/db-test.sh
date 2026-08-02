#!/usr/bin/env bash
#
# Verify the migrations apply cleanly to a FRESH database, then run the SQL test suite.
#
# Uses a plain PostgreSQL instance plus supabase/tests/_harness.sql rather than `supabase start`,
# so this runs without Docker and works unchanged in CI. See the harness file for what it does
# and does not stand in for.
#
# Usage:  ./scripts/db-test.sh [--keep]
#   --keep   leave the test database in place for inspection afterwards

set -euo pipefail

DB_NAME="${CVIP_TEST_DB:-caribbean_vip_test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEEP=0
[[ "${1:-}" == "--keep" ]] && KEEP=1

export PGOPTIONS='--client-min-messages=warning'
PSQL=(psql --quiet --no-psqlrc -v ON_ERROR_STOP=1)

echo "==> Dropping and recreating $DB_NAME (fresh-database requirement)"
dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"

echo "==> Installing local Supabase harness"
"${PSQL[@]}" -d "$DB_NAME" -f "$ROOT/supabase/tests/_harness.sql" >/dev/null

echo "==> Applying migrations in order"
for f in "$ROOT"/supabase/migrations/*.sql; do
  printf '    %s\n' "$(basename "$f")"
  "${PSQL[@]}" -d "$DB_NAME" -f "$f" >/dev/null
done

echo "==> Seeding Jamaica demo content"
"${PSQL[@]}" -d "$DB_NAME" -f "$ROOT/supabase/seed/seed.sql" >/dev/null

echo "==> Running tests"
FAILED=0
for f in "$ROOT"/supabase/tests/*.test.sql; do
  name="$(basename "$f")"
  if out=$("${PSQL[@]}" -d "$DB_NAME" -f "$f" 2>&1); then
    printf '    \033[32mPASS\033[0m  %s\n' "$name"
  else
    printf '    \033[31mFAIL\033[0m  %s\n' "$name"
    echo "$out" | sed 's/^/          /'
    FAILED=1
  fi
done

if [[ $KEEP -eq 0 ]]; then
  dropdb --if-exists "$DB_NAME"
else
  echo "==> Kept database $DB_NAME"
fi

if [[ $FAILED -ne 0 ]]; then
  echo "==> FAILED"
  exit 1
fi

echo "==> All database tests passed"
