-- A guest's review is pending, of the experience they took, after it happened.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;
begin;
set local role service_role;

create temporary table fx (k text primary key, v uuid) on commit drop;
grant select on fx to anon, authenticated;

do $$
declare
  guest uuid; other uuid; adm uuid; org uuid; e1 uuid; e2 uuid;
  past_slot uuid; future_slot uuid; b_past uuid; b_future uuid; b_pending uuid; slot3 uuid;
  slot4 uuid; b_past2 uuid;
begin
  insert into auth.users (email) values ('rv-guest@test.local') returning id into guest;
  insert into auth.users (email) values ('rv-other@test.local') returning id into other;
  insert into auth.users (email) values ('rv-admin@test.local') returning id into adm;
  update profiles set role = 'admin' where id = adm;

  select e.id, e.vendor_org_id into e1, org from experiences e where e.title = 'Catamaran Snorkel & Sunset';
  select e.id into e2 from experiences e where e.id <> e1 and e.status = 'approved' limit 1;

  insert into availability_slots (experience_id, starts_at, ends_at, capacity)
  values (e1, now() - interval '3 days', now() - interval '3 days' + interval '2 hours', 5) returning id into past_slot;
  insert into availability_slots (experience_id, starts_at, ends_at, capacity)
  values (e1, now() + interval '3 days', now() + interval '3 days' + interval '2 hours', 5) returning id into future_slot;
  insert into availability_slots (experience_id, starts_at, ends_at, capacity)
  values (e1, now() - interval '5 days', now() - interval '5 days' + interval '2 hours', 5) returning id into slot3;

  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference, status, currency, subtotal_minor, total_minor, seats)
  values (guest, org, e1, past_slot,   'VIPJ-RV-0001', 'completed',       'USD', 1000, 1000, 1) returning id into b_past;
  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference, status, currency, subtotal_minor, total_minor, seats)
  values (guest, org, e1, future_slot, 'VIPJ-RV-0002', 'confirmed',       'USD', 1000, 1000, 1) returning id into b_future;
  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference, status, currency, subtotal_minor, total_minor, seats)
  values (guest, org, e1, slot3,       'VIPJ-RV-0003', 'pending_payment', 'USD', 1000, 1000, 1) returning id into b_pending;

  -- A second reviewable booking: the body-length test needs one that has no review yet, because
  -- reviews.booking_id is unique.
  insert into availability_slots (experience_id, starts_at, ends_at, capacity)
  values (e1, now() - interval '7 days', now() - interval '7 days' + interval '2 hours', 5) returning id into slot4;
  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference, status, currency, subtotal_minor, total_minor, seats)
  values (guest, org, e1, slot4, 'VIPJ-RV-0004', 'completed', 'USD', 1000, 1000, 1) returning id into b_past2;

  insert into fx values ('guest', guest), ('other', other), ('admin', adm), ('e1', e1), ('e2', e2),
    ('b_past', b_past), ('b_future', b_future), ('b_pending', b_pending), ('b_past2', b_past2);
end $$;

set local role authenticated;

do $$
declare
  guest uuid := (select v from fx where k='guest'); other uuid := (select v from fx where k='other');
  e1 uuid := (select v from fx where k='e1'); e2 uuid := (select v from fx where k='e2');
  b_past uuid := (select v from fx where k='b_past'); b_future uuid := (select v from fx where k='b_future');
  b_pending uuid := (select v from fx where k='b_pending');
  st moderation_state; mod uuid;
