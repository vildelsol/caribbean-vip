/**
 * The scheduled purges may run only the two purge functions, and both must be scheduled.
 * A job that ran anything else (a stray DELETE, another function) would be a retention hole or a
 * data-loss bug, so the migration is checked as text: every `cron.schedule` command must be exactly
 * `select <allowed function>()`.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, '..', '..', '..', 'supabase', 'migrations');
const ALLOWED = ['purge_short_lived_records', 'purge_expired_records'];

export function scheduledCommands(sql: string): string[] {
  return [...sql.matchAll(/cron\.schedule\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'([^']*)'\s*\)/g)].map((m) => m[1]!);
}

describe('purge schedule', () => {
  const all = readdirSync(DIR).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(join(DIR, f), 'utf8'));
  const commands = all.flatMap(scheduledCommands);

  it('finds the scheduled commands (guards the parser)', () => {
    expect(scheduledCommands(`select cron.schedule('a', '* * * * *', 'select x()')`)).toEqual(['select x()']);
    expect(commands.length).toBeGreaterThanOrEqual(2);
  });

  it('schedules both purges', () => {
    for (const fn of ALLOWED) expect(commands).toContain(`select ${fn}()`);
  });

  it('runs nothing but the allowed purge calls', () => {
    const bad = commands.filter((c) => !ALLOWED.some((fn) => c === `select ${fn}()`));
    expect(bad).toEqual([]);
  });

  it('no migration calls cron.schedule in a form the parser cannot read', () => {
    const calls = all.join('\n').match(/cron\.schedule\s*\(/g) ?? [];
    expect(calls.length).toBe(commands.length);
  });
});
