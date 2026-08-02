import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLazyBrowserClient } from '@cvip/supabase';

/**
 * Tourist-app Supabase client.
 *
 * Only EXPO_PUBLIC_ variables are readable here, and every one of them is compiled into the app
 * bundle — so by construction this file cannot reach a secret (PRD §14). `createBrowserClient`
 * additionally refuses a key that looks like a service-role key.
 *
 * React Native has no localStorage, so the session is persisted through AsyncStorage. There is no
 * URL to detect a session in, either.
 */
export const supabase = createLazyBrowserClient({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  storage: AsyncStorage,
  detectSessionInUrl: false,
});

/**
 * Whether the app is configured to talk to a backend at all.
 *
 * M1 ships before any hosted project exists. Rather than crashing on a missing URL, the app
 * renders in a clearly-labelled unconfigured state — operating rule 4: a missing credential
 * documents itself and keeps the rest of the flow operational.
 */
export const isSupabaseConfigured = Boolean(
  process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
);
