-- check_rate_limit(): one atomic "may this actor do this now" decision.
--
-- `rate_limit_events` has existed since the first migration but nothing wrote to it. This function
-- is what the Edge Functions call (service role only; no client can call it, so no client can fill the
-- table or read another actor's counts).
--
-- Atomic: a per-(actor, action) advisory lock serialises concurrent callers, so ten parallel
-- requests cannot all read "9 of 10" and all pass. The count and the insert happen under the lock.
-- A refused attempt is NOT recorded, so the window slides and a blocked actor is released once their
-- oldest allowed event ages out, instead of being locked out for as long as they keep retrying.
-- The limit and window are clamped, so a bug or a hostile caller cannot ask for "no limit".

create or replace function check_rate_limit(
  p_actor_key      text,
  p_action         text,
  p_limit          integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  win    interval;
  lim    integer;
  n      integer;
  oldest timestamptz;
  wait_s integer;
begin
  if p_actor_key is null or length(p_actor_key) = 0 or length(p_actor_key) > 200
     or p_action is null or length(p_action) = 0 or length(p_action) > 80 then
    raise exception 'check_rate_limit: actor and action are required' using errcode = '22023';
  end if;

  lim := greatest(1, least(coalesce(p_limit, 1), 1000));
  win := make_interval(secs => greatest(1, least(coalesce(p_window_seconds, 60), 86400)));

  perform pg_advisory_xact_lock(hashtextextended(p_actor_key || '|' || p_action, 0));

  select count(*), min(created_at) into n, oldest
    from rate_limit_events
   where actor_key = p_actor_key and action = p_action and created_at > now() - win;

  if n >= lim then
    wait_s := greatest(1, ceil(extract(epoch from (oldest + win - now())))::integer);
    return jsonb_build_object('allowed', false, 'retry_after_seconds', wait_s);
  end if;

  insert into rate_limit_events (actor_key, action) values (p_actor_key, p_action);
  return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
end
$$;

revoke execute on function check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant  execute on function check_rate_limit(text, text, integer, integer) to service_role;
