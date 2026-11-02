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
  rpc(
    fn: 'record_consent',
    args: { p_purpose: ConsentPurpose; p_granted: boolean; p_wording_version: string },
  ): PromiseLike<{ error: unknown }>;
  from(table: 'profiles'): {
    select(columns: 'offer_consent'): {
      eq(column: 'id', value: string): {
        maybeSingle(): PromiseLike<{ data: { offer_consent: boolean } | null; error: unknown }>;
      };
    };
  };
}

/** The two answers the app collects. Names match `consent_events.purpose`. */
export type ConsentPurpose = 'location' | 'offers';

export interface ConsentChange {
  purpose: ConsentPurpose;
  granted: boolean;
}

/**
 * The words the guest agrees to, per purpose. Screens render these strings, so the text the guest
 * saw and the text the version names are the same string; nothing else may re-type them.
 */
export const CONSENT_TEXT: Record<ConsentPurpose, string> = {
  location: 'Use my location',
  offers:
    'Get an offer from a local vendor when you are close to them. Offers need your location as well; it is a separate switch on the Explore screen.',
};

/**
 * Names the exact text a consent was given to: the purpose plus a hash of the text. Editing the
 * text changes the version with no one remembering to bump it, so a recorded version always
 * identifies one wording. FNV-1a, 32 bit: a label, not a security control.
 */
export function wordingVersion(purpose: ConsentPurpose): string {
  let hash = 0x811c9dc5;
  for (const ch of CONSENT_TEXT[purpose]) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${purpose}-${hash.toString(16).padStart(8, '0')}`;
}

export type ConsentFailure = 'demo' | 'signed-out' | 'failed';
export type ConsentWrite = { ok: true } | { ok: false; reason: ConsentFailure };
export type OfferConsentRead = { ok: true; offerConsent: boolean } | { ok: false; reason: ConsentFailure };

// A cast, not an assignment: checking the real client against `from()`'s generic overloads makes
// tsc give up ("excessively deep"). The narrow interface above is what the code relies on, and the
// tests drive it through a fake.
const appClient = supabase as unknown as ConsentClient | null;

/**
 * Record one consent answer for the signed-in guest.
 *
 * Goes through `record_consent()`, which updates the flag and appends the proof (who, when, which
 * wording) in one transaction; a direct update of a consent column is refused by the database. It
 * ignores an answer that restates the current one, so calling it on every start is safe.
 *
 * Does not create a session. A guest who has never signed in has no profile to write, and one flag
 * at its default (false) needs no row, so `signed-out` is returned and the caller decides whether
 * a session is worth creating.
 */
export async function writeConsent(
  change: ConsentChange,
  client: ConsentClient | null = appClient,
): Promise<ConsentWrite> {
  if (!client) return { ok: false, reason: 'demo' };
  try {
    const { data } = await client.auth.getSession();
    if (!data.session?.user.id) return { ok: false, reason: 'signed-out' };
    const { error } = await client.rpc('record_consent', {
      p_purpose: change.purpose,
      p_granted: change.granted,
      p_wording_version: wordingVersion(change.purpose),
    });
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
