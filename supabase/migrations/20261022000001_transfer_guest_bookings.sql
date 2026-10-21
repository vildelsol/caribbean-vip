-- Move an anonymous guest's bookings into the account they sign in to.
--
-- A live-mode tourist is an anonymous Supabase user. Signing in to an existing account replaces
-- that session, and the bookings stay on the anonymous user id, which only that phone's storage can
-- reach. The Edge Function that calls this (not yet written; it needs a real project to verify
-- against) proves control of BOTH identities with verified tokens and passes the two ids here.
--
-- This function therefore TRUSTS ITS ARGUMENTS, exactly like the redeem_voucher_by_hash engine, and
-- so it is executable by the service role only. A caller who could name arbitrary ids could pull
-- any anonymous guest's tickets into their own account. The conditions below are the second line:
-- a bug in the caller can still only move bookings OUT of an anonymous user and INTO an account
-- with a confirmed email, never out of a real account.
--
-- What moves: the guest's bookings, whatever their status (the Stripe webhook confirms by booking
-- id, so a payment that lands after the move still lands on the right booking), and the vouchers
-- issued to them. What does not: trips and saved items have uniqueness rules that two users'
-- rows can collide on, and the tourist app builds its Trips from bookings. The anonymous user is
-- left in place, empty.
--
-- Idempotent: once moved there is nothing left to move, so a second call returns 0 and writes no
-- audit row. Returns the number of bookings moved.

create or replace function transfer_guest_bookings(p_from uuid, p_to uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  from_anonymous boolean;
  to_anonymous   boolean;
  to_confirmed   timestamptz;
  moved_ids      uuid[];
  moved_vouchers integer;
begin
  if p_from is null or p_to is null then
    raise exception 'transfer_guest_bookings: both users are required';
  end if;
  if p_from = p_to then
    raise exception 'transfer_guest_bookings: source and target are the same user';
  end if;

  select u.is_anonymous into from_anonymous from auth.users u where u.id = p_from;
  if not found then
    raise exception 'transfer_guest_bookings: source user does not exist';
  end if;
  if from_anonymous is not true then
    raise exception 'transfer_guest_bookings: source is not an anonymous guest';
  end if;

  select u.is_anonymous, u.email_confirmed_at into to_anonymous, to_confirmed
    from auth.users u where u.id = p_to;
  if not found then
    raise exception 'transfer_guest_bookings: target user does not exist';
  end if;
  if to_anonymous is not false or to_confirmed is null then
    raise exception 'transfer_guest_bookings: target is not an account with a confirmed email';
  end if;

  with moved as (
    update bookings set user_id = p_to where user_id = p_from returning id
  )
  select coalesce(array_agg(id), '{}') into moved_ids from moved;

  update vouchers set user_id = p_to where user_id = p_from;
  get diagnostics moved_vouchers = row_count;

  if coalesce(array_length(moved_ids, 1), 0) > 0 then
    insert into audit_logs (actor_user_id, action, entity_type, entity_id, before, after, reason)
    values (
      p_to,
      'guest_bookings_transferred',
      'profiles',
      p_to,
      jsonb_build_object('from_user', p_from, 'booking_ids', to_jsonb(moved_ids)),
      jsonb_build_object('to_user', p_to, 'bookings', array_length(moved_ids, 1), 'vouchers', moved_vouchers),
      'anonymous guest signed in to an existing account'
    );
  end if;

  return coalesce(array_length(moved_ids, 1), 0);
end;
$$;

-- Both lines are needed: a PUBLIC grant applies to every role, and Supabase also grants EXECUTE to
-- anon directly on new functions. Revoking from one and not the other reads as a fix and changes
-- nothing. Only the Edge Function, running as service_role, may call this.
revoke execute on function transfer_guest_bookings(uuid, uuid) from public;
revoke execute on function transfer_guest_bookings(uuid, uuid) from anon;
revoke execute on function transfer_guest_bookings(uuid, uuid) from authenticated;
grant execute on function transfer_guest_bookings(uuid, uuid) to service_role;

comment on function transfer_guest_bookings(uuid, uuid) is
  'Moves an anonymous guest''s bookings and vouchers to an account with a confirmed email. Trusts its arguments: service_role only.';
