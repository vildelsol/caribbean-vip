import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * What the review screen may promise a guest.
 *
 * Nothing renders a review body publicly. A listing shows the aggregate from `experience_ratings`,
 * which exposes `experience_id`, `average_rating` and `review_count` and nothing else — no text,
 * no author. So a screen that tells a guest their review will "appear on the listing", or that
 * their name will or will not be shown beside it, is describing a surface that does not exist.
 *
 * This is the same rule as `unbackedClaims.test.ts`, applied to the one screen that takes writing
 * from a guest. When a public review list is built, come back and change this test first.
 */

const SCREEN = join(__dirname, '../screens/WriteReview.tsx');
const RATINGS = join(__dirname, '../../../../supabase/migrations/20260802000012_search.sql');

const prose = readFileSync(SCREEN, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('the review screen promises only what is built', () => {
  it('the public aggregate still carries no review text or author', () => {
    const sql = readFileSync(RATINGS, 'utf8');
    const view = sql.split(/create view experience_ratings/)[1]?.split(';')[0] ?? '';
    expect(view, 'the experience_ratings view was not found').not.toBe('');
    for (const column of ['body', 'user_id', 'display_name', 'booking_id']) {
      expect(view, `the aggregate now exposes ${column} — revisit this screen's copy`).not.toContain(column);
    }
  });

  it('makes no claim about a name being shown or hidden', () => {
    expect(prose).not.toMatch(/your name/i);
    expect(prose).not.toMatch(/anonymous/i);
  });

  it('does not promise the review will be displayed on the listing', () => {
    expect(prose).not.toMatch(/on the listing(?!&rsquo;s)/i);
    expect(prose).not.toMatch(/other (guests|travellers|travelers) will see/i);
  });

  it('does not tell the guest their review needs approving', () => {
    // "Approval" invites a guest to write for a moderator rather than for the next traveller.
    expect(prose).not.toMatch(/approv/i);
  });

  it('still says a person reads it, which is true and is the thing worth saying', () => {
    expect(prose).toMatch(/A person reads every review/);
  });
});