begin
  perform test.become(guest);

  -- Each refusal has the positive control below it.
  perform test.raises(format($q$ insert into reviews (booking_id, experience_id, user_id, rating) values (%L,%L,%L,5) $q$, b_past, e2, guest),
    'a review of a different experience than the booking is refused');
  perform test.raises(format($q$ insert into reviews (booking_id, experience_id, user_id, rating) values (%L,%L,%L,5) $q$, b_future, e1, guest),
    'a review before the experience happened is refused');
  perform test.raises(format($q$ insert into reviews (booking_id, experience_id, user_id, rating) values (%L,%L,%L,5) $q$, b_pending, e1, guest),
    'a review on an unpaid booking is refused');
  perform test.raises(format($q$ insert into reviews (booking_id, experience_id, user_id, rating) values (%L,%L,%L,5) $q$, b_past, e1, other),
    'a review in someone else''s name is refused');

  -- Sneaking in a published review: it is accepted but stored pending.
  insert into reviews (booking_id, experience_id, user_id, rating, moderation_state, moderated_by)
  values (b_past, e1, guest, 5, 'published', guest);
  set local role service_role;
  select moderation_state, moderated_by into st, mod from reviews where booking_id = b_past;
  perform test.eq(st, 'pending'::moderation_state, 'a self-published review is stored pending (control: the legitimate review was accepted)');
  perform test.ok(mod is null, 'a self-named moderator is cleared');
  perform test.eq((select count(*)::int from experience_ratings where experience_id = e1), 0,
                  'a pending review contributes to no rating');
end $$;

-- An admin publishes it; moderated_by is stamped from the session, not from the client.
set local role authenticated;
do $$
declare
  adm uuid := (select v from fx where k='admin'); b_past uuid := (select v from fx where k='b_past');
  e1 uuid := (select v from fx where k='e1'); mod uuid; n int; avg numeric;
begin
  perform test.become(adm);
  update reviews set moderation_state = 'published', moderated_by = null where booking_id = b_past;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'an admin can publish a review');
  set local role service_role;
  select moderated_by into mod from reviews where booking_id = b_past;
  perform test.eq(mod, adm, 'the moderator is the admin who acted');
  select average_rating into avg from experience_ratings where experience_id = e1;
  perform test.eq(avg, 5.00::numeric, 'a published review is in the aggregate');

  -- The database logs the moderation itself, so a decision made outside the console still leaves a
  -- trace. The console adds its own row for the reason; this one cannot be forgotten.
  perform test.eq(
    (select count(*)::int from audit_logs
      where entity_type = 'reviews'
        and action = 'reviews.moderation_state_changed'
        and entity_id = (select id from reviews where booking_id = b_past)
        and before ->> 'moderation_state' = 'pending'
        and after  ->> 'moderation_state' = 'published'),
    1, 'publishing a review writes an audit row naming the transition');
  perform test.eq(
    (select actor_user_id from audit_logs
      where entity_type = 'reviews' and entity_id = (select id from reviews where booking_id = b_past)),
    adm, 'the audit row names the admin who acted');
end $$;

-- A review body is bounded. Unbounded `text` let anyone with the anon key and a token store
-- whatever fit in a request body.
set local role authenticated;
do $$
declare
  guest uuid := (select v from fx where k='guest'); e1 uuid := (select v from fx where k='e1');
  b2 uuid := (select v from fx where k='b_past2'); n int;
begin
  perform test.become(guest);
  perform test.raises(
    format($q$ insert into reviews (booking_id, experience_id, user_id, rating, body) values (%L,%L,%L,4,repeat('x',2001)) $q$, b2, e1, guest),
    'a review body over 2000 characters is refused');

  -- Positive control: the same insert at the limit succeeds, so the refusal above is the length
  -- check and not some other rule rejecting the row.
  insert into reviews (booking_id, experience_id, user_id, rating, body)
  values (b2, e1, guest, 4, repeat('x', 2000));
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a review body at exactly 2000 characters is accepted');
end $$;

-- The public aggregate is readable by anon, and shows the published review but not its text.
set local role anon;
do $$
declare e1 uuid := (select v from fx where k='e1'); n int; body_n int;
begin
  perform test.become_anon();
  select review_count into n from experience_ratings where experience_id = e1;
  perform test.eq(n, 1, 'anon can read the published aggregate');
  select count(*)::int into body_n from information_schema.columns
   where table_name = 'experience_ratings' and column_name in ('body', 'user_id', 'booking_id');
  perform test.eq(body_n, 0, 'the aggregate exposes no review text, user or booking');
end $$;

rollback;
