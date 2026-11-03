-- Export returns only the caller's data; erasure scrubs what it should and keeps what it must.
-- Each denial is paired with a positive control.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table fixture (k text primary key, v uuid) on commit drop;
grant select on fixture to anon, authenticated;

do $$
declare
  a uuid; b uuid; org uuid; slot uuid; exp uuid; opt uuid; bk uuid; promo uuid; trip uuid;
begin
  insert into auth.users (email) values ('erase-a@test.local') returning id into a;
  insert into auth.users (email) values ('erase-b@test.local') returning id into b;

  select s.id, s.experience_id into slot, exp from availability_slots s limit 1;
  select e.vendor_org_id into org from experiences e where e.id = exp;
  select o.id into opt from experience_options o where o.experience_id = exp limit 1;
  select p.id into promo from promotions p limit 1;

  update profiles set display_name = 'Ada Guest', interests = '{}', party_size = 3,
         location_consent = true, offer_consent = true where id = a;
  update profiles set display_name = 'Bea Other' where id = b;

  insert into saved_items (user_id, item_type, item_id) values (a, 'experience', exp), (b, 'experience', exp);
  insert into trips (user_id, title) values (a, 'A trip') returning id into trip;
  insert into trips (user_id, title) values (b, 'B trip');
  insert into notifications (user_id, kind, title) select a, e.enumlabel::notification_kind, 'hello'
    from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'notification_kind' limit 1;
  insert into ai_conversations (user_id, session_id, messages) values (a, 's1', '[{"role":"user","content":"hi"}]');
  insert into promotion_impressions (promotion_id, user_id) values (promo, a);

  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference, currency,
                        subtotal_minor, total_minor, seats, cancellation_reason)
  select a, org, exp, slot, 'ERASE-' || substr(gen_random_uuid()::text, 1, 8), 'USD', 1000, 1000, 1, 'my phone number is 555'
  returning id into bk;
  insert into booking_guests (booking_id, experience_option_id, quantity, unit_amount_minor, guest_name)
  values (bk, opt, 1, 1000, 'Ada Guest');

  insert into fixture values ('a', a), ('b', b), ('booking', bk);
end
$$;

set local role authenticated;

-- Positive control: the export holds the caller's data, and only theirs.
do $$
declare
  a uuid := (select v from fixture where k = 'a');
  doc jsonb;
