-- Issue a voucher for a standalone promotion, and count it, in one step.
--
-- `issued_count` is the counter behind `inventory_limit`. 20261031000001 made it writable only by
-- the system; this is the system writing it. Counting and inserting are one function so a voucher
-- cannot exist without the count, or the count without the voucher, and so the last unit of
-- inventory can be claimed by exactly one caller.
--
-- The promotion row is locked first (`for update`). Every claim of the same promotion queues on
-- that lock, so the checks below read a count nobody else is changing: two guests racing for the
-- last unit are decided one after the other, not both let through. The table's own
-- `issued_count <= inventory_limit` check is the last line of defence, not the first.
--
-- Outcomes, text so the Edge Function can map them without parsing an error:
--   claimed          a voucher was inserted and issued_count moved by one
--   already_claimed  the guest already holds a live voucher for this promotion (same states as
--                    `claimedPromotionIds`), so nothing is counted twice
--   sold_out         inventory_limit reached
--   not_available    no such promotion, not approved, or outside its window
--
-- Eligibility (consent, geofence, vendor status) stays in `eligible-offer`; this function only
-- guards what must be atomic with the count. Executable by the service role only, like
-- `reserve_availability`, and revoked from PUBLIC *and* anon/authenticated: the PUBLIC grant alone
-- covers every role, so revoking the named roles first would change nothing.

create or replace function claim_promotion_voucher(
  p_promotion_id uuid,
  p_user_id      uuid,
  p_token_hash   text,
  p_valid_until  timestamptz
)
returns table (outcome text, voucher_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  promo promotions%rowtype;
  v_id  uuid;
begin
  select * into promo from promotions where id = p_promotion_id for update;

  if not found
     or promo.approval_state <> 'approved'
     or now() < promo.starts_at
     or now() > promo.ends_at then
    return query select 'not_available'::text, null::uuid;
    return;
  end if;

  if exists (
    select 1 from vouchers
     where promotion_id = p_promotion_id
       and user_id = p_user_id
       and state in ('issued', 'saved', 'attached_to_booking', 'active', 'redeemed')
  ) then
    return query select 'already_claimed'::text, null::uuid;
    return;
  end if;

  if promo.inventory_limit is not null and promo.issued_count >= promo.inventory_limit then
    return query select 'sold_out'::text, null::uuid;
    return;
  end if;

  insert into vouchers (token_hash, user_id, promotion_id, vendor_org_id, valid_until)
  values (p_token_hash, p_user_id, p_promotion_id, promo.vendor_org_id,
          least(p_valid_until, promo.ends_at))
  returning id into v_id;

  update promotions set issued_count = issued_count + 1 where id = p_promotion_id;

  return query select 'claimed'::text, v_id;
end;
$$;

revoke execute on function claim_promotion_voucher(uuid, uuid, text, timestamptz) from public;
revoke execute on function claim_promotion_voucher(uuid, uuid, text, timestamptz) from anon, authenticated;
grant execute on function claim_promotion_voucher(uuid, uuid, text, timestamptz) to service_role;
