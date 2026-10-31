import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The adapter needs Deno and a live Supabase, so it cannot be run here. What can go wrong in it
// without any rule changing is wiring, and each of these has been a real defect elsewhere.
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const source = read('supabase/functions/eligible-offer/index.ts');

describe('eligible-offer wiring', () => {
  it('asks Auth who the caller is, and refuses when it cannot say', () => {
    expect(source).toMatch(/supabase\.auth\.getUser\(token\)/);
    expect(source).toMatch(/Sign in required'\s*\},\s*401/);
  });

  it('never reads a user id from the request body', () => {
    expect(source).not.toMatch(/body\.userId|request\.userId|\.userId\b.*body/);
  });

  it('takes consent from the caller\'s profile, not from the request', () => {
    expect(source).toMatch(/location_consent/);
    expect(source).toMatch(/offer_consent/);
    expect(source).not.toMatch(/request\.(consent|osLocationGranted|offerOptIn)/);
  });

  it('writes the impression, and treats a failed write as no offer', () => {
    expect(source).toMatch(/from\('promotion_impressions'\)\.insert/);
    expect(source).toMatch(/if \(impressionError\) throw impressionError/);
  });

  it('keeps the platform JWT check on and is part of the deploy', () => {
    expect(read('supabase/config.toml')).toMatch(/\[functions\.eligible-offer\]\s*\nverify_jwt = true/);
    expect(read('scripts/deploy-functions.sh')).toMatch(/for fn in [^;]*\beligible-offer\b/);
  });

  it('does not return database error text', () => {
    expect(source).not.toMatch(/message:\s*(e|error|impressionError)\b/);
    expect(source).toMatch(/console\.error\('eligible-offer failed'/);
  });
});
