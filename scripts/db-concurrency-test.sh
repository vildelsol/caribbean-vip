#!/usr/bin/env bash
#
# Concurrency tests for the two functions where a race costs money.
#
# These cannot live in the SQL suite: a single psql connection cannot race itself, and a
# sequential test passes happily against an implementation with no row lock at all. Here N real
# background connections hit the same row simultaneously and we count the winners.
#
#   V-03  N checkouts for the last seat  -> exactly 1 succeeds, booked_count never exceeds capacity
#   V-05  N simultaneous scans           -> exactly 1 'ok', the rest 'already_redeemed'
#
# Assumes the database built by db-test.sh --keep, or builds its own.

set -euo pipefail

DB_NAME="${CVIP_TEST_DB:-caribbean_vip_concurrency}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKERS="${CVIP_CONCURRENCY:-16}"

export PGOPTIONS='--client-min-messages=warning'
PSQL=(psql --quiet --no-psqlrc -v ON_ERROR_STOP=1 -t -A)

echo "==> Building $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"
"${PSQL[@]}" -d "$DB_NAME" -f "$ROOT/supabase/tests/_harness.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -d "$DB_NAME" -f "$f" >/dev/null
done
"${PSQL[@]}" -d "$DB_NAME" -f "$ROOT/supabase/seed/seed.sql" >/dev/null

FAILED=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---------------------------------------------------------------------------
# V-03 — the last seat
# ---------------------------------------------------------------------------

echo "==> V-03: $WORKERS concurrent reservations for a single remaining seat"

