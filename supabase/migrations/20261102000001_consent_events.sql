-- Provable consent (GDPR Art 7(1)): who agreed to what, when, and to which wording.
--
-- `profiles.location_consent`, `offer_consent` and `notification_consent` say what the guest chose
-- last. They cannot say when, to what text, or that the choice was ever withdrawn. A regulator or a
-- guest can ask; this table answers. One row per change, never edited.
--
-- Writes go through record_consent() only. It updates the flag and appends the event in one
-- transaction, so the flag and its proof cannot disagree, and a guest cannot flip a flag directly:
-- guard_profile_consent() refuses an end-user UPDATE of any consent column made outside the
-- function. Service-role code (migrations, seeds, Edge Functions) is inside the trust boundary and
-- is not blocked, but it leaves no event; no Edge Function writes consent today.
--
-- Erasure: rows cascade with the profile. Whether proof of consent must outlive an erased account
-- is a question for counsel (docs/data-inventory.md), so nothing here prevents or forces it.

create table consent_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  purpose         text not null check (purpose in ('location', 'offers', 'notifications')),
  granted         boolean not null,
  -- Identifies the exact text the guest saw. The client names it; the text itself is in its source.
  wording_version text not null check (length(btrim(wording_version)) between 1 and 64),
  created_at      timestamptz not null default now()
);

create index consent_events_user_idx on consent_events (user_id, created_at desc);

-- Editing a row would rewrite what was agreed. Deletes are left open on purpose: they are how an
-- erased profile takes its rows with it (a cascade fires this kind of trigger too).
create trigger consent_events_no_update
  before update on consent_events
  for each row execute function forbid_mutation();

alter table consent_events enable row level security;

create policy consent_events_self_read on consent_events
  for select to authenticated
  using (user_id = auth.uid());

create policy consent_events_admin_read on consent_events
  for select to authenticated
  using (is_admin());

-- No insert policy: only record_consent() (security definer) writes.

create or replace function record_consent(p_purpose text, p_granted boolean, p_wording_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  current boolean;
begin
  if uid is null then
    raise exception 'sign in to record consent';
  end if;
  if p_purpose not in ('location', 'offers', 'notifications') then
    raise exception 'unknown consent purpose';
  end if;
  if p_granted is null then
    raise exception 'consent must be granted or withdrawn';
  end if;
  if p_wording_version is null or length(btrim(p_wording_version)) not between 1 and 64 then
    raise exception 'a wording version is required';
  end if;

  select case p_purpose
           when 'location' then location_consent
           when 'offers' then offer_consent
           else notification_consent
         end
    into current
    from profiles where id = uid for update;
  if not found then
    raise exception 'no profile for this user';
  end if;

  -- The app re-states the guest's answer whenever it starts. A restatement is not a new consent.
  if current = p_granted then
    return;
  end if;

  perform set_config('cvip.consent_rpc', 'on', true);
  update profiles set
    location_consent     = case when p_purpose = 'location' then p_granted else location_consent end,
    offer_consent        = case when p_purpose = 'offers' then p_granted else offer_consent end,
    notification_consent = case when p_purpose = 'notifications' then p_granted else notification_consent end
  where id = uid;
  perform set_config('cvip.consent_rpc', 'off', true);

  insert into consent_events (user_id, purpose, granted, wording_version)
  values (uid, p_purpose, p_granted, btrim(p_wording_version));
end;
$$;

comment on function record_consent(text, boolean, text) is
  'The only way an end user changes a consent flag. Updates the flag and appends a consent_events row atomically; a restatement of the current value writes nothing.';

revoke execute on function record_consent(text, boolean, text) from public, anon;
grant execute on function record_consent(text, boolean, text) to authenticated;

create or replace function guard_profile_consent()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
     and current_setting('cvip.consent_rpc', true) is distinct from 'on'
     and (new.location_consent is distinct from old.location_consent
          or new.offer_consent is distinct from old.offer_consent
          or new.notification_consent is distinct from old.notification_consent) then
    raise exception 'consent changes go through record_consent()';
  end if;
  return new;
end;
$$;

create trigger profiles_consent_guard
  before update on profiles
  for each row execute function guard_profile_consent();
