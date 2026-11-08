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

describe('checkout day strip', () => {
  it('is one Tab stop with arrow-key movement, not a stop per day', () => {
    const src = read('screens/Checkout.tsx');
    expect(src).toMatch(/tabIndex=\{stop \? 0 : -1\}/);
    expect(src).toMatch(/e\.key === 'ArrowRight'/);
    expect(src).toMatch(/className="day-strip"\s+role="group"/);
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

describe('200% text zoom, the rest of the app (audit of 2026-11-07)', () => {
  const narrow = (file: string) => /@media \(max-width: 260px\)\s*\{/.test(read(file));

  it('Explore stacks its pill, moods and Hidden Gems below 260px', () => {
    const css = read('screens/Explore.css');
    expect(narrow('screens/Explore.css')).toBe(true);
    expect(css).toMatch(/@media \(max-width: 260px\)[\s\S]*\.ex-moods\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(css).toMatch(/@media \(max-width: 260px\)[\s\S]*\.island-pill\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it('result cards on Search and Nearby stack their photo above the text below 260px', () => {
    expect(read('screens/Search.css')).toMatch(/@media \(max-width: 260px\)[\s\S]*\.result-row__inner\s*\{[^}]*flex-direction:\s*column/);
    expect(read('screens/Nearby.css')).toMatch(/@media \(max-width: 260px\)[\s\S]*\.near-row__inner\s*\{[^}]*flex-direction:\s*column/);
  });

  it('the Trips pass wraps so its text is not squeezed to nothing', () => {
    expect(read('screens/Trips.css')).toMatch(/@media \(max-width: 260px\)[\s\S]*\.vip-pass\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it('the Profile stats wrap', () => {
    expect(wrapsProfile()).toBe(true);
  });
});

function wrapsProfile(): boolean {
  return /\.profile__stats-glass\s*\{[^}]*flex-wrap:\s*wrap/.test(read('screens/Profile.css'));
}
