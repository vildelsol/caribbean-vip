import { describe, expect, it } from 'vitest';
import { assertProductionReady, clientEnvSchema, serverEnvSchema } from './env.ts';

describe('env split (PRD §14: no secrets client-side)', () => {
  it('the client schema contains no secret key names', () => {
    const clientKeys = Object.keys(clientEnvSchema.shape);
    const forbidden = ['SERVICE_ROLE', 'SECRET', 'sk_', 'whsec_', 'API_KEY'];
    for (const key of clientKeys) {
      for (const bad of forbidden) {
        expect(key.toUpperCase()).not.toContain(bad.toUpperCase());
      }
    }
  });

  it('the server schema holds the secrets', () => {
    const serverKeys = Object.keys(serverEnvSchema.shape);
    expect(serverKeys).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(serverKeys).toContain('VOUCHER_HMAC_SECRET');
    expect(serverKeys).toContain('STRIPE_SECRET_KEY');
  });

  it('rejects a publishable key in the secret-key slot and vice versa', () => {
    const base = {
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'srk',
      VOUCHER_HMAC_SECRET: 'x'.repeat(32),
    };
    expect(serverEnvSchema.safeParse({ ...base, STRIPE_SECRET_KEY: 'pk_test_123' }).success).toBe(
      false,
    );
    expect(serverEnvSchema.safeParse({ ...base, STRIPE_SECRET_KEY: 'sk_test_123' }).success).toBe(
      true,
    );
  });

  it('requires a voucher secret of at least 32 characters', () => {
    const r = serverEnvSchema.safeParse({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'srk',
      VOUCHER_HMAC_SECRET: 'short',
    });
    expect(r.success).toBe(false);
  });

  it('defaults every provider to mock so local dev needs zero credentials (rule 4)', () => {
    const server = serverEnvSchema.parse({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'srk',
      VOUCHER_HMAC_SECRET: 'x'.repeat(32),
    });
    expect(server.AI_PROVIDER).toBe('mock');
    expect(server.NOTIFICATIONS_PROVIDER).toBe('mock');
    expect(clientEnvSchema.parse({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'a' }).MAPS_PROVIDER).toBe('mock');
  });
});

describe('production guard', () => {
  const prod = {
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'srk',
    VOUCHER_HMAC_SECRET: 'x'.repeat(32),
    APP_ENV: 'production' as const,
  };

  it('refuses production on mock adapters or missing Stripe secrets', () => {
    expect(() => assertProductionReady(serverEnvSchema.parse(prod))).toThrow(/Refusing to start/);
  });

  it('allows a fully mocked local environment', () => {
    expect(() =>
      assertProductionReady(serverEnvSchema.parse({ ...prod, APP_ENV: 'local' })),
    ).not.toThrow();
  });
});
