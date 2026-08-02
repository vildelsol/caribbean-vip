/**
 * Environment schemas.
 *
 * PRD §14: "Do not expose service-role keys or Stripe secrets to clients."
 *
 * The split below is the mechanism that enforces it: `clientEnvSchema` is the ONLY shape a client
 * bundle may read, and it contains no secret. Anything secret lives in `serverEnvSchema`, which is
 * parsed exclusively inside Edge Functions. A CI check asserts no server key name appears in a
 * client bundle.
 */

import { z } from 'zod';

/** Safe to ship in an app bundle. Every key here is public by design. */
export const clientEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_').optional(),
  MAPS_PROVIDER: z.enum(['mock', 'google', 'mapbox']).default('mock'),
  MAPS_PUBLIC_KEY: z.string().optional(),
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
});
export type ClientEnv = z.infer<typeof clientEnvSchema>;

/** Server-only. Never imported by app code. */
export const serverEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
  /** HMAC key for voucher tokens (AD-04). Must differ per environment. */
  VOUCHER_HMAC_SECRET: z.string().min(32),
  AI_PROVIDER: z.enum(['mock', 'anthropic']).default('mock'),
  AI_API_KEY: z.string().optional(),
  NOTIFICATIONS_PROVIDER: z.enum(['mock', 'expo']).default('mock'),
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
});
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Production refuses to start on a mock adapter or a missing payment secret. Local and staging
 * are allowed to run fully mocked — operating rule 4: a missing credential must not stop the
 * build.
 */
export function assertProductionReady(env: ServerEnv): void {
  if (env.APP_ENV !== 'production') return;
  const problems: string[] = [];
  if (!env.STRIPE_SECRET_KEY) problems.push('STRIPE_SECRET_KEY is required in production');
  if (!env.STRIPE_WEBHOOK_SECRET) problems.push('STRIPE_WEBHOOK_SECRET is required in production');
  if (env.AI_PROVIDER === 'mock') problems.push('AI_PROVIDER must not be mock in production');
  if (env.NOTIFICATIONS_PROVIDER === 'mock') {
    problems.push('NOTIFICATIONS_PROVIDER must not be mock in production');
  }
  if (problems.length > 0) {
    throw new Error(`Refusing to start in production:\n - ${problems.join('\n - ')}`);
  }
}
