-- A claimed standalone offer voucher must be redeemable.
--
-- `claim_promotion_voucher` inserted offer vouchers in the default state 'issued'. The redemption
-- engine only redeems 'active' vouchers, and no path activates an offer voucher that has no
-- booking, so every standalone claim scanned as not_yet_valid at the door. Found by
-- `supabase/tests/claim_then_redeem.test.sql`, which joins the two halves for the first time.
--
-- Fix: a promotion with requires_booking = false yields an 'active' voucher at claim. One with
-- requires_booking = true is unchanged ('issued', until its booking attaches it). Existing
-- vouchers in that state are activated below; 'issued' to 'active' is a legal transition.
-- Grants are unchanged by create or replace.

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

  -- A standalone promotion's voucher is usable at the door as soon as it exists. The scanner only
  -- redeems 'active' vouchers, and nothing else activates an offer voucher with no booking, so the
  -- default 'issued' made every standalone claim scan as not_yet_valid. A promotion that requires a
  -- booking stays 'issued' until the booking attaches it.
  insert into vouchers (token_hash, user_id, promotion_id, vendor_org_id, valid_until, state)
  values (p_token_hash, p_user_id, p_promotion_id, promo.vendor_org_id,
          least(p_valid_until, promo.ends_at),
          case when promo.requires_booking then 'issued'::voucher_state else 'active'::voucher_state end)
  returning id into v_id;

  update promotions set issued_count = issued_count + 1 where id = p_promotion_id;

  return query select 'claimed'::text, v_id;
end;
$$;

update vouchers v
   set state = 'active'
  from promotions p
 where p.id = v.promotion_id
   and v.state = 'issued'
   and v.booking_id is null
   and not p.requires_booking
   and v.valid_until > now();
