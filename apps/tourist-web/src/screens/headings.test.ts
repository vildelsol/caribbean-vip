import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Every screen must give a screen reader a level-one heading. Axe flags a page without one
 * (`page-has-heading-one`) and Nearby, Search and the post-payment return screen had none until
 * 2026-11-06. This reads the source rather than rendering, so it is a floor, not a full audit:
 * the real check is axe in a browser (see docs/accessibility.md).
 */
const dir = new URL('./', import.meta.url);
const screens = readdirSync(dir).filter((f) => f.endsWith('.tsx'));

// Welcome draws its brand heading through a shared component, and passes axe.
const SETS_H1_ELSEWHERE = new Set(['Welcome.tsx']);

describe('screen headings', () => {
  it('finds the screens', () => {
    expect(screens.length).toBeGreaterThan(15);
  });
  for (const file of screens) {
    if (SETS_H1_ELSEWHERE.has(file)) continue;
    it(`${file} has an h1`, () => {
      expect(readFileSync(new URL(file, dir), 'utf8')).toMatch(/<h1[\s>]/);
    });
  }
});
