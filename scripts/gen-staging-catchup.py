#!/usr/bin/env python3
"""Regenerate docs/staging-catchup.sql from the migration files.

Staging (xtyuvtlnfougbjadkull) was provisioned with scripts/db-push.sh, which runs psql directly
and leaves no migration ledger. So the only way to know what it has is to look at the schema, and
the only way to catch it up is to replay the migrations it is missing, by hand, one at a time.

This script builds that document: a probe that reports applied/missing per migration, then each
migration's SQL verbatim, wrapped in its own transaction. The migration bodies are never edited —
copying them by hand is how a catch-up script drifts from what the repo actually applies.

    python3 scripts/gen-staging-catchup.py           # write docs/staging-catchup.sql
    python3 scripts/gen-staging-catchup.py --check    # exit 1 if the file is out of date
    python3 scripts/gen-staging-catchup.py --probe    # print PART 0 only, to pipe into psql

A migration with no entry in PROBES below is a hard error: every part must be probeable, or the
operator cannot tell which parts to run.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / "supabase" / "migrations"
OUT = ROOT / "docs" / "staging-catchup.sql"

# Staging was last confirmed in sync on 2026-09-21. Everything after it is a candidate.
FIRST = "20260922"

# migration stem -> a SQL expression returning 'applied' or 'missing'. Each probe looks at the
# schema itself, never at a ledger. Keep them cheap and read-only.
PROBES = {
    "20260923000001_island_greeting": """
       case when exists (select 1 from information_schema.columns
              where table_name='islands' and column_name='greeting') then 'applied' else 'missing' end""",
    "20261014000001_listing_text_limits": """
       case when exists (select 1 from pg_constraint where conname='experiences_title_length')
            then 'applied' else 'missing' end""",
    "20261019000001_listings_rls_can_manage": """
       case when exists (select 1 from pg_proc where proname='is_vendor_listing_manager') then 'applied' else 'missing' end""",
    "20261019000002_revoke_availability_rpcs": """
       case when to_regprocedure('reserve_availability(uuid,integer)') is null then 'n/a (function absent)'
            when not has_function_privilege('anon','reserve_availability(uuid,integer)','execute')
            then 'applied' else 'missing' end""",
    "20261020000001_vendor_onboarding": """
       case when exists (select 1 from information_schema.columns
              where table_name='vendor_organizations' and column_name='business_type') then 'applied' else 'missing' end""",
    "20261020000002_guard_vendor_review_fields": """
       case when exists (select 1 from pg_proc where proname='guard_vendor_review_fields') then 'applied' else 'missing' end""",
    "20261020000003_redeem_voucher_entry_point": """
       case when exists (select 1 from pg_proc where proname='redeem_voucher_by_hash') then 'applied' else 'missing' end""",
    "20261021000001_my_bookings": """
       case when exists (select 1 from pg_proc where proname='my_bookings') then 'applied' else 'missing' end""",
    # redeem_voucher(text, uuid) only exists once PART 7 has run, and has_function_privilege throws
    # on a function that is not there — so the probe has to check existence before privilege.
    #
    # This probe is the one here that cannot be proven locally. PART 7 already revoked the function
    # from PUBLIC, and the plain-Postgres harness has no Supabase default grant to anon, so on a
    # harness database it reads "applied" whether or not the migration ran. On a real Supabase
    # project the default grant to anon is there, so it discriminates. Trust it on staging only.
    "20261021000002_revoke_anon_redeem_voucher": """
       case when to_regprocedure('redeem_voucher(text,uuid)') is null then 'n/a (run PART 7 first)'
            when not has_function_privilege('anon','redeem_voucher(text,uuid)','execute')
            then 'applied' else 'missing' end""",
    # A create-or-replace over the same signature, so existence proves nothing: look for the
    # status gate on ticket_token that is the whole point of the migration.
    "20261021000003_my_bookings_ticket_token_by_status": """
       case when exists (select 1 from pg_proc where proname='my_bookings'
              and prosrc like '%then b.ticket_token else null%') then 'applied' else 'missing' end""",
    "20261022000001_transfer_guest_bookings": """
       case when to_regprocedure('transfer_guest_bookings(uuid,uuid)') is not null
            then 'applied' else 'missing' end""",
    # Platform default privileges give anon/authenticated SELECT on every table, so on an
    # unmigrated project this reads "missing" and on a migrated one "applied".
    "20261022000002_bookings_ticket_token_column_privilege": """
       case when not has_column_privilege('anon','bookings','ticket_token','select')
            then 'applied' else 'missing' end""",
    "20261026000001_storage_policies_complete": """
       case when exists (select 1 from pg_proc where proname='vendor_documents_editable') then 'applied' else 'missing' end""",
    "20261029000001_guard_listing_review_fields": """
       case when exists (select 1 from pg_proc where proname='guard_listing_review_fields') then 'applied' else 'missing' end""",
    "20261029000002_guard_slot_booked_count": """
       case when exists (select 1 from pg_proc where proname='guard_availability_booked_count') then 'applied' else 'missing' end""",
    "20261029000003_vendor_document_requirements": """
       case when exists (select 1 from information_schema.columns
              where table_name='vendor_documents' and column_name='expires_on') then 'applied' else 'missing' end""",
    "20261031000001_guard_promotion_review_fields": """
       case when exists (select 1 from pg_proc where proname='guard_promotion_review_fields') then 'applied' else 'missing' end""",
    "20261031000002_audit_promotion_approval": """
       case when exists (select 1 from pg_proc where proname='audit_promotion_approval') then 'applied' else 'missing' end""",
}

HEADER = """\
-- Bring the staging database (xtyuvtlnfougbjadkull) up to date with the migrations after Sep 21.
--
-- GENERATED by scripts/gen-staging-catchup.py. Do not edit by hand: change a migration or a probe
-- in that script and regenerate, or the catch-up drifts from what the repo actually applies.
--
-- READ FIRST. Migrations are not idempotent and staging has no migration ledger (it was provisioned
-- with scripts/db-push.sh, which uses psql directly). Run PART 0 and note which probes say
-- "applied". Each part is its own transaction. Then run ONLY the parts marked "missing", in order,
-- each as its own run. A part that is already applied fails loudly (duplicate column / trigger) and
-- rolls back, which is safe but noisy.
--
-- Migration bodies below are verbatim copies of supabase/migrations/*.sql.
--
-- One probe lies off a real Supabase project: 20261021000002_revoke_anon_redeem_voucher reads
-- "applied" on a plain-Postgres harness regardless, because the harness never grants anon the
-- EXECUTE that migration revokes. Against staging it is accurate.

-- ==========================================================================
-- PART 0: probe. Run on its own; it changes nothing.
-- ==========================================================================
"""

BANNER = "-- =========================================================================="


def migrations():
    found = sorted(p for p in MIGRATIONS.glob("*.sql") if p.stem >= FIRST)
    missing = [p.stem for p in found if p.stem not in PROBES]
    if missing:
        sys.exit("No probe defined for: " + ", ".join(missing) + "\nAdd one to PROBES.")
    stale = [m for m in PROBES if m not in {p.stem for p in found}]
    if stale:
        sys.exit("PROBES has entries with no migration file: " + ", ".join(stale))
    return found


def probe_sql():
    out = []
    for i, path in enumerate(migrations()):
        lead = "select" if i == 0 else "union all select"
        alias = " as migration" if i == 0 else ""
        suffix = " as state" if i == 0 else ""
        probe = PROBES[path.stem].strip("\n").rstrip()
        out.append(f"{lead} '{path.stem}'{alias},\n{probe}{suffix}\n")
    out.append("order by 1;\n")
    return "".join(out)


def render():
    files = migrations()
    out = [HEADER]

    out.append(probe_sql() + "\n")

    for n, path in enumerate(files, start=1):
        out.append(f"\n{BANNER}\n-- PART {n}: {path.stem}\n{BANNER}\nbegin;\n")
        out.append(path.read_text().strip() + "\ncommit;\n")

    return "".join(out)


def main():
    if "--probe" in sys.argv:
        print(probe_sql(), end="")
        return
    text = render()
    if "--check" in sys.argv:
        current = OUT.read_text() if OUT.exists() else ""
        if current != text:
            sys.exit(f"{OUT.relative_to(ROOT)} is out of date. Run: python3 scripts/gen-staging-catchup.py")
        print(f"{OUT.relative_to(ROOT)} is up to date ({len(text.splitlines())} lines).")
        return
    OUT.write_text(text)
    print(f"Wrote {OUT.relative_to(ROOT)} — {len(list(MIGRATIONS.glob('*.sql')))} migrations scanned, "
          f"{len(render().split('-- PART ')) - 2} parts after the probe.")


if __name__ == "__main__":
    main()
