import { beforeEach, describe, expect, it } from 'vitest';
import { getInterests, hasInterests, rankByInterest, setInterests } from './interests';

const item = (id: string, category: string) => ({ id, category });

beforeEach(() => setInterests([]));

describe('onboarding interests', () => {
  it('starts empty, so a guest who skips is not silently profiled', () => {
    expect(hasInterests()).toBe(false);
    expect(getInterests()).toEqual([]);
  });

  it('ranks matching categories to the front', () => {
    setInterests(['beaches']);
    const out = rankByInterest([
      item('a', 'waterfalls'),
      item('b', 'beaches'),
      item('c', 'food'),
    ]);
    expect(out.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  /**
   * The invariant the whole feature rests on. A first-run screen that quietly removes half the
   * catalogue is a trap: the guest has no way to connect an empty Explore back to a tile they
   * tapped a minute earlier. Ranking is reversible by scrolling; filtering is not.
   */
  it('never drops an item — it reorders, it does not filter', () => {
    setInterests(['beaches']);
    const input = [item('a', 'waterfalls'), item('b', 'beaches'), item('c', 'food')];
    const out = rankByInterest(input);
    expect(out).toHaveLength(input.length);
    expect(new Set(out.map((i) => i.id))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('is a stable partition — unmatched items keep their relative order', () => {
    setInterests(['beaches']);
    const out = rankByInterest([
      item('a', 'food'),
      item('b', 'culture'),
      item('c', 'beaches'),
      item('d', 'waterfalls'),
    ]);
    expect(out.map((i) => i.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('leaves the list untouched when nothing was chosen', () => {
    const input = [item('a', 'food'), item('b', 'beaches')];
    expect(rankByInterest(input)).toEqual(input);
  });

  it('handles several chosen categories at once', () => {
    setInterests(['beaches', 'food']);
    const out = rankByInterest([item('a', 'culture'), item('b', 'food'), item('c', 'beaches')]);
    expect(out.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });
});
