-- check_rate_limit(): the limiter the Edge Functions call.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;
begin;

set local role service_role;

do $$
declare r jsonb; i integer;
begin
  for i in 1..3 loop
    r := check_rate_limit('user:t1', 'checkout', 3, 600);
    perform test.eq((r->>'allowed')::boolean, true, 'attempt ' || i || ' of 3 is allowed');
  end loop;

  r := check_rate_limit('user:t1', 'checkout', 3, 600);
  perform test.eq((r->>'allowed')::boolean, false, 'the 4th attempt is refused');
  perform test.ok((r->>'retry_after_seconds')::int between 1 and 600, 'a retry time is given');

  -- A refused attempt is not recorded, so retrying does not extend the block.
  perform check_rate_limit('user:t1', 'checkout', 3, 600);
  perform test.eq((select count(*)::int from rate_limit_events where actor_key = 'user:t1'), 3,
                  'refused attempts are not written');

  -- Keys are independent: another actor, and another action for the same actor.
  perform test.eq((check_rate_limit('user:t2', 'checkout', 3, 600)->>'allowed')::boolean, true, 'another actor is unaffected');
  perform test.eq((check_rate_limit('user:t1', 'claim_offer', 3, 600)->>'allowed')::boolean, true, 'another action is unaffected');

  -- The window slides: events older than the window stop counting.
  update rate_limit_events set created_at = now() - interval '11 minutes' where actor_key = 'user:t1';
  perform test.eq((check_rate_limit('user:t1', 'checkout', 3, 600)->>'allowed')::boolean, true, 'old events age out of the window');

  -- Clamping: a hostile caller cannot ask for no limit.
  for i in 1..1000 loop insert into rate_limit_events (actor_key, action) values ('user:big', 'x'); end loop;
  perform test.eq((check_rate_limit('user:big', 'x', 2000000000, 600)->>'allowed')::boolean, false, 'limit is clamped to 1000');
  perform test.eq((check_rate_limit('user:z', 'x', 0, 600)->>'allowed')::boolean, true, 'a limit of 0 is raised to 1');
  perform test.eq((check_rate_limit('user:z', 'x', 0, 600)->>'allowed')::boolean, false, 'and then enforced');
end $$;

select test.raises($q$ select check_rate_limit('', 'a', 1, 1) $q$, 'an empty actor is refused');
select test.raises($q$ select check_rate_limit('a', repeat('x', 81), 1, 1) $q$, 'an over-long action is refused');

-- Privileges: only the service role can call it, so no client can fill or probe the table.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    perform test.ok(not has_function_privilege(r, 'check_rate_limit(text,text,integer,integer)', 'execute'),
                    r || ' cannot execute check_rate_limit');
  end loop;
  perform test.ok(has_function_privilege('service_role', 'check_rate_limit(text,text,integer,integer)', 'execute'),
                  'service_role can (control)');
end $$;

rollback;
