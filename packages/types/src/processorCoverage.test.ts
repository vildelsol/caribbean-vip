import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILT_PORT_IDS, PENDING } from './processorCoverage.ts';

const RECORD = join(__dirname, '..', '..', '..', 'docs', 'privacy', 'processor-record.md');

/** First-column names of the table rows above the "Not in use yet" heading. */
export function processorRows(md: string): string[] {
  const head = md.split(/^## Not in use yet/m)[0]!;
  return head
    .split('\n')
    .filter((l) => l.startsWith('|') && !/^\|\s*(processor|-)/i.test(l))
    .map((l) => l.split('|')[1]!.trim())
    .filter(Boolean);
}

describe('processor-record.md coverage', () => {
  const rows = processorRows(readFileSync(RECORD, 'utf8'));

  it('reads the rows (guards the parser itself)', () => {
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows).toContain('Stripe');
  });

  it('every processor row is built or explicitly pending', () => {
    const missing = rows.filter((r) => !(r in PENDING) && !BUILT_PORT_IDS.includes(r.toLowerCase()));
    expect(missing, `add a port or a PENDING entry for: ${missing.join(', ')}`).toEqual([]);
  });

  it('no pending entry names a row that does not exist', () => {
    expect(Object.keys(PENDING).filter((k) => !rows.includes(k))).toEqual([]);
  });

  it('a row with a built port is no longer pending', () => {
    expect(rows.filter((r) => r in PENDING && BUILT_PORT_IDS.includes(r.toLowerCase()))).toEqual([]);
  });
});
