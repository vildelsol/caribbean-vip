-- public_pricing(): the two rates a guest's screen needs to show the same total the server charges.
--
-- The tourist app computes its quote locally (`calculateBookingTotal`) from a tax rate and a service
-- fee rate, while the checkout function charges using `platform_settings`. The app had those two
-- numbers hard-coded, so the day an admin changed a rate the screen would show one total and Stripe
-- would charge another. Both rates are also placeholders pending OD-03, so they WILL change.
--
-- `platform_settings` is readable only by signed-in users, and the catalogue loads before the guest
-- has a session, so it cannot be read directly. This returns exactly two keys and nothing else: the
-- commission rate is a vendor-side figure and stays unreadable. No arguments, nothing to aim.

create or replace function public_pricing() returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(replace(key, 'pricing.', ''), value), '{}'::jsonb)
    from platform_settings
   where key in ('pricing.tax_rate', 'pricing.service_fee_rate');
$$;

revoke execute on function public_pricing() from public;
grant  execute on function public_pricing() to anon, authenticated, service_role;
