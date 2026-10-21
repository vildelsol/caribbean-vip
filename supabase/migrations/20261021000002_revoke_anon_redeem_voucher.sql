-- redeem_voucher(text, uuid) was revoked from PUBLIC only.
--
-- Supabase's default privileges grant EXECUTE on new functions to anon directly, and a PUBLIC
-- revoke does not remove a grant made to a named role. The function still refuses a caller with
-- no uid, so this is hardening and not a live hole, but an unauthenticated caller should not be
-- able to reach it at all. The local harness cannot show the difference (it has no such default
-- grant), so this is verified against a real project, not by supabase/tests.

revoke execute on function redeem_voucher(text, uuid) from anon;
