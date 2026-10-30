import { describe, expect, it } from 'vitest';
import { countActivePromotions, summariseBookings, summariseFailedPayments } from './dashboardMetrics';

const now = new Date('2026-10-30T12:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe('dashboard metrics', () => {
  it('keeps each currency separate and never adds them together', () => {
    const s = summariseBookings(
      [
        { status: 'confirmed', currency: 'USD', total_minor: 10000, created_at: day(1) },
        { status: 'completed', currency: 'USD', total_minor: '5000', created_at: day(2) },
        { status: 'confirmed', currency: 'JMD', total_minor: 90000, created_at: day(3) },
      ],
      now,
    );
    expect(s.grossByCurrency).toEqual({ USD: 15000, JMD: 90000 });
  });

  it('counts only money taken and not returned as gross value', () => {
    const s = summariseBookings(
      ['pending_payment', 'cancelled', 'refunded', 'expired'].map((status) => ({
        status,
        currency: 'USD',
        total_minor: 10000,
        created_at: day(1),
      })),
      now,
    );
    expect(s.grossByCurrency).toEqual({});
    expect(s.count).toBe(4);
  });

  it('ignores bookings outside the 30-day window and in the future', () => {
    const s = summariseBookings(
      [
        { status: 'confirmed', currency: 'USD', total_minor: 100, created_at: day(31) },
        { status: 'confirmed', currency: 'USD', total_minor: 100, created_at: day(-1) },
        { status: 'confirmed', currency: 'USD', total_minor: 100, created_at: day(29) },
      ],
      now,
    );
    expect(s.count).toBe(1);
  });

  it('groups failed payments by reason and ignores paid ones', () => {
    const s = summariseFailedPayments(
      [
        { status: 'failed', currency: 'USD', amount_minor: 1, failure_message: 'Card declined', created_at: day(1) },
        { status: 'failed', currency: 'USD', amount_minor: 1, failure_message: 'Card declined', created_at: day(2) },
        { status: 'failed', currency: 'USD', amount_minor: 1, failure_message: null, created_at: day(2) },
        { status: 'paid', currency: 'USD', amount_minor: 1, failure_message: null, created_at: day(1) },
      ],
      now,
    );
    expect(s).toEqual({ count: 3, reasons: { 'Card declined': 2, 'No reason given': 1 } });
  });

  it('counts a promotion active only while approved and inside its dates', () => {
    const p = (approval_state: string, s: number, e: number) => ({
      approval_state,
      starts_at: day(s),
      ends_at: day(e),
    });
    expect(
      countActivePromotions([p('approved', 1, -1), p('approved', 5, 2), p('approved', -1, -5), p('pending', 1, -1), p('disabled', 1, -1)], now),
    ).toBe(1);
  });
});
