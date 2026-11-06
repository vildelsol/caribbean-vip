import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canReviewBooking,
  REVIEW_BLOCKED_COPY,
  REVIEWABLE_BOOKING_STATUSES,
  type ReviewableBookingLike,
} from './reviewEligibility';

const GUARD = join(
  __dirname,
  '../../../../supabase/migrations/20261104000011_review_integrity.sql',
);

// Fixed instants. Nothing here reads the clock: a seeded test that does passes locally and fails
// in CI, which runs in UTC.
const NOW = '2026-11-05T12:00:00Z';

const booking = (over: Partial<ReviewableBookingLike> = {}): ReviewableBookingLike => ({
  id: 'b1',
  status: 'confirmed',
  dateISO: '2026-11-01',
  time: '09:00',
  ...over,
});

describe('the mirror matches the database guard', () => {
  const sql = readFileSync(GUARD, 'utf8');

  it('accepts exactly the booking statuses the guard accepts', () => {
    const m = sql.match(/b_status not in \(([^)]*)\)/);
    expect(m, "the guard's status list was not found").not.toBeNull();
    const inSql = [...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    expect(inSql).toEqual([...REVIEWABLE_BOOKING_STATUSES].sort());
  });

  it('the guard still refuses a slot that has not started', () => {
    expect(sql).toMatch(/slot_start > now\(\)/);
  });
});

describe('canReviewBooking', () => {
  it('allows a confirmed booking whose slot has passed', () => {
    const r = canReviewBooking(booking(), NOW);
    expect(r.ok).toBe(true);
    expect(r.ok && r.startedAtISO).toBe('2026-11-01T09:00:00+00:00');
  });

  it('allows a completed booking too', () => {
    expect(canReviewBooking(booking({ status: 'completed' }), NOW).ok).toBe(true);
  });

  it('refuses a slot in the future', () => {
    const r = canReviewBooking(booking({ dateISO: '2026-12-01' }), NOW);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('not_happened_yet');
  });

  it('reads the slot time as UTC wall-clock, like resolve-slot', () => {
    // 11:59 on the day itself is past at 12:00 UTC; 12:01 is not. A local-time reading would move
    // this boundary by the runner's offset.
    expect(canReviewBooking(booking({ dateISO: '2026-11-05', time: '11:59' }), NOW).ok).toBe(true);
    expect(canReviewBooking(booking({ dateISO: '2026-11-05', time: '12:01' }), NOW).ok).toBe(false);
  });

  it('refuses a cancelled trip, and says so rather than blaming the date', () => {
    const r = canReviewBooking(booking({ status: 'cancelled' }), NOW);
    expect(!r.ok && r.reason).toBe('cancelled');
    expect(REVIEW_BLOCKED_COPY.cancelled).toMatch(/cancelled/i);
    expect(REVIEW_BLOCKED_COPY.not_happened_yet).not.toMatch(/cancelled/i);
  });

  it('refuses an unpaid booking', () => {
    expect(!canReviewBooking(booking({ status: 'pending_payment' }), NOW).ok).toBe(true);
    const r = canReviewBooking(booking({ status: 'pending_payment' }), NOW);
    expect(!r.ok && r.reason).toBe('not_paid');
  });

  it('refuses a second review of the same booking', () => {
    const r = canReviewBooking(booking(), NOW, new Set(['b1']));
    expect(!r.ok && r.reason).toBe('already_reviewed');
  });

  it('treats an unreadable date as not yet, never as reviewable', () => {
    for (const bad of [{ dateISO: '' }, { time: '' }, { dateISO: 'soon' }]) {
      const r = canReviewBooking(booking(bad), NOW);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('every reason has copy', () => {
    const reasons = ['cancelled', 'not_paid', 'not_happened_yet', 'already_reviewed'] as const;
    for (const r of reasons) expect(REVIEW_BLOCKED_COPY[r].length).toBeGreaterThan(10);
  });
});
