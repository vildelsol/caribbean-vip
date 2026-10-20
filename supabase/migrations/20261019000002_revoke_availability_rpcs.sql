-- Take reserve_availability() and release_availability() off the public API.
--
-- Both are `security definer`, so they write availability_slots with RLS bypassed, and both were
-- executable by PUBLIC — the default for a new function. PUBLIC includes `anon`, so anyone holding
-- the anon key, which ships in the browser bundle by design, could call them without an account.
--
-- Verified before this migration: as `anon` with no JWT, reserve_availability(slot, 12) moved a
-- 12-seat slot from 0 booked to 12 booked with no bookings behind it. Repeated across slots that
-- empties the marketplace, and release_availability() is the mirror — lower booked_count while
-- bookings still exist and the vendor oversells the boat.
--
-- Neither function needs to be reachable from a browser. The only callers are in
-- supabase/functions/_shared/supabaseStore.ts, which runs on the service role, so the grant is
-- narrowed to that role rather than the functions being rewritten to check the caller.
--
-- REVOKE FROM PUBLIC, not from anon and authenticated. A grant held by PUBLIC applies to every
-- role, so revoking the two named roles leaves the privilege in place and changes nothing. The
-- test asserts the denial rather than trusting this comment.

revoke execute on function reserve_availability(uuid, integer) from public;
revoke execute on function release_availability(uuid, integer) from public;

-- Belt and braces: Supabase projects sometimes carry explicit role grants from earlier tooling,
-- and revoking a privilege that was never granted is not an error.
revoke execute on function reserve_availability(uuid, integer) from anon, authenticated;
revoke execute on function release_availability(uuid, integer) from anon, authenticated;

grant execute on function reserve_availability(uuid, integer) to service_role;
grant execute on function release_availability(uuid, integer) to service_role;
