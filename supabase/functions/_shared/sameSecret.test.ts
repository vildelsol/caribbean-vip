import { describe, expect, it } from 'vitest';
import { sameSecret } from './sameSecret';

describe('sameSecret', () => {
  it('accepts an identical secret (positive control)', () => {
    expect(sameSecret('abc.def.ghi', 'abc.def.ghi')).toBe(true);
  });
  it('refuses a different one, a prefix, an extension, and the empty string', () => {
    for (const guess of ['abc.def.ghx', 'abc.def', 'abc.def.ghi.', '', 'ABC.DEF.GHI']) {
      expect(sameSecret(guess, 'abc.def.ghi')).toBe(false);
    }
  });
});
