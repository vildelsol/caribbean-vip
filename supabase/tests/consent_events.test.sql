-- Consent is provable: every change leaves an event, and only record_consent() can make one.
--
-- Each denial is paired with a positive control, so a passing file cannot mean "nobody can write".

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table fixture (k text primary key, v uuid) on commit drop;
grant select on fixture to anon, authenticated;

do $$
declare a uuid; b uuid;
begin
  insert into auth.users (email) values ('consent-a@test.local') returning id into a;
  insert into auth.users (email) values ('consent-b@test.local') returning id into b;
  insert into fixture values ('a', a), ('b', b);
end
$$;

set local role authenticated;

-- Positive control: the function works, flips the flag and appends one event.
do $$
declare
  a uuid := (select v from fixture where k = 'a');
  flag boolean; n integer; ver text;
begin
  perform test.become(a);
  perform record_consent('offers', true, 'offers-v1');

  select offer_consent into flag from profiles where id = a;
  perform test.eq(flag, true, 'record_consent sets the flag');

  select count(*), max(wording_version) into n, ver from consent_events where user_id = a and purpose = 'offers';
  perform test.eq(n, 1, 'one event per change');
  perform test.eq(ver, 'offers-v1', 'the event names the wording');
end
$$;

-- Restating the current answer is not a new consent.
do $$
declare a uuid := (select v from fixture where k = 'a'); n integer;
begin
  perform test.become(a);
  perform record_consent('offers', true, 'offers-v1');
  select count(*) into n from consent_events where user_id = a;
  perform test.eq(n, 1, 'a restatement writes no event');
end
$$;

-- Withdrawal is recorded too, and it takes effect.
do $$
declare a uuid := (select v from fixture where k = 'a'); flag boolean; n integer;
begin
  perform test.become(a);
  perform record_consent('offers', false, 'offers-v1');
  select offer_consent into flag from profiles where id = a;
  perform test.eq(flag, false, 'withdrawal clears the flag');
  select count(*) into n from consent_events where user_id = a and granted = false;
  perform test.eq(n, 1, 'withdrawal is recorded');
end
$$;

-- Each purpose moves only its own flag.
do $$
declare a uuid := (select v from fixture where k = 'a'); loc boolean; off boolean; note boolean;
begin
  perform test.become(a);
  perform record_consent('location', true, 'location-v1');
  select location_consent, offer_consent, notification_consent into loc, off, note from profiles where id = a;
  perform test.eq(loc, true, 'location purpose sets location_consent');
  perform test.eq(off, false, 'location purpose leaves offer_consent alone');
  perform test.eq(note, false, 'location purpose leaves notification_consent alone');
end
$$;

-- Denial: a direct UPDATE of any consent flag is refused, so no flag exists without its event.
do $$
declare a uuid := (select v from fixture where k = 'a');
begin
  perform test.become(a);
  perform test.raises(format($q$ update profiles set offer_consent = true where id = %L $q$, a),
    'a guest cannot set offer_consent directly');
  perform test.raises(format($q$ update profiles set location_consent = false where id = %L $q$, a),
    'a guest cannot clear location_consent directly');
  perform test.raises(format($q$ update profiles set notification_consent = true where id = %L $q$, a),
    'a guest cannot set notification_consent directly');
end
$$;

-- Denial: the function itself refuses bad input.
do $$
declare a uuid := (select v from fixture where k = 'a');
begin
  perform test.become(a);
  perform test.raises($q$ select record_consent('offers', true, '') $q$, 'a blank wording version is refused');
  perform test.raises($q$ select record_consent('offers', true, null) $q$, 'a missing wording version is refused');
  perform test.raises($q$ select record_consent('marketing', true, 'v1') $q$, 'an unknown purpose is refused');
  perform test.raises($q$ select record_consent('offers', null, 'v1') $q$, 'a null answer is refused');
end
$$;

-- Denial: events are not writable by a guest.
do $$
declare a uuid := (select v from fixture where k = 'a'); n integer;
begin
  perform test.become(a);
  perform test.raises(format($q$ insert into consent_events (user_id, purpose, granted, wording_version) values (%L, 'offers', true, 'v1') $q$, a),
    'a guest cannot write an event directly');
  update consent_events set granted = true where user_id = a;
  get diagnostics n = row_count;
  perform test.eq(n, 0, 'a guest has no UPDATE policy, so no event changes');
end
$$;

-- Isolation: a guest reads their own events and nobody else's.
do $$
declare a uuid := (select v from fixture where k = 'a'); b uuid := (select v from fixture where k = 'b'); n integer;
begin
  perform test.become(b);
  perform record_consent('notifications', true, 'notifications-v1');
  select count(*) into n from consent_events;
  perform test.eq(n, 1, 'b sees only their own events');
  select count(*) into n from consent_events where user_id = a;
  perform test.eq(n, 0, 'b sees none of a''s events');
end
$$;

-- Anonymous callers hold no EXECUTE.
do $$
begin
  perform test.ok(not has_function_privilege('anon', 'record_consent(text,boolean,text)', 'execute'),
    'anon holds no EXECUTE on record_consent');
  perform test.ok(has_function_privilege('authenticated', 'record_consent(text,boolean,text)', 'execute'),
    'authenticated holds EXECUTE on record_consent');
end
$$;

-- Even the service role cannot edit an event (the append-only trigger; RLS does not apply to it).
set local role service_role;
select test.raises($q$ update consent_events set granted = not granted $q$, 'no role can edit an event');

-- Erasure is not blocked: removing the account takes its events with it.
do $$
declare a uuid := (select v from fixture where k = 'a'); n integer;
begin
  delete from auth.users where id = a;
  select count(*) into n from consent_events where user_id = a;
  perform test.eq(n, 0, 'deleting the account removes its consent events');
end
$$;

rollback;
