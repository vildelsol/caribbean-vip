/**
 * Supabase client — null when VITE_SUPABASE_URL is not configured (demo mode).
 *
 * This module is the only place in the tourist app that reads Supabase env vars.
 * Every other file imports `supabase` from here and checks for null before using it.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;

export const isLiveMode = supabase !== null;
