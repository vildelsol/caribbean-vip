-- purge_short_lived_records(): removes expired chat, spent offer impressions and old throttle rows;
-- keeps live ones; never touches bookings or payments; service role only.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;
set local role service_role;

do $$
declare
  u uuid; org uuid; slot uuid; exp uuid; promo uuid; geo uuid; bk uuid; res jsonb; cd integer;
begin
  insert into auth.users (email) values ('short@test.local') returning id into u;
  select g.promotion_id, g.id, g.cooldown_minutes into promo, geo, cd from geofences g limit 1;
  select s.id, s.experience_id into slot, exp from availability_slots s limit 1;
  select e.vendor_org_id into org from experiences e where e.id = exp;

  insert into ai_conversations (user_id, session_id, expires_at) values
    (u, 'expired', now() - interval '1 day'), (u, 'live', now() + interval '1 day');

  insert into promotion_impressions (promotion_id, geofence_id, user_id, shown_at) values
    (promo, geo, u, now() - make_interval(mins => cd) - interval '2 days'),   -- spent
    (promo, geo, u, now() - interval '1 minute');                            -- still in cooldown

  insert into rate_limit_events (actor_key, action, created_at) values
    ('k', 'a', now() - interval '8 days'), ('k', 'a', now());

  insert into bookings (user_id, vendor_org_id, experience_id, availability_slot_id, reference, currency,
                        subtotal_minor, total_minor, seats)
  values (u, org, exp, slot, 'SHORT-' || substr(gen_random_uuid()::text, 1, 6), 'USD', 1000, 1000, 1)
  returning id into bk;
  insert into payments (booking_id, currency, amount_minor) values (bk, 'USD', 1000);

  res := purge_short_lived_records();

  perform test.eq((res ->> 'ai_conversations_removed')::int, 1, 'removes the expired chat');
  perform test.eq((select count(*)::int from ai_conversations where user_id = u), 1, 'keeps the live chat');
  perform test.eq((res ->> 'promotion_impressions_removed')::int, 1, 'removes the spent impression');
  perform test.eq((select count(*)::int from promotion_impressions where user_id = u), 1,
    'keeps an impression still inside its cooldown');
  perform test.eq((res ->> 'rate_limit_events_removed')::int, 1, 'removes the old throttle row');
  perform test.eq((select count(*)::int from rate_limit_events), 1, 'keeps the recent throttle row');
  perform test.eq((select count(*)::int from bookings where id = bk), 1, 'never touches a booking');
  perform test.eq((select count(*)::int from payments where booking_id = bk), 1, 'never touches a payment');
  perform test.eq((select count(*)::int from audit_logs where action = 'retention.purge_short_lived'), 1,
    'the run is written to the audit log');
end
$$;

set local role authenticated;
do $$ begin
  perform test.raises('select purge_short_lived_records()', 'an authenticated user cannot run it');
end $$;
set local role anon;
do $$ begin
  perform test.raises('select purge_short_lived_records()', 'anon cannot run it');
end $$;

rollback;
