/**
 * Supabase implementation of BookingStore (AD-02).
 *
 * Always uses the service-role client — this runs inside an Edge Function that already
 * requires the service-role key to be present. RLS is deliberately bypassed here: the
 * Edge Function is the auth boundary, and the store must be able to read/write on behalf
 * of any authenticated guest.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@^2';
import type {
  BookingRecord,
  BookingStore,
  OptionSnapshot,
  PaymentRecord,
  PromotionSnapshot,
  SlotSnapshot,
} from '@cvip/payments';
import type { BookingStatus, Currency, VoucherState } from '@cvip/types';

export function makeSupabaseStore(supabase: SupabaseClient): BookingStore {
  return {
    async getSlot(slotId) {
      const { data, error } = await supabase
        .from('availability_slots')
        .select('id, experience_id, starts_at, ends_at, capacity, booked_count, status, experiences!inner(vendor_org_id)')
        .eq('id', slotId)
        .single();
      if (error || !data) return null;
      const exp = data.experiences as { vendor_org_id: string };
      return {
        id: data.id,
        experienceId: data.experience_id,
        vendorOrgId: exp.vendor_org_id,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
        capacity: data.capacity,
        bookedCount: data.booked_count,
        status: data.status as SlotSnapshot['status'],
      };
    },

    async getOptions(experienceId) {
      const { data, error } = await supabase
        .from('experience_options')
        .select('id, experience_id, label, unit_amount_minor, currency, occupies_capacity, is_active')
        .eq('experience_id', experienceId);
      if (error || !data) return [];
      return data.map((r): OptionSnapshot => ({
        id: r.id,
        experienceId: r.experience_id,
        label: r.label,
        unitAmountMinor: r.unit_amount_minor,
        currency: r.currency as Currency,
        occupiesCapacity: r.occupies_capacity,
        isActive: r.is_active,
      }));
    },

    async getPromotion(promotionId) {
      const { data, error } = await supabase
        .from('promotions')
        .select(`
          id, vendor_org_id, title, value_kind, value_amount_minor, value_rate,
          starts_at, ends_at, inventory_limit, issued_count, requires_booking, approval_state,
          promotion_experiences(experience_id)
        `)
        .eq('id', promotionId)
        .single();
      if (error || !data) return null;
      const appliesToExperienceIds = (data.promotion_experiences as { experience_id: string }[])
        .map((r) => r.experience_id);
      return {
        id: data.id,
        vendorOrgId: data.vendor_org_id,
        title: data.title,
        valueKind: data.value_kind as PromotionSnapshot['valueKind'],
        valueAmountMinor: data.value_amount_minor,
        valueRate: data.value_rate ? Number(data.value_rate) : null,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
        inventoryLimit: data.inventory_limit,
        issuedCount: data.issued_count,
        requiresBooking: data.requires_booking,
        approvalState: data.approval_state as PromotionSnapshot['approvalState'],
        appliesToExperienceIds,
      };
    },

    async getPricingConfig() {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', ['pricing.tax_rate', 'pricing.service_fee_rate', 'pricing.commission_rate']);
      if (error || !data) throw new Error('Failed to load pricing config');
      const byKey = Object.fromEntries(data.map((r) => [r.key, r.value]));
      return {
        taxRate: Number(byKey['pricing.tax_rate'] ?? 0.15),
        serviceFeeRate: Number(byKey['pricing.service_fee_rate'] ?? 0.05),
        commissionRate: Number(byKey['pricing.commission_rate'] ?? 0.12),
      };
    },

    async getSettlementCurrency() {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'pricing.settlement_currency')
        .single();
      if (error || !data) return 'USD';
      return (data.value as string).replace(/"/g, '') as Currency;
    },

    async reserveCapacity(slotId, seats) {
      const { data, error } = await supabase.rpc('reserve_availability', {
        slot_id: slotId,
        seats,
      });
      if (error) throw error;
      return data === true;
    },

    async releaseCapacity(slotId, seats) {
      const { error } = await supabase.rpc('release_availability', {
        slot_id: slotId,
        seats,
      });
      if (error) throw error;
    },

    async findBookingByIdempotencyKey(key) {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('idempotency_key', key)
        .single();
      if (error || !data) return null;
      return rowToBooking(data);
    },

    async createBooking(input) {
      const { data, error } = await supabase
        .from('bookings')
        .insert({
          user_id: input.userId,
          vendor_org_id: input.vendorOrgId,
          experience_id: input.experienceId,
          availability_slot_id: input.availabilitySlotId,
          promotion_id: input.promotionId,
          reference: input.reference,
          status: input.status,
          currency: input.currency,
          subtotal_minor: input.subtotalMinor,
          discount_minor: input.discountMinor,
          tax_minor: input.taxMinor,
          service_fee_minor: input.serviceFeeMinor,
          total_minor: input.totalMinor,
          commission_minor: input.commissionMinor,
          seats: input.seats,
          idempotency_key: input.idempotencyKey,
        })
        .select()
        .single();
      if (error || !data) throw error ?? new Error('createBooking returned no data');
      return rowToBooking(data);
    },

    async updateBookingStatus(bookingId, status) {
      const { error } = await supabase
        .from('bookings')
        .update({ status })
        .eq('id', bookingId);
      if (error) throw error;
    },

    async getBooking(bookingId) {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .single();
      if (error || !data) return null;
      return rowToBooking(data);
    },

    async createGuestLines(bookingId, lines) {
      const rows = lines.map((l) => ({
        booking_id: bookingId,
        experience_option_id: l.optionId,
        quantity: l.quantity,
        unit_amount_minor: l.unitAmountMinor,
      }));
      const { error } = await supabase.from('booking_guests').insert(rows);
      if (error) throw error;
    },

    async upsertPaymentForCheckout(input) {
      const { data, error } = await supabase
        .from('payments')
        .upsert(
          {
            booking_id: input.bookingId,
            amount_minor: input.amountMinor,
            currency: input.currency,
            stripe_checkout_session_id: input.stripeCheckoutSessionId,
            status: 'pending',
          },
          { onConflict: 'stripe_checkout_session_id' },
        )
        .select()
        .single();
      if (error || !data) throw error ?? new Error('upsertPaymentForCheckout returned no data');
      return rowToPayment(data);
    },

    async recordPaymentEvent(input) {
      // Find the payment record by session id or payment intent id.
      const filter = input.stripeCheckoutSessionId
        ? { stripe_checkout_session_id: input.stripeCheckoutSessionId }
        : { stripe_payment_intent_id: input.stripePaymentIntentId };

      const { data: payment, error: findError } = await supabase
        .from('payments')
        .select('*')
        .match(filter)
        .maybeSingle();
      if (findError) throw findError;
      if (!payment) return { alreadyProcessed: false, payment: null };

      const update: Record<string, unknown> = {
        stripe_event_id: input.stripeEventId,
        status: input.status,
      };
      if (input.stripePaymentIntentId) update.stripe_payment_intent_id = input.stripePaymentIntentId;
      if (input.paidAt) update.paid_at = input.paidAt.toISOString();

      const { data: updated, error: updateError } = await supabase
        .from('payments')
        .update(update)
        .eq('id', payment.id)
        .select()
        .single();

      // A unique_violation on stripe_event_id means this event was already processed.
      if (updateError) {
        if ((updateError as { code?: string }).code === '23505') {
          return { alreadyProcessed: true, payment: null };
        }
        throw updateError;
      }

      return { alreadyProcessed: false, payment: updated ? rowToPayment(updated) : null };
    },

    async findBookingByCheckoutSession(sessionId) {
      const { data, error } = await supabase
        .from('payments')
        .select('bookings!inner(*)')
        .eq('stripe_checkout_session_id', sessionId)
        .single();
      if (error || !data) return null;
      const booking = (data as { bookings: Record<string, unknown> }).bookings;
      return rowToBooking(booking);
    },

    async issueVoucher(input) {
      const { data, error } = await supabase
        .from('vouchers')
        .insert({
          token_hash: input.tokenHash,
          user_id: input.userId,
          booking_id: input.bookingId,
          promotion_id: input.promotionId,
          vendor_org_id: input.vendorOrgId,
          state: input.state as VoucherState,
          valid_from: input.validFrom.toISOString(),
          valid_until: input.validUntil.toISOString(),
        })
        .select('id')
        .single();
      if (error || !data) throw error ?? new Error('issueVoucher returned no data');
      return { id: data.id };
    },

    async addBookingToTrip(input) {
      // Get island_id via the booking's experience if not supplied.
      let islandId = input.islandId || null;
      if (!islandId) {
        const { data: exp } = await supabase
          .from('bookings')
          .select('experiences!inner(island_id)')
          .eq('id', input.bookingId)
          .single();
        if (exp) {
          const e = (exp as { experiences: { island_id: string } }).experiences;
          islandId = e.island_id;
        }
      }

      // Find or create the user's trip for this island.
      let tripId: string | null = null;
      const { data: existing } = await supabase
        .from('trips')
        .select('id')
        .eq('user_id', input.userId)
        .eq('island_id', islandId)
        .maybeSingle();

      if (existing) {
        tripId = existing.id;
      } else {
        const { data: created, error: createErr } = await supabase
          .from('trips')
          .insert({ user_id: input.userId, island_id: islandId, destination_id: input.destinationId })
          .select('id')
          .single();
        if (createErr || !created) throw createErr ?? new Error('addBookingToTrip: trip creation failed');
        tripId = created.id;
      }

      const { error } = await supabase.from('trip_items').insert({
        trip_id: tripId,
        kind: 'booking',
        booking_id: input.bookingId,
        scheduled_at: input.scheduledAt,
      });
      if (error) throw error;
    },
  };
}

// ---------------------------------------------------------------------------
// Row mappers — snake_case DB → camelCase port types
// ---------------------------------------------------------------------------

function rowToBooking(row: Record<string, unknown>): BookingRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    vendorOrgId: row.vendor_org_id as string,
    experienceId: row.experience_id as string,
    availabilitySlotId: row.availability_slot_id as string,
    promotionId: row.promotion_id as string | null,
    reference: row.reference as string,
    status: row.status as BookingStatus,
    currency: row.currency as Currency,
    subtotalMinor: row.subtotal_minor as number,
    discountMinor: row.discount_minor as number,
    taxMinor: row.tax_minor as number,
    serviceFeeMinor: row.service_fee_minor as number,
    totalMinor: row.total_minor as number,
    commissionMinor: row.commission_minor as number,
    seats: row.seats as number,
    idempotencyKey: row.idempotency_key as string | null,
  };
}

function rowToPayment(row: Record<string, unknown>): PaymentRecord {
  return {
    id: row.id as string,
    bookingId: row.booking_id as string,
    status: row.status as PaymentRecord['status'],
    amountMinor: row.amount_minor as number,
    currency: row.currency as Currency,
    stripeCheckoutSessionId: row.stripe_checkout_session_id as string | null,
    stripePaymentIntentId: row.stripe_payment_intent_id as string | null,
    stripeEventId: row.stripe_event_id as string | null,
  };
}
