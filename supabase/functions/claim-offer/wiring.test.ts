import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The adapter needs Deno and a live Supabase, so it cannot be run here. What can go wrong in it
// without any rule changing is wiring, and each of these has been a real defect elsewhere.
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const raw = read('supabase/functions/claim-offer/index.ts');
// Comments explain the rules and name the things the code must not do; only code is checked.
const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('claim-offer wiring', () => {
  it('asks Auth who the caller is, and refuses when it cannot say', () => {
    expect(source).toMatch(/supabase\.auth\.getUser\(token\)/);
    expect(source).toMatch(/Sign in required'\s*\},\s*401/);
  });

  it('never reads a user id from the request body', () => {
    expect(source).not.toMatch(/body\.userId|request\.userId/);
    expect(source).toMatch(/p_user_id: userId/);
  });

  it('refuses a claim for an offer the guest was not shown', () => {
    expect(source).toMatch(/if \(!wasShownRecently\(/);
    expect(source).toMatch(/\},\s*403\)/);
  });

  it('stores the hash, never the token, and counts through the locked function', () => {
    expect(source).toMatch(/p_token_hash: await hashVoucherToken\(qrToken\)/);
    expect(source).not.toMatch(/token_hash:\s*qrToken/);
    expect(source).toMatch(/rpc\('claim_promotion_voucher'/);
    expect(source).not.toMatch(/from\('vouchers'\)\.insert|issued_count/);
  });

  it('needs the signing secret and does not log it', () => {
    expect(source).toMatch(/VOUCHER_HMAC_SECRET/);
    expect(source).not.toMatch(/console\.\w+\([^)]*secret/);
  });

  it('keeps the platform JWT check on and is part of the deploy', () => {
    expect(read('supabase/config.toml')).toMatch(/\[functions\.claim-offer\]\s*\nverify_jwt = true/);
    expect(read('scripts/deploy-functions.sh')).toMatch(/for fn in [^;]*\bclaim-offer\b/);
  });

  it('does not return database error text', () => {
    expect(source).not.toMatch(/message:\s*(e|error|claim\.error|impressions\.error)\b/);
    expect(source).toMatch(/console\.error\('claim-offer failed'/);
  });
});
