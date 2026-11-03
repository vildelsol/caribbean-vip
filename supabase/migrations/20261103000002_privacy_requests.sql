-- A record that each access or erasure request was honoured (GDPR Art 5(2), accountability).
--
-- Until now erase_my_data() left no trace of itself beyond the consent withdrawals, so the
-- controller could not show a regulator, or the guest, that a request was received and answered.
-- This table is that record. It holds a pseudonymous subject id, the kind of request, when, and a
-- counts-only outcome. It deliberately has NO foreign key to profiles: erasure and any later
-- account removal must not delete the evidence that erasure happened. It holds no names, no
-- exported content and no free text.
--
-- Both functions now write their own row in the same transaction as the work, so a request cannot
-- be honoured without being recorded. export_my_data() therefore stops being STABLE.
--
-- Retention of these rows is for counsel (docs/data-inventory.md). Backups: an erased guest
-- reappears if a backup is restored; replaying this log is how the erasure is re-applied.

create table privacy_requests (
  id           uuid primary key default gen_random_uuid(),
  subject_id   uuid not null,
  request_type text not null check (request_type in ('export', 'erasure')),
  received_at  timestamptz not null default now(),
  outcome      jsonb not null default '{}'::jsonb
);

create index privacy_requests_subject_idx on privacy_requests (subject_id, received_at desc);

create trigger privacy_requests_no_update
  before update on privacy_requests
  for each row execute function forbid_mutation();

alter table privacy_requests enable row level security;

create policy privacy_requests_self_read on privacy_requests
  for select to authenticated
  using (subject_id = auth.uid());

create policy privacy_requests_admin_read on privacy_requests
  for select to authenticated
  using (is_admin());

-- No insert policy: only the two functions below write.

create or replace function export_my_data()
returns jsonb
language plpgsql
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

  insert into privacy_requests (subject_id, request_type)
  values (uid, 'export');

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

  insert into privacy_requests (subject_id, request_type, outcome)
  values (uid, 'erasure', jsonb_build_object('bookings_retained', kept_bookings));

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