begin
  perform test.become(a);
  doc := export_my_data();
  perform test.eq(doc #>> '{profile,display_name}', 'Ada Guest', 'export includes the profile');
  perform test.eq(jsonb_array_length(doc -> 'saved_items'), 1, 'export includes only own saved items');
  perform test.eq(jsonb_array_length(doc -> 'trips'), 1, 'export includes only own trips');
  perform test.eq(jsonb_array_length(doc -> 'bookings'), 1, 'export includes the booking');
  perform test.eq(doc #>> '{bookings,0,guests,0,guest_name}', 'Ada Guest', 'export includes attendee names');
  perform test.ok(doc::text not like '%Bea Other%', 'export holds nothing of another guest');
  perform test.eq((select count(*) from privacy_requests where subject_id = a and request_type = 'export')::integer, 1,
    'an export leaves a request record');
end
$$;

-- Erasure.
do $$
declare
  a uuid := (select v from fixture where k = 'a');
  bk uuid := (select v from fixture where k = 'booking');
  res jsonb; n integer; txt text; nm text; loc boolean; off boolean;
begin
  perform test.become(a);
  res := erase_my_data();
  perform test.eq((res ->> 'bookings_retained')::integer, 1, 'reports the booking it kept');
  perform test.eq((res ->> 'account_removable')::boolean, false, 'a guest with a booking is not removable');

  select count(*) into n from saved_items where user_id = a;
  perform test.eq(n, 0, 'saved items are gone');
  select count(*) into n from trips where user_id = a;
  perform test.eq(n, 0, 'trips are gone');
  select count(*) into n from ai_conversations where user_id = a;
  perform test.eq(n, 0, 'chat history is gone');
  select count(*) into n from promotion_impressions where user_id = a;
  perform test.eq(n, 0, 'offers shown are gone');
  select count(*) into n from notifications where user_id = a;
  perform test.eq(n, 0, 'notifications are gone');

  select display_name, location_consent, offer_consent into nm, loc, off from profiles where id = a;
  perform test.ok(nm is null, 'the name is scrubbed');
  perform test.eq(loc or off, false, 'consents are withdrawn');

  select count(*) into n from consent_events where user_id = a and granted = false and wording_version = 'erasure';
  perform test.eq(n, 2, 'a withdrawal is recorded for each consent that was on');

  select count(*) into n from bookings where id = bk;
  perform test.eq(n, 1, 'the booking stays');
  select cancellation_reason into txt from bookings where id = bk;
  perform test.ok(txt is null, 'the cancellation reason is scrubbed');
  select guest_name into txt from booking_guests where booking_id = bk;
  perform test.ok(txt is null, 'the attendee name is scrubbed');
end
$$;

-- Isolation: erasing a does not touch b.
do $$
declare b uuid := (select v from fixture where k = 'b'); n integer; nm text;
begin
  perform test.become(b);
  select display_name into nm from profiles where id = b;
  perform test.eq(nm, 'Bea Other', 'the other guest keeps their name');
  select count(*) into n from saved_items where user_id = b;
  perform test.eq(n, 1, 'the other guest keeps their saved items');
  select count(*) into n from trips where user_id = b;
  perform test.eq(n, 1, 'the other guest keeps their trips');
end
$$;

-- A second erasure is harmless.
do $$
declare a uuid := (select v from fixture where k = 'a'); n integer;
begin
  perform test.become(a);
  perform erase_my_data();
  select count(*) into n from consent_events where user_id = a and wording_version = 'erasure';
  perform test.eq(n, 2, 'erasing twice writes no further withdrawals');
  select count(*) into n from privacy_requests where subject_id = a and request_type = 'erasure';
  perform test.eq(n, 2, 'each erasure request is recorded, including the repeat');
  perform test.eq((select outcome ->> 'bookings_retained' from privacy_requests
                    where subject_id = a and request_type = 'erasure' limit 1), '1',
    'the record states what was retained, as a count');
end
$$;

-- The request record: private to its subject, not writable or editable by a guest.
do $$
declare a uuid := (select v from fixture where k = 'a'); b uuid := (select v from fixture where k = 'b'); n integer;
begin
  perform test.become(b);
  select count(*) into n from privacy_requests;
  perform test.eq(n, 0, 'another guest sees none of a''s requests');
  perform test.become(a);
  select count(*) into n from privacy_requests;
  perform test.eq(n, 3, 'a sees their own three requests');
  perform test.raises(format($q$ insert into privacy_requests (subject_id, request_type) values (%L, 'erasure') $q$, a),
    'a guest cannot write a request record directly');
  update privacy_requests set outcome = '{}' where subject_id = a;
  get diagnostics n = row_count;
  perform test.eq(n, 0, 'a guest cannot edit a request record');
end
$$;

-- Denials.
do $$
begin
  perform test.become_anon();
  perform test.ok(not has_function_privilege('anon', 'export_my_data()', 'execute'), 'anon cannot export');
  perform test.ok(not has_function_privilege('anon', 'erase_my_data()', 'execute'), 'anon cannot erase');
  perform test.ok(has_function_privilege('authenticated', 'export_my_data()', 'execute'), 'authenticated can export');
  perform test.ok(has_function_privilege('authenticated', 'erase_my_data()', 'execute'), 'authenticated can erase');
end
$$;

-- Staff are refused.
set local role service_role;
do $$
declare s uuid;
begin
  insert into auth.users (email) values ('erase-staff@test.local') returning id into s;
  update profiles set role = 'admin' where id = s;
  insert into fixture values ('staff', s);
end
$$;
set local role authenticated;
do $$
declare s uuid := (select v from fixture where k = 'staff');
begin
  perform test.become(s);
  perform test.raises('select erase_my_data()', 'a staff account cannot self-erase');
end
$$;

-- A guest with no bookings is removable.
set local role service_role;
do $$
declare c uuid;
begin
  insert into auth.users (email) values ('erase-c@test.local') returning id into c;
  insert into fixture values ('c', c);
end
$$;
set local role authenticated;
do $$
declare c uuid := (select v from fixture where k = 'c');
begin
  perform test.become(c);
  perform test.eq((erase_my_data() ->> 'account_removable')::boolean, true, 'a guest with no booking is removable');
end
$$;

-- The record outlives the account: no foreign key to profiles, so removing the sign-in keeps it.
set local role service_role;
do $$
declare c uuid := (select v from fixture where k = 'c'); n integer;
begin
  delete from auth.users where id = c;
  select count(*) into n from profiles where id = c;
  perform test.eq(n, 0, 'fixture: the guest account is gone');
  select count(*) into n from privacy_requests where subject_id = c and request_type = 'erasure';
  perform test.eq(n, 1, 'the erasure record survives removal of the account');
end
$$;

rollback;
