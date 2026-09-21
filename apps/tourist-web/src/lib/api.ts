/**
 * Edge Function calls for the live (non-demo) booking path.
 */

import { supabase } from './supabase';

export { isLiveMode } from './supabase';

export interface CheckoutResponse {
  ok: true;
  checkoutUrl: string;
  bookingId: string;
  reference: string;
}

export interface CheckoutErrorResponse {
  ok: false;
  code: string;
  message: string;
}

export interface BookingStatusResponse {
  bookingId: string;
  status: 'pending_payment' | 'confirmed' | 'cancelled';
  reference: string;
  experienceId: string;
  availabilitySlotId: string;
  totalMinor: number;
  taxMinor: number;
  serviceFeeMinor: number;
  subtotalMinor: number;
  seats: number;
  createdAt: string;
  ticketToken: string | null;
}

export async function callCheckout(body: {
  userId: string;
  availabilitySlotId: string;
  lines: { optionId: string; quantity: number }[];
  promotionId: string | null;
  customerEmail: string | null;
  idempotencyKey: string;
  experienceId: string;
}): Promise<CheckoutResponse | CheckoutErrorResponse> {
  if (!supabase) throw new Error('callCheckout called in demo mode');

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/checkout-session`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    },
  );

  return res.json() as Promise<CheckoutResponse | CheckoutErrorResponse>;
}

export interface ResolvedSlot {
  slotId: string;
  experienceId: string;
  options: { id: string; kind: 'adult' | 'child' | 'addon'; label: string; unitAmountMinor: number }[];
}

export async function resolveSlot(params: {
  experienceTitle: string;
  dateISO: string;
  time: string;
}): Promise<ResolvedSlot | null> {
  if (!supabase) return null;
  const qs = new URLSearchParams({
    experience_title: params.experienceTitle,
    date: params.dateISO,
    time: params.time,
  });
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-slot?${qs}`,
    { method: 'GET' },
  );
  if (!res.ok) return null;
  return res.json() as Promise<ResolvedSlot>;
}

export async function pollBookingStatus(sessionId: string): Promise<BookingStatusResponse | null> {
  if (!supabase) return null;

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/booking-status?session_id=${encodeURIComponent(sessionId)}`,
    { method: 'GET' },
  );

  if (!res.ok) return null;
  return res.json() as Promise<BookingStatusResponse>;
}
