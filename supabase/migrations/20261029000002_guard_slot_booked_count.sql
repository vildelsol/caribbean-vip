-- A vendor must not write `availability_slots.booked_count`.
--
-- `booked_count` is the seat counter that stops a boat being oversold. It is maintained by
-- reserve_availability() and release_availability(), which take a row lock (AD-03) and were taken
-- off the public API in 20261019000002 for exactly that reason. But `availability_slots_vendor_insert`
-- and `availability_slots_vendor_update` (20261019000001) cover every column, so a vendor with
-- listing-manage rights could write the counter directly: lower it with bookings standing, and the
-- next guest is sold a seat that is already taken.
--
-- Same shape as the other two guards (vendor review fields, listing review fields): a trigger,
-- because the rule is per-column and RLS is per-row.
--
-- Capacity and status stay vendor-writable. Capacity is the vendor's own number and
-- `availability_slots_not_oversold` already refuses one below what is sold; status ('closed',
-- 'cancelled') is how a vendor stops sales on a departure.

create or replace function guard_availability_booked_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No end-user context: the service role the booking Edge Functions run as. Admins may correct a
  -- counter by hand.
  if auth.uid() is null or is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.booked_count <> 0 then
      raise exception 'booked_count is maintained by the booking system, not by vendors';
    end if;
  elsif new.booked_count is distinct from old.booked_count then
    raise exception 'booked_count is maintained by the booking system, not by vendors';
  end if;

  return new;
end;
$$;

comment on function guard_availability_booked_count() is
  'Blocks vendor writes to availability_slots.booked_count. RLS cannot express a per-column rule.';

create trigger availability_slots_booked_count_guard
  before insert or update on availability_slots
  for each row execute function guard_availability_booked_count();
