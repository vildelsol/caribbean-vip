import { describe, expect, it } from 'vitest';
import { nextTabTarget } from './dialogFocus';

describe('nextTabTarget', () => {
  const items = ['a', 'b', 'c'];

  it('moves forward and backward', () => {
    expect(nextTabTarget(items, 'a', false)).toBe('b');
    expect(nextTabTarget(items, 'c', true)).toBe('b');
  });

  it('wraps at both ends, so Tab cannot leave the dialog', () => {
    expect(nextTabTarget(items, 'c', false)).toBe('a');
    expect(nextTabTarget(items, 'a', true)).toBe('c');
  });

  it('pulls stray focus back in: first for Tab, last for Shift+Tab', () => {
    expect(nextTabTarget(items, null, false)).toBe('a');
    expect(nextTabTarget(items, 'outside', false)).toBe('a');
    expect(nextTabTarget(items, 'outside', true)).toBe('c');
  });

  it('returns null when nothing is focusable', () => {
    expect(nextTabTarget([], null, false)).toBeNull();
  });

  it('keeps focus on a lone item', () => {
    expect(nextTabTarget(['a'], 'a', false)).toBe('a');
    expect(nextTabTarget(['a'], 'a', true)).toBe('a');
  });
});
