-- The database's token hash must equal what the TypeScript codec produces.
--
-- `hashVoucherToken()` in packages/types/src/voucher.ts returns **base64url** of the sha256,
-- unpadded. Postgres `encode(…, 'base64')` returns standard base64, where `+`, `/` and `=` stand
-- where base64url has `-`, `_` and nothing. If `redeem_voucher()` got that translation wrong every
-- real voucher would report `unknown_token` — a failure that looks exactly like a forged QR, which
-- is why it is pinned here rather than left to be discovered at a gate.
--
-- The same token and the same expected literal appear in packages/types/src/voucher.test.ts. The
-- vector is chosen because its digest contains both a `+` and a `/` in standard base64, so a
-- missing translation cannot pass by luck.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

do $$
declare
  token    text := 'cvip://v1/eyJ2IjoxLCJpZCI6IkFBQUFBQUFBQUFBQUFBQUFBQSJ9.c2lnc2lnc2ln';
  expected text := 'je1SoA-NKZ3pWKrYzNELzjvYYPaJXm8EPKU_VFmSM6U';
begin
  perform test.eq(voucher_token_hash(token), expected,
    'voucher_token_hash() matches hashVoucherToken() exactly');

  -- Guards the specific mistake: plain base64 must NOT equal the expected value, or this test
  -- would pass even with the translation removed.
  perform test.ok(
    encode(digest(convert_to(btrim(token), 'UTF8'), 'sha256'), 'base64') <> expected,
    'the vector really does exercise the base64url translation'
  );

  -- The codec trims before hashing, so trailing whitespace from a scanner must not change it.
  -- btrim() would strip the spaces and leave the newline, so this is the assertion that catches
  -- the difference between Postgres btrim and JavaScript .trim().
  perform test.eq(voucher_token_hash(token || E'\n  '), expected,
    'a newline and spaces from a scanner are trimmed, as .trim() would');
  perform test.eq(voucher_token_hash(E'\t ' || token), expected, 'leading tab too');
end
$$;

rollback;
