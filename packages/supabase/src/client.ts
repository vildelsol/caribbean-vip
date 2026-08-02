/**
 * Supabase client factories.
 *
 * PRD §14: "Do not expose service-role keys or Stripe secrets to clients."
 *
 * Two factories, deliberately named so a mistake is visible in review:
 *
 *   createBrowserClient()  anon key + the signed-in user's JWT. RLS applies. Safe to ship.
 *   createServiceClient()  service-role key. RLS is BYPASSED. Server-only, never in app code.
 *
 * The service factory refuses to run in a browser rather than trusting the caller to know better.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type CvipClient = SupabaseClient<Database>;

export interface BrowserClientOptions {
  url: string;
  anonKey: string;
  /** React Native needs an explicit AsyncStorage-shaped adapter; the web has localStorage. */
  storage?: {
    getItem: (key: string) => Promise<string | null> | string | null;
    setItem: (key: string, value: string) => Promise<void> | void;
    removeItem: (key: string) => Promise<void> | void;
  };
  /** Expo has no URL bar to parse an OAuth fragment from. */
  detectSessionInUrl?: boolean;
}

export function createBrowserClient(options: BrowserClientOptions): CvipClient {
  const { url, anonKey, storage, detectSessionInUrl = true } = options;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase URL and anon key are required. Copy .env.example to .env — see docs/setup.md.',
    );
  }

  // A service-role key is a JWT with "role":"service_role" in its payload. Catching it here turns
  // the worst possible configuration mistake into a startup error instead of a silent, total
  // bypass of every RLS policy in the database.
  if (looksLikeServiceRoleKey(anonKey)) {
    throw new Error(
      'Refusing to start: the key passed as the anon key looks like a service-role key. ' +
        'A service-role key bypasses Row Level Security and must never reach a client bundle.',
    );
  }

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl,
      ...(storage ? { storage: storage as never } : {}),
    },
  });
}

/**
 * A browser client whose construction is deferred to first use.
 *
 * `createBrowserClient` throws on missing configuration, which is the right behaviour — but at
 * module scope that throw happens during Next's prerender, so a build with no `.env` fails even
 * for pages that never touch Supabase. Deferring moves the error to the first real call, where it
 * is both accurate and recoverable: a screen that checks `isSupabaseConfigured` first renders its
 * unconfigured state instead (operating rule 4).
 */
export function createLazyBrowserClient(options: BrowserClientOptions): CvipClient {
  let instance: CvipClient | null = null;

  const resolve = (): CvipClient => (instance ??= createBrowserClient(options));

  return new Proxy({} as CvipClient, {
    get(_target, prop) {
      const client = resolve() as unknown as Record<string | symbol, unknown>;
      const value = client[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    },
    has(_target, prop) {
      return prop in (resolve() as unknown as object);
    },
  });
}

export interface ServiceClientOptions {
  url: string;
  serviceRoleKey: string;
}

/**
 * Server-only client. RLS does not apply — every query runs with full access, so the caller is
 * responsible for the authorization check that RLS would otherwise have made for it.
 */
export function createServiceClient(options: ServiceClientOptions): CvipClient {
  if (typeof window !== 'undefined') {
    throw new Error(
      'createServiceClient() was called in a browser. The service-role key bypasses RLS and ' +
        'must only ever be used server-side (Edge Functions, route handlers).',
    );
  }

  const { url, serviceRoleKey } = options;
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase URL and service-role key are required for the service client.');
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Best-effort inspection of a JWT payload. Never throws — a malformed key simply is not one. */
export function looksLikeServiceRoleKey(key: string): boolean {
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = parts[1] as string;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8'),
    ) as { role?: unknown };
    return payload.length > 0 && json.role === 'service_role';
  } catch {
    return false;
  }
}