SLOT_ID=$("${PSQL[@]}" -d "$DB_NAME" -c "
  insert into availability_slots (experience_id, starts_at, ends_at, capacity)
  select e.id, now() + interval '500 days', now() + interval '500 days 2 hours', 1
  from experiences e where e.title = 'Catamaran Snorkel & Sunset'
  returning id;
")

for i in $(seq 1 "$WORKERS"); do
  (
    # A short random delay widens the window in which the workers genuinely overlap.
    perl -e 'select undef, undef, undef, rand(0.05)'
    psql --quiet --no-psqlrc -t -A -d "$DB_NAME" \
      -c "select reserve_availability('$SLOT_ID', 1);" > "$TMP/seat.$i" 2>/dev/null || echo "error" > "$TMP/seat.$i"
  ) &
done
wait

WON=$(grep -lx "t" "$TMP"/seat.* 2>/dev/null | wc -l | tr -d ' ')
BOOKED=$("${PSQL[@]}" -d "$DB_NAME" -c "select booked_count from availability_slots where id = '$SLOT_ID';")

if [[ "$WON" == "1" && "$BOOKED" == "1" ]]; then
  printf '    \033[32mPASS\033[0m  exactly 1 of %s reservations won; booked_count = 1\n' "$WORKERS"
else
  printf '    \033[31mFAIL\033[0m  %s winners (expected 1), booked_count = %s (expected 1)\n' "$WON" "$BOOKED"
  FAILED=1
fi

# ---------------------------------------------------------------------------
# Promotions — the last unit of inventory
# ---------------------------------------------------------------------------

echo "==> P-01: $WORKERS concurrent claims for a promotion with one unit left"

PROMO_ID=$("${PSQL[@]}" -d "$DB_NAME" -c "
  insert into promotions (vendor_org_id, island_id, title, terms, value_kind,
                          starts_at, ends_at, inventory_limit, approval_state)
  select o.id, o.island_id, 'Race promo', 'T', 'in_kind',
         now() - interval '1 day', now() + interval '5 days', 1, 'approved'
    from vendor_organizations o where o.trading_name = '[Demo] Negril Sunset Cruises'
  returning id;
")

for i in $(seq 1 "$WORKERS"); do
  U=$("${PSQL[@]}" -d "$DB_NAME" -c "insert into auth.users (email) values ('race-claim-$i@test.local') returning id;")
  (
    perl -e 'select undef, undef, undef, rand(0.01)'
    # The transaction is held open for 0.3s after the claim. The function alone finishes in well
    # under a millisecond, too fast for the workers to overlap, and a test that never overlaps
    # passes against an implementation with no row lock at all.
    psql --quiet --no-psqlrc -t -A -v ON_ERROR_STOP=1 -d "$DB_NAME" > "$TMP/claim.$i" 2>/dev/null <<SQL || echo "error" > "$TMP/claim.$i"
begin;
select outcome from claim_promotion_voucher('$PROMO_ID', '$U', 'race-claim-hash-$i', now() + interval '3 days');
select pg_sleep(0.3);
commit;
SQL
  ) &
done
wait

CLAIMED=$(grep -lx "claimed" "$TMP"/claim.* 2>/dev/null | wc -l | tr -d ' ')
SOLD_OUT=$(grep -lx "sold_out" "$TMP"/claim.* 2>/dev/null | wc -l | tr -d ' ')
ISSUED=$("${PSQL[@]}" -d "$DB_NAME" -c "select issued_count from promotions where id = '$PROMO_ID';")
VOUCHERS=$("${PSQL[@]}" -d "$DB_NAME" -c "select count(*) from vouchers where promotion_id = '$PROMO_ID';")

# The table's own check would also stop an oversell, but by raising: the losers must be told
# 'sold_out', which only happens if the row lock made them wait and re-read the count.
if [[ "$CLAIMED" == "1" && "$SOLD_OUT" == "$((WORKERS - 1))" && "$ISSUED" == "1" && "$VOUCHERS" == "1" ]]; then
  printf '    \033[32mPASS\033[0m  exactly 1 of %s claims won, the rest sold_out; issued_count = 1, 1 voucher\n' "$WORKERS"
else
  printf '    \033[31mFAIL\033[0m  %s winners, %s sold_out, issued_count = %s, vouchers = %s (expected 1, %s, 1, 1)\n' "$CLAIMED" "$SOLD_OUT" "$ISSUED" "$VOUCHERS" "$((WORKERS - 1))"
  FAILED=1
fi

# ---------------------------------------------------------------------------
# V-05 — simultaneous scans of one voucher
# ---------------------------------------------------------------------------

echo "==> V-05: $WORKERS concurrent scans of the same valid voucher"

read -r ORG_ID SCANNER_ID <<<"$("${PSQL[@]}" -d "$DB_NAME" -F' ' -c "
  with u as (
    insert into auth.users (email) values ('race-scanner@test.local') returning id
  ), o as (
    select id from vendor_organizations where trading_name = '[Demo] Negril Sunset Cruises'
  ), m as (
    insert into vendor_members (vendor_org_id, user_id, role)
    select o.id, u.id, 'vendor_staff' from o, u returning vendor_org_id, user_id
  )
  select vendor_org_id, user_id from m;
")"

"${PSQL[@]}" -d "$DB_NAME" -c "
  insert into vouchers (token_hash, vendor_org_id, promotion_id, state, valid_until)
  select 'race-hash', '$ORG_ID', p.id, 'active', now() + interval '5 days'
  from promotions p limit 1;
" >/dev/null

for i in $(seq 1 "$WORKERS"); do
  (
    perl -e 'select undef, undef, undef, rand(0.05)'
    psql --quiet --no-psqlrc -t -A -d "$DB_NAME" \
      -c "select result from redeem_voucher_by_hash('race-hash', '$ORG_ID', '$SCANNER_ID');" \
      > "$TMP/scan.$i" 2>/dev/null || echo "error" > "$TMP/scan.$i"
  ) &
done
wait

OK_COUNT=$(grep -lx "ok" "$TMP"/scan.* 2>/dev/null | wc -l | tr -d ' ')
DUP_COUNT=$(grep -lx "already_redeemed" "$TMP"/scan.* 2>/dev/null | wc -l | tr -d ' ')
RECORDED=$("${PSQL[@]}" -d "$DB_NAME" -c "select count(*) from voucher_redemptions where token_hash = 'race-hash';")

if [[ "$OK_COUNT" == "1" && "$DUP_COUNT" == "$((WORKERS - 1))" ]]; then
  printf '    \033[32mPASS\033[0m  exactly 1 redemption succeeded; %s rejected as already_redeemed\n' "$DUP_COUNT"
else
  printf '    \033[31mFAIL\033[0m  %s succeeded (expected 1), %s already_redeemed (expected %s)\n' \
    "$OK_COUNT" "$DUP_COUNT" "$((WORKERS - 1))"
  FAILED=1
fi

if [[ "$RECORDED" == "$WORKERS" ]]; then
  printf '    \033[32mPASS\033[0m  all %s scan attempts recorded in voucher_redemptions\n' "$WORKERS"
else
  printf '    \033[31mFAIL\033[0m  %s scans recorded (expected %s)\n' "$RECORDED" "$WORKERS"
  FAILED=1
fi

dropdb --if-exists "$DB_NAME"

if [[ $FAILED -ne 0 ]]; then
  echo "==> FAILED"
  exit 1
fi

echo "==> Concurrency tests passed"
