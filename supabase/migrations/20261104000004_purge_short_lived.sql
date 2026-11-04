-- Purge for data that was never meant to be kept: chat history, offer impressions, throttle events.
--
-- Separate from `purge_expired_records()` on purpose: that one removes legal-duty records after
-- 7 years and passes the retention floor; this one touches only short-lived tables, so a mistake
-- here can never reach a booking or payment (proven by test).
--   * ai_conversations: past `expires_at` (30 days from creation by default).
--   * promotion_impressions: older than its geofence's cooldown plus one day (a day, when the geofence is gone). The impression only
--     exists so the cooldown works; after the cooldown nothing reads it, and it records where a guest was.
--   * rate_limit_events: older than 7 days. Nothing writes this table yet; the bound is ready for it.
--
-- Service role only; no arguments, so a caller cannot aim it or change the windows. Every run writes
-- one counts-only audit_logs row. Nothing schedules it yet.

create or replace function purge_short_lived_records() returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n_ai integer;
  n_imp integer;
  n_rl integer;
begin
  delete from ai_conversations where expires_at < now();
  get diagnostics n_ai = row_count;

  delete from promotion_impressions i
   where i.shown_at < now() - make_interval(mins => coalesce(
           (select g.cooldown_minutes from geofences g where g.id = i.geofence_id), 1440)) - interval '1 day';
  get diagnostics n_imp = row_count;

  delete from rate_limit_events where created_at < now() - interval '7 days';
  get diagnostics n_rl = row_count;

  insert into audit_logs (action, entity_type, after)
  values ('retention.purge_short_lived', 'retention', jsonb_build_object(
    'ai_conversations_removed', n_ai, 'promotion_impressions_removed', n_imp, 'rate_limit_events_removed', n_rl));

  return jsonb_build_object('ai_conversations_removed', n_ai, 'promotion_impressions_removed', n_imp,
                            'rate_limit_events_removed', n_rl);
end
$$;

revoke execute on function purge_short_lived_records() from public, anon, authenticated;
grant execute on function purge_short_lived_records() to service_role;
