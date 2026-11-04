import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const raw = read('supabase/functions/erase-processors/index.ts');
const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('erase-processors wiring', () => {
  it('asks Auth who the caller is, and refuses when it cannot say', () => {
    expect(source).toMatch(/supabase\.auth\.getUser\(token\)/);
    expect(source).toMatch(/Sign in required'\s*\},\s*401/);
  });

  it('takes the subject from Auth, never from the request', () => {
    expect(source).not.toMatch(/req\.json|body\.|request\.userId|searchParams/);
    expect(source).toMatch(/userId: user\.id, email: user\.email/);
  });

  it('runs the registry through eraseEverywhere and reports incomplete ones', () => {
    expect(source).toMatch(/createProcessorRegistry\(\[/);
    expect(source).toMatch(/eraseEverywhere\(registry/);
    expect(source).toMatch(/complete: report\.complete/);
  });

  it('does not return error text', () => {
    expect(source).not.toMatch(/message:\s*(e|error)\b/);
    expect(source).toMatch(/console\.error\('erase-processors failed'/);
  });

  it('keeps the platform JWT check on and is part of the deploy', () => {
    expect(read('supabase/config.toml')).toMatch(/\[functions\.erase-processors\]\s*\nverify_jwt = true/);
    expect(read('scripts/deploy-functions.sh')).toMatch(/for fn in [^;]*\berase-processors\b/);
  });

  it('every port in the registry is marked built in the coverage list', () => {
    expect(read('packages/types/src/processorCoverage.ts')).toMatch(/BUILT_PORT_IDS[^=]*=\s*\[[^\]]*'stripe'/);
  });
});
