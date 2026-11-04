/**
 * The personal data inventory (`docs/data-inventory.md`) must describe every table.
 *
 * Privacy by design only holds if adding a table forces someone to say what it holds, how long it is
 * kept and what erasure does to it. This fails the build when a migration creates a table the
 * inventory does not list, when the inventory lists one that no longer exists, or when a table
 * marked personal leaves retention or erasure blank.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');

export function tablesCreatedBy(sql: string): string[] {
  return [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)].map((m) => m[1]!);
}

export interface InventoryRow {
  table: string;
  personal: string;
  basis: string;
  retention: string;
  erasure: string;
}

/** Rows of the markdown table whose first cell is a backticked table name. */
export function parseInventory(markdown: string): InventoryRow[] {
  const rows: InventoryRow[] = [];
  for (const line of markdown.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    const name = /^`([a-z_][a-z0-9_]*)`$/.exec(cells[1] ?? '');
    if (!name || cells.length < 9) continue;
    rows.push({ table: name[1]!, personal: cells[2]!, basis: cells[5]!, retention: cells[6]!, erasure: cells[7]! });
  }
  return rows;
}

const migrations = readdirSync(join(ROOT, 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8'));
const created = new Set(migrations.flatMap(tablesCreatedBy));
const inventory = parseInventory(readFileSync(join(ROOT, 'docs', 'data-inventory.md'), 'utf8'));
const listed = new Set(inventory.map((r) => r.table));

describe('data inventory', () => {
  it('reads the migrations and the inventory (positive control: neither is empty)', () => {
    expect(created.size).toBeGreaterThan(20);
    expect(inventory.length).toBeGreaterThan(20);
  });

  it('lists every table a migration creates', () => {
    expect([...created].filter((t) => !listed.has(t)).sort()).toEqual([]);
  });

  it('lists no table that does not exist', () => {
    expect([...listed].filter((t) => !created.has(t)).sort()).toEqual([]);
  });

  it('classifies every table as yes, business or no', () => {
    expect(inventory.filter((r) => !['yes', 'business', 'no'].includes(r.personal)).map((r) => r.table)).toEqual([]);
  });

  it('gives every personal table a retention and an erasure entry', () => {
    const blank = inventory
      .filter((r) => r.personal !== 'no' && (r.retention === '' || r.erasure === ''))
      .map((r) => r.table);
    expect(blank).toEqual([]);
  });

  // A legal-obligation basis is the Art 17(3)(b) reason for keeping data through an erasure request.
  // A period of "none defined" there means we cannot say how long, or when to delete.
  it('gives every legal-obligation table a stated retention period', () => {
    const undefinedPeriod = inventory
      .filter((r) => /legal obligation/i.test(r.basis) && /^none defined/i.test(r.retention))
      .map((r) => r.table);
    expect(undefinedPeriod).toEqual([]);
  });
});

describe('table and inventory parsing', () => {
  it('finds plain, schema-qualified and if-not-exists creates', () => {
    expect(tablesCreatedBy('create table a (x int);\nCREATE TABLE IF NOT EXISTS public.b (y int);')).toEqual(['a', 'b']);
  });

  it('ignores header, separator and prose rows', () => {
    const md = '| table | personal |\n|---|---|\n| `t` | yes | d | p | b | r | e |\nplain `x` text';
    expect(parseInventory(md).map((r) => r.table)).toEqual(['t']);
  });
});
