import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Claims the UI used to make that no field in the data backs. Each is a statement a guest could
 * act on (a ship's schedule, a group size), shown on every listing whether or not it was true.
 * If one needs to come back, add the field and the operator's confirmation first, then remove it
 * from this list.
 */
const UNBACKED = ['Cruise-Friendly', 'Small group'];
const SCREENS = ['Explore', 'ExperienceDetail', 'Search', 'Nearby', 'Irie', 'Offer', 'Welcome'];

describe('screens make no claim the data cannot back', () => {
  it.each(SCREENS)('%s', (screen) => {
    const src = readFileSync(join(__dirname, '../screens', `${screen}.tsx`), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const claim of UNBACKED) expect(src, `${screen} says "${claim}"`).not.toContain(claim);
  });
});

describe('the cancellation promise follows the data', () => {
  it('checkout says "free cancellation" only when the listing sets a window', () => {
    const src = readFileSync(join(__dirname, '../screens/Checkout.tsx'), 'utf8');
    expect(src).toMatch(/experience\.cancellationHours > 0\s*\?\s*`free cancellation until/);
  });
});
