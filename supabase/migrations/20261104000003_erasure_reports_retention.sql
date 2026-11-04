-- Erasure tells the guest how long what stayed will stay.
--
-- Records kept under a legal duty are held 7 years from the transaction date (decided 2026-11-04;
-- GDPR Art 17(3)(b)). The guest was told only that bookings stayed. Now the answer carries the date
-- the last of them can go (`retained_until`, null when nothing was kept), and the same date is written
-- to `privacy_requests.outcome` so the promise is on record. Nothing else about erasure changes.
-- The 7 years matches `enforce_retention_floor()`; change both together.

create or replace function erase_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prof profiles%rowtype;
  kept_bookings integer;
  kept_until timestamptz;
begin
  if uid is null then
    raise exception 'sign in to erase your data';
  end if;

  select * into prof from profiles where id = uid for update;
  if not found then
    raise exception 'no profile for this user';
  end if;
  if prof.role <> 'tourist' then
    raise exception 'staff accounts are erased by an administrator';
  end if;

  delete from ai_conversations where user_id = uid;
  delete from saved_items where user_id = uid;
  delete from trips where user_id = uid;
  delete from notifications where user_id = uid;
  delete from promotion_impressions where user_id = uid;
  delete from reviews where user_id = uid;
  update vouchers set user_id = null where user_id = uid and booking_id is null;

  update booking_guests set guest_name = null
   where booking_id in (select id from bookings where user_id = uid);
  update bookings set cancellation_reason = null where user_id = uid;

  -- Withdraw every consent that was on, and leave the proof of it.
  insert into consent_events (user_id, purpose, granted, wording_version)
  select uid, f.purpose, false, 'erasure'
    from (values ('location', prof.location_consent),
                 ('offers', prof.offer_consent),
                 ('notifications', prof.notification_consent)) as f(purpose, was_on)
   where f.was_on;

  perform set_config('cvip.consent_rpc', 'on', true);
  update profiles set
    display_name = null,
    interests = '{}',
    party_size = null,
    selected_island_id = null,
    selected_destination_id = null,
    location_consent = false,
    offer_consent = false,
    notification_consent = false
  where id = uid;
  perform set_config('cvip.consent_rpc', 'off', true);

  select count(*), max(created_at) + interval '7 years' into kept_bookings, kept_until
    from bookings where user_id = uid;

  insert into privacy_requests (subject_id, request_type, outcome)
  values (uid, 'erasure', jsonb_build_object('bookings_retained', kept_bookings, 'retained_until', kept_until));

  return jsonb_build_object(
    'erased', true,
    'bookings_retained', kept_bookings,
    'retained_until', kept_until,
    'account_removable', kept_bookings = 0
  );
end;
$$;

comment on function erase_my_data() is
  'Erases or scrubs the caller''s personal data; keeps bookings, payments and consent proof for 7 years and says until when. Staff accounts are refused.';

revoke execute on function erase_my_data() from public, anon;
grant execute on function erase_my_data() to authenticated;
