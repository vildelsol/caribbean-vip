import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Pins the fixes from the 2026-11-07 keyboard and 200% zoom audit. These are layout and focus
 * behaviours that need a browser to prove, so this reads the source: it is a floor that stops them
 * being undone by accident, not a replacement for walking the screens (docs/accessibility.md).
 */
const SRC = join(__dirname, '..');
const read = (file: string) => readFileSync(join(SRC, file), 'utf8');

describe('keyboard', () => {
  it('moves focus to the new screen heading on a route change', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/querySelector<HTMLElement>\('main h1'\)/);
    expect(app).toMatch(/target\.focus\(/);
  });

  it('leaves focus alone when a screen already put it somewhere (Search focuses its field)', () => {
    expect(read('App.tsx')).toMatch(/held\.closest\('main'\)/);
  });

  it('keeps focused controls clear of the fixed bottom nav', () => {
    expect(read('design/global.css')).toMatch(/scroll-padding-bottom:\s*calc\(var\(--nav-height\)/);
  });
});

describe('200% text zoom on the booking path', () => {
  const wraps = (file: string, selector: string) => {
    const block = new RegExp(`${selector.replace(/[.>]/g, '\\$&')}\\s*\\{[^}]*flex-wrap:\\s*wrap`).test(read(file));
    return block;
  };

  it('Search head wraps so the field cannot collapse to nothing', () => {
    expect(wraps('screens/Search.css', '.search__head')).toBe(true);
    expect(read('screens/Search.css')).toMatch(/\.search__field\s*\{[^}]*flex:\s*1 1 8rem/);
  });

  it('the experience booking bar wraps so the button is not cut off', () => {
    expect(wraps('screens/ExperienceDetail.css', '.detail__action')).toBe(true);
  });

  it('the party steppers wrap so the label does not print over the buttons', () => {
    expect(wraps('components/kit.css', '.stepper')).toBe(true);
  });
});
