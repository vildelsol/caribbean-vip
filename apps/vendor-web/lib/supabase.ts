'use client';

import { createLazyBrowserClient } from '@cvip/supabase';

/**
 * Browser Supabase client.
 *
 * Only NEXT_PUBLIC_ variables are readable in a client component, and every one of them ships to
 * the browser — so by construction this file cannot reach a secret (PRD §14). The factory also
 * refuses a key that looks like a service-role key, turning the worst possible misconfiguration
 * into a startup error rather than a silent bypass of every RLS policy.
 */
export const supabase = createLazyBrowserClient({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
});

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
