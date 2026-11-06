import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ReviewModerationState } from '@cvip/types';
import {
  allowedReviewDecisions,
  nextReviewState,
  REVIEW_AUDIT_ENTITY,
  REVIEW_LANE_TITLE,
  reviewDecision,
  reviewLane,
  reviewReasonRequired,
  type ReviewDecision,
} from './reviewModeration';

const ENUM = join(__dirname, '../../../supabase/migrations/20260802000001_extensions_and_enums.sql');
const RATINGS = join(__dirname, '../../../supabase/migrations/20260802000012_search.sql');

const ALL: ReviewModerationState[] = ['pending', 'published', 'rejected'];

describe('the states match the database enum', () => {
  it('covers every moderation_state value and invents none', () => {
    const sql = readFileSync(ENUM, 'utf8');
    const m = sql.match(/create type moderation_state as enum \(([^)]*)\)/);
    expect(m, 'moderation_state enum not found').not.toBeNull();
    const inSql = [...m![1]!.matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort();
    expect(inSql).toEqual([...ALL].sort());
  });

  it('only "published" counts towards the public rating, which is what these decisions move', () => {
    expect(readFileSync(RATINGS, 'utf8')).toMatch(/where r\.moderation_state = 'published'/);
  });
});

describe('allowed decisions', () => {
  it('offers exactly one decision per direction from each state', () => {
    expect(allowedReviewDecisions('pending').sort()).toEqual(['publish', 'reject']);
    expect(allowedReviewDecisions('published')).toEqual(['unpublish']);
    expect(allowedReviewDecisions('rejected')).toEqual(['restore']);
  });

  it('a rejection can be undone, so a wrong call is not permanent', () => {
    expect(allowedReviewDecisions('rejected')).toContain('restore');
    expect(nextReviewState('restore')).toBe('published');
  });

  it('no decision leaves a review in the state it was already in', () => {
    for (const state of ALL) {
      for (const d of allowedReviewDecisions(state)) {
        expect(nextReviewState(d), `${state} -> ${d}`).not.toBe(state);
      }
    }
  });
});

describe('reviewDecision', () => {
  it('refuses a move the state does not allow', () => {
    const r = reviewDecision('published', 'publish', '');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problem).toMatch(/cannot be/);
  });

  it('taking a review down needs a recorded reason', () => {
    for (const d of ['reject', 'unpublish'] as ReviewDecision[]) {
      expect(reviewReasonRequired(d)).toBe(true);
    }
    expect(reviewDecision('pending', 'reject', '   ').ok).toBe(false);
    expect(reviewDecision('published', 'unpublish', '  ').ok).toBe(false);
  });

  it('publishing and restoring do not', () => {
    expect(reviewDecision('pending', 'publish', '').ok).toBe(true);
    expect(reviewDecision('rejected', 'restore', '').ok).toBe(true);
  });

  it('keeps the trimmed reason, and null when there is none', () => {
    const r = reviewDecision('pending', 'reject', '  names another guest  ');
    expect(r.ok && r.reason).toBe('names another guest');
    const p = reviewDecision('pending', 'publish', '   ');
    expect(p.ok && p.reason).toBeNull();
  });

  it('returns the state the write path should set', () => {
    expect(reviewDecision('pending', 'publish', '')).toMatchObject({ ok: true, state: 'published' });
    expect(reviewDecision('published', 'unpublish', 'off-topic')).toMatchObject({ ok: true, state: 'rejected' });
  });
});

describe('lanes', () => {
  it('every state lands in a lane with a title', () => {
    for (const s of ALL) expect(REVIEW_LANE_TITLE[reviewLane(s)]).toBeTruthy();
  });

  it('a rejected review stays visible to the moderator', () => {
    expect(reviewLane('rejected')).toBe('hidden');
    expect(REVIEW_LANE_TITLE.hidden).toBe('Not published');
  });
});

describe('audit entity', () => {
  it('is the table name the database trigger files under', () => {
    const sql = readFileSync(
      join(__dirname, '../../../supabase/migrations/20261105000001_review_moderation_audit.sql'),
      'utf8',
    );
    const tables = [...sql.matchAll(/create trigger \w+_audit\s+after update of moderation_state on (\w+)/g)].map(
      (m) => m[1],
    );
    expect(tables, 'the reviews audit trigger was not found').toContain(REVIEW_AUDIT_ENTITY);
    expect(sql).toContain(`'${REVIEW_AUDIT_ENTITY}',`);
  });
});
