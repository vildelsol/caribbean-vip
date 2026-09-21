/**
 * Edge Function calls for the live (non-demo) booking path.
 */

import { supabase } from './supabase';

export { isLiveMode } from './supabase';

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/**
 * Every Edge Function except `stripe-webhook` is deployed with `verify_jwt = true`, so the
 * platform rejects a request with no credential before our handler runs. The anon key is the
 * publishable one — it is compiled into the bundle by design and grants nothing RLS does not.
 */
function anonHeaders(): Record<string, string> {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return key ? { apikey: key, Authorization: `Bearer ${key}` } : {};
}

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

/**
 * The signed-in user's id for the live booking path, signing in anonymously if needed.
 *
 * `bookings.user_id` is `uuid not null references profiles(id)`, and a profile row exists only
 * because the `handle_new_user()` trigger writes one for every `auth.users` insert — including an
 * anonymous one. So this must return a real auth id: a locally generated UUID would pass the
 * request schema and then be rejected by the foreign key.
 *
 * Returns null if sign-in fails, which the caller must surface rather than swallow.
 *
 * Requires anonymous sign-in to be enabled in the Supabase Auth dashboard.
 */
export async function ensureLiveUser(): Promise<string | null> {
  if (!supabase) return null;

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) return null;
  return data.user.id;
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

  const res = await fetch(`${FUNCTIONS_BASE}/checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...anonHeaders(),
      // A signed-in guest's own token supersedes the anon key when there is one.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

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
  const res = await fetch(`${FUNCTIONS_BASE}/resolve-slot?${qs}`, {
    method: 'GET',
    headers: anonHeaders(),
  });
  if (!res.ok) return null;
  return res.json() as Promise<ResolvedSlot>;
}

export async function pollBookingStatus(sessionId: string): Promise<BookingStatusResponse | null> {
  if (!supabase) return null;

  const res = await fetch(
    `${FUNCTIONS_BASE}/booking-status?session_id=${encodeURIComponent(sessionId)}`,
    { method: 'GET', headers: anonHeaders() },
  );

  if (!res.ok) return null;
  return res.json() as Promise<BookingStatusResponse>;
}
