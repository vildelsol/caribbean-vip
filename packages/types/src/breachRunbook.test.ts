import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processorRows } from './processorCoverage.test.ts';

// The runbook only helps if it names every outside tool and every secret that exists today.
// Both lists are read from the repo, never pinned here, so they cannot go stale in step with the doc.
const ROOT = join(__dirname, '..', '..', '..');
const runbook = readFileSync(join(ROOT, 'docs', 'privacy', 'breach-runbook.md'), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : sourceFiles(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

/** Names of every secret an Edge Function reads from the environment. */
export function functionEnvNames(): string[] {
  const names = new Set<string>();
  for (const f of sourceFiles(join(ROOT, 'supabase', 'functions'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/Deno\.env\.get\('([A-Z0-9_]+)'/g)) names.add(m[1]!);
  }
  return [...names];
}

describe('breach runbook', () => {
  it('reads the secrets and processors (guards the parsers)', () => {
    expect(functionEnvNames()).toContain('STRIPE_SECRET_KEY');
    expect(processorRows(readFileSync(join(ROOT, 'docs', 'privacy', 'processor-record.md'), 'utf8'))).toContain('Stripe');
  });

  it('says what the clock is and when it starts', () => {
    expect(runbook).toMatch(/72 hours/);
    expect(runbook).toMatch(/when we become aware/);
  });

  it('has a containment step for every secret the functions read', () => {
    const missing = functionEnvNames().filter((n) => !runbook.includes(n));
    expect(missing, `add a containment row for: ${missing.join(', ')}`).toEqual([]);
  });

  it('names every processor in the processor record', () => {
    const rows = processorRows(readFileSync(join(ROOT, 'docs', 'privacy', 'processor-record.md'), 'utf8'));
    // "Email sender for sign-in codes" is covered as "the email sender".
    const missing = rows.filter((r) => !runbook.toLowerCase().includes(r.toLowerCase().startsWith('email sender') ? 'email sender' : r.toLowerCase()));
    expect(missing).toEqual([]);
  });

  it('keeps a register to record breaches in', () => {
    expect(readFileSync(join(ROOT, 'docs', 'privacy', 'breach-register.md'), 'utf8')).toMatch(/Became aware/);
  });
});
