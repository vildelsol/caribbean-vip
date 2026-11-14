import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Where a vendor is paid must not be writable by the vendor, and the merchant-of-record setting must
 * never be defaulted. Both are read from source: the first because the database job already proves
 * the schema applies, the second because Edge Functions run on Deno, outside these tests.
 */
const ROOT = join(__dirname, '..', '..', '..');
const migrationsDir = join(ROOT, 'supabase', 'migrations');
const allSql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
  .join('\n');

const policiesOn = (table: string): string[] =>
  [...allSql.matchAll(new RegExp(`create\\s+policy\\s+\\w+\\s+on\\s+${table}\\s+for\\s+(\\w+)`, 'gi'))].map((m) => m[1]!.toLowerCase());

describe('vendor payout accounts', () => {
  it('reads policies correctly (positive control: vendor_organizations has several)', () => {
    expect(policiesOn('vendor_organizations').length).toBeGreaterThan(3);
  });

  it('has row level security on', () => {
    expect(allSql).toMatch(/alter table vendor_payout_accounts enable row level security/i);
  });

  it('has a read policy and no policy that lets anyone write through the API', () => {
    const verbs = policiesOn('vendor_payout_accounts');
    expect(verbs).toEqual(['select']);
  });

  it('takes every privilege away from anon and signed-in users, then grants read only', () => {
    expect(allSql).toMatch(/revoke all on vendor_payout_accounts from anon, authenticated/i);
    expect(allSql).toMatch(/grant select on vendor_payout_accounts to authenticated/i);
  });

  it('no longer keeps a payout account on the publicly readable vendor row', () => {
    expect(allSql).toMatch(/alter table vendor_organizations drop column stripe_account_id/i);
  });
});

describe('merchant of record setting', () => {
  const deps = readFileSync(join(ROOT, 'supabase', 'functions', '_shared', 'deps.ts'), 'utf8');

  it('is required from the environment', () => {
    expect(deps).toMatch(/Deno\.env\.get\('PAYOUT_MODEL'\)/);
    expect(deps).toMatch(/PAYOUT_MODELS\.includes\(payoutModel/);
  });

  it('has no default that would quietly decide who the seller is', () => {
    expect(deps).not.toMatch(/PAYOUT_MODEL'\)\s*\?\?\s*'(vendor_is_merchant|platform_collects)'/);
  });
});

describe('refunds', () => {
  const stripe = readFileSync(join(ROOT, 'supabase', 'functions', '_shared', 'stripeProvider.ts'), 'utf8');

  it('return the platform fee with the money when a vendor was paid directly', () => {
    expect(stripe).toMatch(/refund_application_fee:\s*true/);
  });

  it('come out of the vendor account the payment went to', () => {
    expect(stripe).toMatch(/stripeAccount:\s*req\.payee\.accountRef/);
  });
});

describe('booking payment terms', () => {
  it('are service-role only: row level security on and no policy at all', () => {
    expect(allSql).toMatch(/alter table booking_payment_terms enable row level security/i);
    expect(policiesOn('booking_payment_terms')).toEqual([]);
    expect(allSql).toMatch(/revoke all on booking_payment_terms from anon, authenticated/i);
  });

  it('cannot name a payee under platform_collects or omit one under vendor_is_merchant', () => {
    expect(allSql).toMatch(/payout_model = 'vendor_is_merchant' and payee_account_ref is not null/i);
    expect(allSql).toMatch(/payout_model = 'platform_collects' and payee_account_ref is null and platform_fee_minor = 0/i);
  });
});

describe('payout migration hygiene', () => {
  const migration = readFileSync(join(migrationsDir, '20261114000001_vendor_payout_accounts.sql'), 'utf8');

  it('does not copy a vendor-typed value from the old column into the trusted table', () => {
    expect(migration).not.toMatch(/insert into vendor_payout_accounts/i);
  });

  it('removes every default privilege, TRUNCATE included, before granting read back', () => {
    expect(migration).toMatch(/revoke all on vendor_payout_accounts from anon, authenticated/i);
    expect(migration).toMatch(/grant select on vendor_payout_accounts to authenticated/i);
  });
});

describe('connect webhook secret', () => {
  const deps = readFileSync(join(ROOT, 'supabase', 'functions', '_shared', 'deps.ts'), 'utf8');

  it('is required whenever vendors are the merchant, or no booking would ever confirm', () => {
    expect(deps).toMatch(/payoutModel === 'vendor_is_merchant' && !stripeConnectWebhookSecret/);
  });
});
