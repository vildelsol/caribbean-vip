-- Give the scanner a redemption RPC it can actually call, and stop the old one being callable.
--
-- `apps/vendor-web/lib/redeem.ts` called `redeem_voucher({p_token, p_scanner_name})`. No migration
-- ever defined that signature — the only one was `redeem_voucher(p_token_hash, p_vendor_org_id,
-- p_scanner_user_id, p_device_meta)`. The two-argument contract existed only in the hand-written
-- `packages/supabase/src/database.types.ts`, so `pnpm typecheck` passed and PostgREST returned
-- PGRST202 at runtime: every live scan threw. Demo mode hid it, because `isDemoScanner`
-- short-circuits before the RPC.
--
-- The old function was also executable by PUBLIC and took the scanner's identity and the vendor
-- org as parameters, checking neither against the caller. Verified before this migration: a
-- tourist with no vendor membership redeemed an organisation's voucher (`ok`, voucher burned,
-- `redeemed_by` set to whatever uuid was passed), and a `vendor_staff` with
-- `can_scan_vouchers = false` redeemed one too. `can_scan_for_vendor()` has existed since the
-- first functions migration and was referenced by nothing.
--
-- Shape: the decision logic is untouched and becomes an internal engine; a thin authenticated
-- entry point sits in front of it.

-- --------------------------------------------------------------------------
-- The hash, in one place
-- --------------------------------------------------------------------------
--
-- Must equal `hashVoucherToken()` in packages/types/src/voucher.ts: **base64url** of the sha256,
-- unpadded, of the trimmed token. Two ways to get this wrong, both of which make a valid voucher
-- report `unknown_token` — indistinguishable from a forged QR at the gate:
--
--   1. `encode(…, 'base64')` is standard base64. Its `+`, `/` and `=` are `-`, `_` and nothing in
--      base64url. pgcrypto also wraps long base64 output; a 32-byte digest never reaches the wrap
--      width, but stripping newlines costs nothing and removes the question.
--   2. `btrim(x)` strips SPACES ONLY, while JavaScript `.trim()` also strips newlines, tabs and
--      carriage returns. A scanner that appends a newline would hash to something else entirely.
--      Hence the regexp, which matches `\s` as `.trim()` does.
--
-- It lives in its own function so the entry point and `supabase/tests/voucher_hash.test.sql`
-- exercise the same expression rather than two copies that can drift.

create or replace function voucher_token_hash(p_token text)
returns text
language sql
immutable
set search_path = public
as $$
  select rtrim(
    translate(
      replace(
        encode(
          digest(convert_to(regexp_replace(p_token, '^\s+|\s+$', '', 'g'), 'UTF8'), 'sha256'),
          'base64'
        ),
        E'\n', ''
      ),
      '+/', '-_'
    ),
    '='
  );
$$;

comment on function voucher_token_hash(text) is
  'base64url sha256 of the trimmed voucher token. Mirrors hashVoucherToken() in @cvip/types.';

-- --------------------------------------------------------------------------
-- The engine
-- --------------------------------------------------------------------------
--
-- Renamed rather than rewritten, so the row lock, the branch ordering and every outcome stay
-- byte-identical — `atomicity.test.sql` covers all ten branches through this function and keeps
-- doing so. It still trusts its arguments, which is now acceptable because only the service role
-- can call it: Edge Functions and the test suite.

alter function redeem_voucher(text, uuid, uuid, jsonb) rename to redeem_voucher_by_hash;

revoke execute on function redeem_voucher_by_hash(text, uuid, uuid, jsonb) from public;
revoke execute on function redeem_voucher_by_hash(text, uuid, uuid, jsonb) from anon, authenticated;
grant execute on function redeem_voucher_by_hash(text, uuid, uuid, jsonb) to service_role;

comment on function redeem_voucher_by_hash(text, uuid, uuid, jsonb) is
  'Redemption decision engine. Trusts its arguments, so it is service-role only; authenticated callers use redeem_voucher(text, uuid).';

-- --------------------------------------------------------------------------
-- The entry point the scanner calls
-- --------------------------------------------------------------------------
--
-- Takes the raw token from the QR code and the organisation the scanner believes it is scanning
-- for. It derives the scanner from `auth.uid()` and refuses unless that user holds
-- `can_scan_vouchers` for the named organisation, so neither the identity nor the permission is
-- the client's to assert.
--
-- Hashing is `voucher_token_hash()` above, which is pinned against the TypeScript codec by
-- `supabase/tests/voucher_hash.test.sql` and `packages/types/src/voucher.test.ts`.
--
-- The HMAC signature is NOT verified here: the signing secret is deliberately server-side only and
-- has no business in the database. A tampered or fabricated QR therefore fails by hash miss and
-- reports `unknown_token`, which is the same answer a scanner needs, and the attempt is still
-- recorded in `voucher_redemptions`.

create or replace function redeem_voucher(
  p_token         text,
  p_vendor_org_id uuid
)
returns table (
  result               redemption_result,
  voucher_id           uuid,
  redeemed_at          timestamptz,
  original_redeemed_at timestamptz,
  original_scanner     text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scanner uuid := auth.uid();
  v_hash    text;
  r         record;
begin
  if v_scanner is null then
    raise exception 'redeem_voucher requires a signed-in scanner';
  end if;

  if not can_scan_for_vendor(p_vendor_org_id) then
    -- Not a redemption outcome. A scanner without the permission is a configuration problem for
    -- the vendor to fix, not something to render as a decision about the guest's voucher.
    raise exception 'you do not have permission to scan vouchers for this organisation';
  end if;

  v_hash := voucher_token_hash(p_token);

  select * into r
    from redeem_voucher_by_hash(v_hash, p_vendor_org_id, v_scanner, '{}'::jsonb);

  return query
    select r.result,
           r.voucher_id,
           r.redeemed_at,
           r.original_redeemed_at,
           (select p.display_name from profiles p where p.id = r.original_scanner_id);
end;
$$;

revoke execute on function redeem_voucher(text, uuid) from public;
grant execute on function redeem_voucher(text, uuid) to authenticated;

comment on function redeem_voucher(text, uuid) is
  'Scanner entry point. Hashes the token, derives the scanner from auth.uid() and requires can_scan_vouchers for the named organisation.';
