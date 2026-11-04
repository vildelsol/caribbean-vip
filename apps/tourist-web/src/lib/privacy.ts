/**
 * The guest's own data rights — LIVE MODE ONLY.
 *
 * `export_my_data()` returns everything held about the signed-in guest. `erase_my_data()` removes
 * or scrubs what is not under a legal retention duty and says what stays. Both act on `auth.uid()`
 * inside the database: nothing here names a subject, so a guest can only reach their own rows.
 *
 * Every function takes the client as a parameter, like `./consent`. In demo mode that client is
 * null and each returns `{ ok: false, reason: 'demo' }` with no network and no throw.
 */

import { appOffersClient, type OffersClient } from './offers';
import { supabase } from './supabase';

/** The slice of the Supabase client this module uses, narrow so a test can hand in a fake. */
export interface PrivacyClient {
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string } } | null } }>;
  };
  rpc(fn: 'export_my_data' | 'erase_my_data'): PromiseLike<{ data: unknown; error: unknown }>;
}

export type PrivacyFailure = 'demo' | 'signed-out' | 'failed';

export type ExportResult = { ok: true; json: string; filename: string } | { ok: false; reason: PrivacyFailure };

/** What `erase_my_data()` reports: how many bookings stay, and whether the account can go. */
export interface ErasureOutcome {
  bookingsRetained: number;
  accountRemovable: boolean;
}

export type EraseResult = ({ ok: true } & ErasureOutcome) | { ok: false; reason: PrivacyFailure };

// A cast, not an assignment, for the same reason as `./consent`: the real client's rpc overloads
// make tsc give up. The narrow interface above is what the code relies on.
const appClient = supabase as unknown as PrivacyClient | null;

/** Pretty JSON of the export, named for the day it was taken. */
export function exportFilename(now: Date = new Date()): string {
  return `caribbean-vip-my-data-${now.toISOString().slice(0, 10)}.json`;
}

/** Read the server's erasure report defensively: a malformed one must not claim an erasure it cannot describe. */
export function parseErasure(data: unknown): ErasureOutcome | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.erased !== true) return null;
  const retained = d.bookings_retained;
  if (typeof retained !== 'number' || !Number.isInteger(retained) || retained < 0) return null;
  return { bookingsRetained: retained, accountRemovable: d.account_removable === true };
}

async function signedIn(client: PrivacyClient): Promise<boolean> {
  const { data } = await client.auth.getSession();
  return Boolean(data.session?.user.id);
}

/** Everything held about the signed-in guest, as a JSON document ready to save. Logs a privacy request. */
export async function exportMyData(client: PrivacyClient | null = appClient): Promise<ExportResult> {
  if (!client) return { ok: false, reason: 'demo' };
  try {
    if (!(await signedIn(client))) return { ok: false, reason: 'signed-out' };
    const { data, error } = await client.rpc('export_my_data');
    if (error || data === null || typeof data !== 'object') return { ok: false, reason: 'failed' };
    return { ok: true, json: JSON.stringify(data, null, 2), filename: exportFilename() };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** Erase or scrub the signed-in guest's personal data. Bookings and payments stay; the report says how many. */
export async function eraseMyData(client: PrivacyClient | null = appClient): Promise<EraseResult> {
  if (!client) return { ok: false, reason: 'demo' };
  try {
    if (!(await signedIn(client))) return { ok: false, reason: 'signed-out' };
    const { data, error } = await client.rpc('erase_my_data');
    if (error) return { ok: false, reason: 'failed' };
    const outcome = parseErasure(data);
    return outcome ? { ok: true, ...outcome } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export type RemoveResult =
  | { ok: true }
  | { ok: false; reason: 'demo' | 'signed-out' | 'network' }
  | { ok: false; reason: 'refused'; status: number; message: string };

/**
 * Remove the guest's sign-in after they have erased their data. Asks the `delete-my-account` Edge
 * Function, which decides (switch, recent erasure, no bookings) and deletes the Auth user. Nothing
 * here names a user: the function takes the caller from the token. Demo mode has no client and does
 * nothing.
 */
export async function removeMyAccount(client: OffersClient | null = appOffersClient()): Promise<RemoveResult> {
  if (!client) return { ok: false, reason: 'demo' };
  const token = await client.getAccessToken();
  if (!token) return { ok: false, reason: 'signed-out' };
  try {
    const res = await client.fetch(`${client.functionsBase}/delete-my-account`, {
      method: 'POST',
      headers: { apikey: client.anonKey, Authorization: `Bearer ${token}` },
    });
    const json: unknown = await res.json().catch(() => null);
    const j = json as { ok?: unknown; message?: unknown } | null;
    if (res.status === 200 && j?.ok === true) return { ok: true };
    if (res.status === 401) return { ok: false, reason: 'signed-out' };
    return {
      ok: false,
      reason: 'refused',
      status: res.status,
      message: typeof j?.message === 'string' ? j.message : 'Could not remove your sign-in right now.',
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
