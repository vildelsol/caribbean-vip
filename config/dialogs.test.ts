import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A modal dialog must move focus in, keep Tab inside, close on Escape and give focus back
 * (`packages/ui/src/dialogFocus.ts`). Axe cannot check any of that, so this does: every element with
 * `role="dialog"` or `role="alertdialog"` must be a `DialogSurface`, which applies it.
 * Until 2026-11-07 the booking-clash dialog, the erase and sign-in confirmations and both vendor
 * listing modals were plain divs: Tab walked out into the page behind and Escape did nothing.
 */
const ROOT = join(__dirname, '..');
const APPS = join(ROOT, 'apps');
const SKIP = new Set(['node_modules', '.next', 'dist', 'out']);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

/** Tag name of the element whose opening tag contains `index`. */
function tagAround(source: string, index: number): string {
  const open = source.lastIndexOf('<', index);
  return /^<(\w+)/.exec(source.slice(open))?.[1] ?? '';
}

function dialogTags(): { file: string; tag: string }[] {
  const found: { file: string; tag: string }[] = [];
  for (const file of tsxFiles(APPS)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/role="(?:alert)?dialog"/g)) {
      found.push({ file: file.slice(ROOT.length + 1), tag: tagAround(src, m.index ?? 0) });
    }
  }
  return found;
}

describe('modal dialogs', () => {
  it('finds them', () => {
    expect(dialogTags().length).toBeGreaterThanOrEqual(5);
  });

  it('are all DialogSurface, never a bare element', () => {
    const bare = dialogTags().filter((d) => d.tag !== 'DialogSurface');
    expect(bare).toEqual([]);
  });
});
