import { describe, expect, it, vi } from 'vitest';
import { REVIEW_LIMITS } from '@cvip/types';
import {
  guestFacingError,
  reviewedBookingIds,
  submitReview,
  type MyReview,
  type ReviewsClient,
} from './reviewSubmission';

const NOW = '2026-11-05T12:00:00Z';
const booking = { id: 'b1', experienceId: 'e1', status: 'completed', dateISO: '2026-11-01', time: '09:00' };

type InsertRow = Parameters<ReviewsClient['insertReview']>[0];

function client(error: string | null = null) {
  const insertReview = vi.fn(async (_row: InsertRow) => error);
  const c: ReviewsClient = { insertReview, listMyReviews: async () => [] };
  return { c, insertReview };
}

describe('submitReview', () => {
  it('sends a checked draft and reports success', async () => {
    const { c, insertReview } = client();
    await expect(submitReview(c, booking, { rating: 5, body: ' great ' }, NOW)).resolves.toEqual({ ok: true });
    expect(insertReview).toHaveBeenCalledWith({
      booking_id: 'b1',
      experience_id: 'e1',
      rating: 5,
      body: 'great',
    });
  });

  it('never sends moderation_state — the database decides it', async () => {
    const { c, insertReview } = client();
    await submitReview(c, booking, { rating: 4, body: '' }, NOW);
    expect(Object.keys(insertReview.mock.calls[0]![0])).not.toContain('moderation_state');
  });

  it('sends a blank body as null', async () => {
    const { c, insertReview } = client();
    await submitReview(c, booking, { rating: 4, body: '   ' }, NOW);
    expect(insertReview.mock.calls[0]![0].body).toBeNull();
  });

  it('refuses a trip that has not happened, without sending anything', async () => {
    const { c, insertReview } = client();
    const r = await submitReview(c, { ...booking, dateISO: '2026-12-25' }, { rating: 5, body: '' }, NOW);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problem).toMatch(/once the trip has happened/);
    expect(insertReview, 'a doomed insert was sent anyway').not.toHaveBeenCalled();
  });

  it('refuses a second review of the same booking, without sending anything', async () => {
    const { c, insertReview } = client();
    const r = await submitReview(c, booking, { rating: 5, body: '' }, NOW, new Set(['b1']));
    expect(!r.ok && r.problem).toMatch(/already reviewed/);
    expect(insertReview).not.toHaveBeenCalled();
  });

  it('refuses an invalid draft, without sending anything', async () => {
    const { c, insertReview } = client();
    const r = await submitReview(c, booking, { rating: 9, body: '' }, NOW);
    expect(!r.ok && r.problem).toMatch(/1 and 5/);
    expect(insertReview).not.toHaveBeenCalled();

    const long = await submitReview(c, booking, { rating: 4, body: 'x'.repeat(REVIEW_LIMITS.body + 1) }, NOW);
    expect(long.ok).toBe(false);
    expect(insertReview).not.toHaveBeenCalled();
  });

  it('maps a database refusal to something the guest can act on', async () => {
    const { c } = client('review_denied: the experience has not happened yet');
    const r = await submitReview(c, booking, { rating: 5, body: '' }, NOW);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problem).toMatch(/once the trip has happened/);
  });
});

describe('guestFacingError', () => {
  it.each([
    ['review_denied: not your booking', /not on this account/],
    ['review_denied: a review must be of the experience that was booked', /does not match the trip/],
    ['review_denied: the experience has not happened yet', /once the trip has happened/],
    ['duplicate key value violates unique constraint "reviews_booking_id_key"', /already reviewed/],
    ['new row violates check constraint "reviews_body_length"', /too long/],
  ])('maps %s', (raw, expected) => {
    expect(guestFacingError(raw)).toMatch(expected);
  });

  it('names demo mode rather than inviting a pointless retry', () => {
    const out = guestFacingError('demo mode: there is no backend to save a review to');
    expect(out).toMatch(/demo/i);
    expect(out).not.toMatch(/try again/i);
  });

  it('never shows a raw database message', () => {
    const raw = 'PGRST204: column reviews.moderation_state does not exist in schema cache';
    const out = guestFacingError(raw);
    expect(out).not.toContain('PGRST');
    expect(out).not.toContain('schema');
    expect(out).toBe('That review could not be saved. Try again in a moment.');
  });
});

describe('reviewedBookingIds', () => {
  it('collects the booking ids', () => {
    const rows: MyReview[] = [
      { bookingId: 'b1', experienceId: 'e1', rating: 5, body: null, state: 'pending' },
      { bookingId: 'b2', experienceId: 'e2', rating: 3, body: 'ok', state: 'published' },
    ];
    expect([...reviewedBookingIds(rows)].sort()).toEqual(['b1', 'b2']);
  });

  it('is empty for no reviews, so nothing is blocked by accident', () => {
    expect(reviewedBookingIds([]).size).toBe(0);
  });
});
