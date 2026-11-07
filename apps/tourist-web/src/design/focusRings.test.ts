import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Removing a focus outline leaves a keyboard user with no sign of where they are (WCAG 2.4.7).
 * Axe cannot see this. The Search field had `outline: none` and no replacement until 2026-11-06.
 *
 * Every rule that sets `outline: none` is listed here with how focus is still shown. A new one
 * fails this test, so adding it forces the question "what does a keyboard user see instead?".
 */
const SRC = join(__dirname, '..');

const KNOWN: Record<string, string> = {
  'design/global.css :focus:not(:focus-visible)': 'pointer focus only; :focus-visible keeps the ring',
  'screens/Search.css .search__input': 'the surrounding .search__field:focus-within draws the ring',
  'screens/Welcome.css .wl__input': '.wl__input:focus changes border colour and adds a shadow',
};

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return cssFiles(p);
    return p.endsWith('.css') ? [p] : [];
  });
}

function outlineNoneRules(): string[] {
  const found: string[] = [];
  for (const file of cssFiles(SRC)) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (/outline:\s*(none|0)\b/.test(m[2] ?? '')) {
        const selector = (m[1] ?? '').trim().replace(/\s+/g, ' ');
        found.push(`${file.slice(SRC.length + 1)} ${selector}`);
      }
    }
  }
  return found.sort();
}

describe('focus rings', () => {
  it('finds the stylesheets', () => {
    expect(cssFiles(SRC).length).toBeGreaterThan(10);
  });

  it('every rule that removes an outline is listed, with its replacement', () => {
    expect(outlineNoneRules()).toEqual(Object.keys(KNOWN).sort());
  });

  it('the Search field still draws its ring on the pill', () => {
    const css = readFileSync(join(SRC, 'screens', 'Search.css'), 'utf8');
    expect(css).toMatch(/\.search__field:focus-within\s*\{[^}]*outline:\s*2\.5px/);
  });
});
