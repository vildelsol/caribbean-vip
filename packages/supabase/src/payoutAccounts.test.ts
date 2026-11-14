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

  it('takes write privileges away from signed-in users and everything from anon', () => {
    expect(allSql).toMatch(/revoke insert, update, delete on vendor_payout_accounts from authenticated/i);
    expect(allSql).toMatch(/revoke all on vendor_payout_accounts from anon/i);
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
