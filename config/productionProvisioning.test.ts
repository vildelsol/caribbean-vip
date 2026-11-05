import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const workflow = read('.github/workflows/migrate-production.yml');
const runbook = read('docs/production-provisioning.md');
const deploy = read('scripts/deploy-functions.sh');

// Comments in the workflow may mention the seed to forbid it; only executable lines count.
const workflowCode = workflow.replace(/^\s*#.*$/gm, '');

describe('production migration workflow', () => {
  it('runs only when a human starts it', () => {
    expect(workflowCode).toMatch(/workflow_dispatch:/);
    expect(workflowCode).not.toMatch(/^\s*(push|pull_request|schedule|workflow_run):/m);
  });

  it('waits on the production environment, which holds the approval gate', () => {
    expect(workflowCode).toMatch(/environment:\s*production/);
  });

  it('never loads the demo seed or the seeding script', () => {
    expect(workflowCode).not.toMatch(/seed/i);
    expect(workflowCode).not.toMatch(/db-push\.sh/);
  });

  it('defaults to a dry run', () => {
    expect(workflowCode).toMatch(/dry_run:[\s\S]*?default:\s*true/);
  });

  it('reads the database URL from a secret, never from the file', () => {
    expect(workflowCode).toMatch(/secrets\.PRODUCTION_DB_URL/);
    expect(workflowCode).not.toMatch(/postgres(ql)?:\/\/[^\s$]*:[^\s$]+@/);
  });
});

describe('production runbook', () => {
  it('forbids the seeding script and says why', () => {
    expect(runbook).toMatch(/Never run `scripts\/db-push\.sh` against production/);
  });

  it('names every Edge Function secret the functions read', () => {
    const names = new Set<string>();
    const fnRoot = join(root, 'supabase/functions');
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) {
          for (const m of readFileSync(p, 'utf8').matchAll(/Deno\.env\.get\('([A-Z_]+)'/g)) names.add(m[1]);
        }
      }
    };
    walk(fnRoot);
    // Supabase injects these two; everything else is ours to set.
    for (const injected of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) names.delete(injected);
    expect(names.size).toBeGreaterThan(0);
    for (const n of names) expect(runbook, `secret ${n} missing from runbook`).toContain(n);
  });

  it('lists every deployed function, and the deploy script covers every function folder', () => {
    const dirs = readdirSync(join(root, 'supabase/functions'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
      .map((e) => e.name);
    for (const d of dirs) expect(deploy, `deploy-functions.sh misses ${d}`).toContain(d);
    expect(runbook).toMatch(new RegExp(`all ${dirs.length === 9 ? 'nine' : dirs.length} functions`));
  });
});
