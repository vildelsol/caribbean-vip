-- The gate in front of removing a guest's sign-in (the Auth user), after they have erased their data.
--
-- `erase_my_data()` scrubs the profile and keeps bookings. Removing the login itself needs the Auth
-- admin API, which only an Edge Function can call. That function decides nothing: it asks this one.
--
-- Fails closed in five ways, each proven by a test that fails without it:
--   * `privacy.account_removal_enabled` must be exactly `true`. It is seeded `false`. Deleting the
--     Auth user cascades `consent_events`, so the proof of consent goes with the account, and whether
--     that proof must outlive an erased account is a question for counsel (data-inventory.md). Until
--     counsel answers, nothing can be removed. Anything other than boolean true counts as off.
--   * The caller must have erased their data in the last hour: a completed `erasure` row in
--     `privacy_requests`. Removal follows an erasure; it never replaces one.
--   * The guest must hold no bookings. `bookings.user_id` is ON DELETE RESTRICT, so the database
--     would refuse anyway; this answers before the attempt, in words.
--   * Tourist accounts only. Staff are removed by an administrator.
--   * Service role only: revoked from public, anon and authenticated. The subject is the argument,
--     which is safe only because the Edge Function takes it from `auth.getUser(token)`.
--
-- A decision to proceed is recorded in `privacy_requests` as `account_removal` (append-only, no link
-- to the profile), so the removal is accountable after the account is gone.

alter table privacy_requests drop constraint privacy_requests_request_type_check;
alter table privacy_requests add constraint privacy_requests_request_type_check
  check (request_type in ('export', 'erasure', 'account_removal'));

insert into platform_settings (key, value, description)
values (
  'privacy.account_removal_enabled',
  'false'::jsonb,
  'Whether a guest may remove their sign-in after erasing their data. Leave false until counsel has ruled on consent proof (it is deleted with the account). Only boolean true enables it.'
)
on conflict (key) do nothing;

create or replace function begin_account_removal(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  prof profiles%rowtype;
  enabled jsonb;
begin
  select value into enabled from platform_settings where key = 'privacy.account_removal_enabled';
  if enabled is distinct from 'true'::jsonb then
    return 'disabled';
  end if;

  select * into prof from profiles where id = p_user_id;
  if not found or prof.role <> 'tourist' then
    return 'not_tourist';
  end if;

  if not exists (
    select 1 from privacy_requests
     where subject_id = p_user_id and request_type = 'erasure'
       and received_at > now() - interval '1 hour'
  ) then
    return 'not_erased';
  end if;

  if exists (select 1 from bookings where user_id = p_user_id) then
    return 'has_bookings';
  end if;

  insert into privacy_requests (subject_id, request_type, outcome)
  values (p_user_id, 'account_removal', '{}'::jsonb);

  return 'ok';
end;
$$;

comment on function begin_account_removal(uuid) is
  'Decides whether the sign-in of p_user_id may be removed, and records the decision. Returns ok, disabled, not_tourist, not_erased or has_bookings. Service role only.';

revoke execute on function begin_account_removal(uuid) from public, anon, authenticated;
grant execute on function begin_account_removal(uuid) to service_role;
