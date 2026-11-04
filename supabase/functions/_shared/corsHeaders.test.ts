import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// supabase-js and our own fetch calls send `apikey`, `authorization` and `content-type`. A browser
// asks permission for each in a preflight, and one missing from Allow-Headers blocks the whole call
// before the function runs. checkout-session lacked `apikey`, so on staging no guest could pay and the
// Pay button stuck on "Redirecting…". Every browser-called function must allow all three.
const dir = join(__dirname, '..');
// Server-to-server only: Stripe calls it, no browser preflight exists.
const NOT_BROWSER_CALLED = new Set(['stripe-webhook']);

const functions = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && d.name !== 'node_modules')
  .map((d) => d.name);

describe('Edge Function CORS allow-headers', () => {
  it('finds the functions (guards the scan)', () => {
    expect(functions).toContain('checkout-session');
    expect(functions.length).toBeGreaterThanOrEqual(8);
  });

  for (const name of functions.filter((f) => !NOT_BROWSER_CALLED.has(f))) {
    it(`${name} allows apikey, authorization and content-type`, () => {
      const src = readFileSync(join(dir, name, 'index.ts'), 'utf8');
      const m = src.match(/'Access-Control-Allow-Headers':\s*'([^']*)'/);
      expect(m, `${name} sets no Access-Control-Allow-Headers`).not.toBeNull();
      const allowed = m![1]!.toLowerCase().split(',').map((h) => h.trim());
      for (const h of ['apikey', 'authorization', 'content-type']) expect(allowed).toContain(h);
    });
  }
});
