/**
 * Which backend the app is talking to.
 *
 * Demo mode engages automatically when Supabase is unconfigured, so `pnpm mobile` works on a fresh
 * clone with no credentials. That is a deliberate default: the alternative — a "not configured"
 * screen — makes the app unrunnable for anyone who has not been given keys, and makes the product
 * impossible to show.
 *
 * Three guard rails, because a demo that quietly reaches production would be worse than no demo:
 *
 *   1. Real configuration always wins. Demo mode cannot override a configured backend.
 *   2. `APP_ENV=production` refuses demo mode outright, even unconfigured.
 *   3. Every screen carries a persistent banner while it is active.
 */

const hasSupabase = Boolean(
  process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
);

const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? 'local';
const explicitlyDisabled = process.env.EXPO_PUBLIC_DEMO_MODE === '0';

export const isProduction = appEnv === 'production';

/** True when the app is running entirely on the in-memory dataset. */
export const isDemoMode = !hasSupabase && !isProduction && !explicitlyDisabled;

/** True when a real backend is configured and in use. */
export const isLiveMode = hasSupabase;

/**
 * Whether there is a catalogue to read at all, from either source.
 *
 * Screens must gate on this rather than on `isSupabaseConfigured`. Gating on Supabase alone was a
 * real bug: `catalogue.ts` dispatched correctly to the demo backend, but every screen returned
 * early before calling it, so demo mode rendered an empty app with a "no backend configured"
 * notice — the one thing demo mode exists to prevent.
 */
export const hasCatalogue = hasSupabase || isDemoMode;

/**
 * The one state neither mode can serve: production with no backend. Kept explicit so the UI can
 * say so plainly instead of silently showing an empty catalogue.
 */
export const isMisconfigured = !hasSupabase && isProduction;

export const modeLabel = isDemoMode ? 'Demo' : isLiveMode ? 'Live' : 'Unconfigured';
