import { describe, expect, it } from 'vitest';
import { describeDay, isoOf, tripDay } from './day';

const b = (dateISO: string, time: string) => ({ dateISO, time });

describe('tripDay', () => {
  it('shows today when something is booked today', () => {
    const day = tripDay([b('2026-09-23', '09:00')], '2026-09-23');
    expect(day.iso).toBe('2026-09-23');
    expect(day.isToday).toBe(true);
    expect(day.bookings).toHaveLength(1);
  });

  it('shows the next day ahead when nothing is booked today', () => {
    // The defect this file exists for: a Thursday booking under a Wednesday header.
    const day = tripDay([b('2026-09-24', '13:30')], '2026-09-23');
    expect(day.iso).toBe('2026-09-24');
    expect(day.isToday).toBe(false);
  });

  it('falls back to today when every booking is in the past', () => {
    const day = tripDay([b('2026-09-20', '09:00')], '2026-09-23');
    expect(day.iso).toBe('2026-09-23');
    expect(day.isToday).toBe(true);
    expect(day.bookings).toHaveLength(0);
    // Past bookings are not on the day, but they are not lost either.
    expect(day.otherDays).toHaveLength(1);
  });

  it('falls back to today when there are no bookings at all', () => {
    expect(tripDay([], '2026-09-23')).toMatchObject({ iso: '2026-09-23', isToday: true });
  });

  it('keeps only the chosen day on the timeline and counts the rest', () => {
    const day = tripDay(
      [b('2026-09-24', '13:30'), b('2026-09-26', '09:00'), b('2026-09-24', '09:00')],
      '2026-09-23',
    );
    expect(day.iso).toBe('2026-09-24');
    expect(day.bookings.map((x) => x.time)).toEqual(['09:00', '13:30']);
    expect(day.otherDays).toHaveLength(1);
  });

  it('sorts by time within the day regardless of input order', () => {
    const day = tripDay([b('2026-09-23', '16:00'), b('2026-09-23', '08:00')], '2026-09-23');
    expect(day.bookings.map((x) => x.time)).toEqual(['08:00', '16:00']);
  });

  it('does not treat a later month as earlier — string compare must not be lexical-only nonsense', () => {
    const day = tripDay([b('2026-10-01', '09:00')], '2026-09-30');
    expect(day.iso).toBe('2026-10-01');
  });
});

describe('describeDay', () => {
  it('names today and tomorrow', () => {
    expect(describeDay('2026-09-23', '2026-09-23')).toBe('Today');
    expect(describeDay('2026-09-24', '2026-09-23')).toBe('Tomorrow');
  });

  it('crosses a month boundary when naming tomorrow', () => {
    expect(describeDay('2026-10-01', '2026-09-30')).toBe('Tomorrow');
  });

  it('spells out anything further away', () => {
    expect(describeDay('2026-09-26', '2026-09-23')).toBe('Saturday 26 September');
  });

  it('parses as local time, not UTC — a date must not slip a day', () => {
    // `new Date('2026-09-24')` is UTC midnight, which is the 23rd in the Caribbean.
    expect(describeDay('2026-09-24', '2026-09-01')).toBe('Thursday 24 September');
  });
});

describe('isoOf', () => {
  it('formats a local date without a timezone shift', () => {
    expect(isoOf(new Date(2026, 8, 24))).toBe('2026-09-24');
  });
});
