-- A guest can download their data and ask for it to be erased (GDPR Art 15, 17, 20).
--
-- export_my_data()  everything this system holds about the caller, as one JSON document.
-- erase_my_data()   removes or scrubs what is not under a legal retention duty, and says what stays.
--
-- What erasure does NOT remove, on purpose, so the guest is told rather than surprised:
--   * bookings and payments: accounting and dispute records; the guest's free text is scrubbed
--     (attendee names, cancellation reason) and the rows stay, tied to a profile that no longer
--     holds a name. Retention periods are for counsel (docs/data-inventory.md).
--   * consent_events: proof that consent was given or withdrawn, kept to defend a claim
--     (Art 17(3)(e)). Erasure appends a withdrawal for every flag that was on.
--   * the sign-in itself: removing an auth user needs the Auth admin API, so the account row stays
--     as an empty shell until an Edge Function deletes it. A guest with no bookings loses nothing
--     by that; a guest with bookings cannot be deleted at all (bookings.user_id is ON DELETE
--     RESTRICT, deliberately).
-- Staff (vendor or admin roles) hold business data this function does not model; their accounts
-- are handled by an administrator.

create or replace function export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then
    raise exception 'sign in to export your data';
  end if;

  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from profiles p where p.id = uid),
    'consent_events', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from consent_events c where c.user_id = uid), '[]'),
    'saved_items', coalesce((select jsonb_agg(to_jsonb(s)) from saved_items s where s.user_id = uid), '[]'),
    'trips', coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object(
        'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order) from trip_items i where i.trip_id = t.id), '[]')))
      from trips t where t.user_id = uid), '[]'),
    'bookings', coalesce((select jsonb_agg(to_jsonb(b) || jsonb_build_object(
        'guests', coalesce((select jsonb_agg(to_jsonb(g)) from booking_guests g where g.booking_id = b.id), '[]'),
        'payments', coalesce((select jsonb_agg(to_jsonb(y)) from payments y where y.booking_id = b.id), '[]')))
      from bookings b where b.user_id = uid), '[]'),
    'reviews', coalesce((select jsonb_agg(to_jsonb(r)) from reviews r where r.user_id = uid), '[]'),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n)) from notifications n where n.user_id = uid), '[]'),
    'ai_conversations', coalesce((select jsonb_agg(to_jsonb(a)) from ai_conversations a where a.user_id = uid), '[]'),
    'offers_shown', coalesce((select jsonb_agg(to_jsonb(m)) from promotion_impressions m where m.user_id = uid), '[]'),
    'vouchers', coalesce((select jsonb_agg(to_jsonb(v)) from vouchers v where v.user_id = uid), '[]')
  ) into result;

  return result;
end;
$$;

comment on function export_my_data() is
  'Everything held about the caller, as JSON. Reads only rows where the caller is the subject.';

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

  select count(*) into kept_bookings from bookings where user_id = uid;

  return jsonb_build_object(
    'erased', true,
    'bookings_retained', kept_bookings,
    'account_removable', kept_bookings = 0
  );
end;
$$;

comment on function erase_my_data() is
  'Erases or scrubs the caller''s personal data; keeps bookings, payments and consent proof. Staff accounts are refused.';

revoke execute on function export_my_data() from public, anon;
revoke execute on function erase_my_data() from public, anon;
grant execute on function export_my_data() to authenticated;
grant execute on function erase_my_data() to authenticated;
