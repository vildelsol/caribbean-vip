/**
 * Recording the guest's consent where the server can see it — LIVE MODE ONLY.
 *
 * `eligible-offer` decides from `profiles.location_consent` and `profiles.offer_consent`, never
 * from anything the app sends. Until those columns are written, no live offer can fire however
 * the guest answered in the app. This module writes them, and reads `offer_consent` back.
 *
 * Two flags, because they answer two questions: "may the app use my location" (the device
 * permission, mirrored by `locationConsent` in the store) and "may the app show me offers"
 * (`offer_consent`, held only on the server). The server requires both.
 *
 * Every function takes the client as a parameter, like `./account`. In demo mode that client is
 * null and each returns `{ ok: false, reason: 'demo' }` with no network and no throw.
 */

import { supabase } from './supabase';

/** The slice of the Supabase client this module uses, narrow so a test can hand in a fake. */
export interface ConsentClient {
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string } } | null } }>;
  };
  from(table: 'profiles'): {
    update(values: ConsentPatch): {
      eq(column: 'id', value: string): PromiseLike<{ error: unknown }>;
    };
    select(columns: 'offer_consent'): {
      eq(column: 'id', value: string): {
        maybeSingle(): PromiseLike<{ data: { offer_consent: boolean } | null; error: unknown }>;
      };
    };
  };
}

/** Column names, not store names: this is exactly what is written to the row. */
export type ConsentPatch = { location_consent: boolean } | { offer_consent: boolean };

export type ConsentFailure = 'demo' | 'signed-out' | 'failed';
export type ConsentWrite = { ok: true } | { ok: false; reason: ConsentFailure };
export type OfferConsentRead = { ok: true; offerConsent: boolean } | { ok: false; reason: ConsentFailure };

// A cast, not an assignment: checking the real client against `from()`'s generic overloads makes
// tsc give up ("excessively deep"). The narrow interface above is what the code relies on, and the
// tests drive it through a fake.
const appClient = supabase as unknown as ConsentClient | null;

/**
 * Write one consent flag to the signed-in guest's own profile row.
 *
 * Does not create a session. A guest who has never signed in has no profile to write, and one flag
 * at its default (false) needs no row, so `signed-out` is returned and the caller decides whether
 * a session is worth creating. RLS `profiles_self_update` is what limits the write to their row;
 * the `eq` only names it.
 */
export async function writeConsent(
  patch: ConsentPatch,
  client: ConsentClient | null = appClient,
): Promise<ConsentWrite> {
  if (!client) return { ok: false, reason: 'demo' };
  try {
    const { data } = await client.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return { ok: false, reason: 'signed-out' };
    const { error } = await client.from('profiles').update(patch).eq('id', userId);
    return error ? { ok: false, reason: 'failed' } : { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** The guest's recorded offer opt-in. A guest with no profile row has never opted in: false. */
export async function readOfferConsent(client: ConsentClient | null = appClient): Promise<OfferConsentRead> {
  if (!client) return { ok: false, reason: 'demo' };
  try {
    const { data } = await client.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return { ok: false, reason: 'signed-out' };
    const { data: row, error } = await client.from('profiles').select('offer_consent').eq('id', userId).maybeSingle();
    if (error) return { ok: false, reason: 'failed' };
    return { ok: true, offerConsent: row?.offer_consent === true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
