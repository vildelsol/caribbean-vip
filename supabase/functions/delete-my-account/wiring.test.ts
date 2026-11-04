import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The adapter needs Deno and a live Supabase. What can go wrong in it without a rule changing is
// wiring, so each of these pins one.
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const raw = read('supabase/functions/delete-my-account/index.ts');
const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('delete-my-account wiring', () => {
  it('asks Auth who the caller is, and refuses when it cannot say', () => {
    expect(source).toMatch(/supabase\.auth\.getUser\(token\)/);
    expect(source).toMatch(/Sign in required'\s*\},\s*401/);
  });

  it('never reads a user id from the request', () => {
    expect(source).not.toMatch(/req\.json|body\.userId|request\.userId|searchParams/);
    expect(source).toMatch(/p_user_id: userId/);
    expect(source).toMatch(/admin\.deleteUser\(userId\)/);
  });

  it('asks the gate first and only proceeds on the exact answer ok', () => {
    const gate = source.indexOf("rpc('begin_account_removal'");
    const del = source.indexOf('admin.deleteUser');
    expect(gate).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(gate);
    expect(source).toMatch(/decision\.data !== 'ok'/);
  });

  it('does not return database or Auth error text', () => {
    expect(source).not.toMatch(/message:\s*(e|error|decision\.error|removal\.error)\b/);
    expect(source).toMatch(/console\.error\('delete-my-account failed'/);
  });

  it('keeps the platform JWT check on and is part of the deploy', () => {
    expect(read('supabase/config.toml')).toMatch(/\[functions\.delete-my-account\]\s*\nverify_jwt = true/);
    expect(read('scripts/deploy-functions.sh')).toMatch(/for fn in [^;]*\bdelete-my-account\b/);
  });
});
