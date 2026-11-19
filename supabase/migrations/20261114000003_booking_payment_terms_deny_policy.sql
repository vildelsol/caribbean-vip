-- booking_payment_terms had RLS on and no policy. That already denies the API roles, but the schema
-- test (rightly) cannot tell "locked on purpose" from "policy forgotten", and a table with no policy
-- reads as a mistake to the next person. Say it out loud: an explicit policy that matches nothing.
--
-- Edge Functions use the service role, which bypasses RLS, so they are unaffected.

create policy booking_payment_terms_deny_api on booking_payment_terms
  for all
  to anon, authenticated
  using (false)
  with check (false);
