import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkReviewDraft, REVIEW_LIMITS, reviewStateLabel } from './review.ts';

const MIGRATION = join(
  __dirname,
  '../../../supabase/migrations/20261105000001_review_moderation_audit.sql',
);
const PLATFORM = join(__dirname, '../../../supabase/migrations/20260802000008_platform.sql');

describe('the limits match the database', () => {
  it('body length matches reviews_body_length', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const m = sql.match(/reviews_body_length check \(char_length\(body\) <= (\d+)\)/);
    expect(m, 'reviews_body_length constraint not found in the migration').not.toBeNull();
    expect(Number(m![1])).toBe(REVIEW_LIMITS.body);
  });

  it('rating bounds match the column check', () => {
    const sql = readFileSync(PLATFORM, 'utf8');
    const m = sql.match(/rating\s+smallint not null check \(rating between (\d+) and (\d+)\)/);
    expect(m, 'rating check not found on the reviews table').not.toBeNull();
    expect(Number(m![1])).toBe(REVIEW_LIMITS.ratingMin);
    expect(Number(m![2])).toBe(REVIEW_LIMITS.ratingMax);
  });
});

describe('checkReviewDraft', () => {
  it('accepts a rating on its own and stores a blank body as null', () => {
    for (const body of [undefined, '', '   ', '\n\t ']) {
      const r = checkReviewDraft({ rating: 4, body: body as string });
      expect(r.ok).toBe(true);
      expect(r.ok && r.draft.body, `body ${JSON.stringify(body)}`).toBeNull();
    }
  });

  it('trims the body it keeps', () => {
    const r = checkReviewDraft({ rating: 5, body: '  loved it  ' });
    expect(r.ok && r.draft.body).toBe('loved it');
  });

  it('accepts a body at exactly the limit, and refuses one character more', () => {
    expect(checkReviewDraft({ rating: 3, body: 'x'.repeat(REVIEW_LIMITS.body) }).ok).toBe(true);
    const over = checkReviewDraft({ rating: 3, body: 'x'.repeat(REVIEW_LIMITS.body + 1) });
    expect(over.ok).toBe(false);
    expect(!over.ok && over.problem).toMatch(/under 2000 characters/);
  });

  it('measures the trimmed body, so trailing spaces alone cannot fail a submit', () => {
    expect(checkReviewDraft({ rating: 3, body: `${'x'.repeat(REVIEW_LIMITS.body)}    ` }).ok).toBe(true);
  });

  it.each([0, 6, -1, 2.5, Number.NaN])('refuses rating %s', (rating) => {
    expect(checkReviewDraft({ rating, body: '' }).ok).toBe(false);
  });

  it('accepts every rating the column allows', () => {
    for (let r = REVIEW_LIMITS.ratingMin; r <= REVIEW_LIMITS.ratingMax; r += 1) {
      expect(checkReviewDraft({ rating: r, body: '' }).ok, `rating ${r}`).toBe(true);
    }
  });

  it('gives one message, not a list', () => {
    const r = checkReviewDraft({ rating: 9, body: 'x'.repeat(REVIEW_LIMITS.body + 1) });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problem.split('\n')).toHaveLength(1);
  });
});

describe('reviewStateLabel', () => {
  it('does not tell a guest their review needs approving', () => {
    expect(reviewStateLabel('pending')).toBe('In the queue');
    expect(reviewStateLabel('pending').toLowerCase()).not.toMatch(/approv/);
  });

  it('names the other two states', () => {
    expect(reviewStateLabel('published')).toBe('Published');
    expect(reviewStateLabel('rejected')).toBe('Not published');
  });
});
