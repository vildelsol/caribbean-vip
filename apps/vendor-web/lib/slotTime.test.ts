import { describe, expect, it } from 'vitest';
import { SlotInputInvalid, buildSlotRows, zonedToUtc, type NewSlotInput } from './slotTime';

const JAMAICA = 'America/Jamaica'; // UTC-5, no daylight saving
const NOW = new Date('2026-10-29T15:00:00Z');

describe('zonedToUtc', () => {
  it('reads 09:00 in Jamaica as 14:00 UTC and 09:00 in Barbados as 13:00 UTC', () => {
    expect(zonedToUtc('2026-10-29', '09:00', JAMAICA).toISOString()).toBe('2026-10-29T14:00:00.000Z');
    expect(zonedToUtc('2026-10-29', '09:00', 'America/Barbados').toISOString()).toBe('2026-10-29T13:00:00.000Z');
  });

  it('puts a late evening departure on the same island date, not the next UTC date', () => {
    expect(zonedToUtc('2026-10-29', '21:30', JAMAICA).toISOString()).toBe('2026-10-30T02:30:00.000Z');
  });

  it('follows daylight saving in a zone that has it', () => {
    expect(zonedToUtc('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(zonedToUtc('2026-12-01', '09:00', 'America/New_York').toISOString()).toBe('2026-12-01T14:00:00.000Z');
  });
});

const input = (over: Partial<NewSlotInput> = {}): NewSlotInput => ({
  experienceId: 'e1',
  date: '2026-10-30',
  time: '09:00',
  capacity: 12,
  durationMinutes: 180,
  repeatDays: 1,
  timeZone: JAMAICA,
  now: NOW,
  ...over,
});

describe('buildSlotRows', () => {
  it('builds one row with an end time from the duration', () => {
    expect(buildSlotRows(input())).toEqual([
      {
        experience_id: 'e1',
        starts_at: '2026-10-30T14:00:00.000Z',
        ends_at: '2026-10-30T17:00:00.000Z',
        capacity: 12,
      },
    ]);
  });

  it('repeats daily, across a month end', () => {
    const rows = buildSlotRows(input({ date: '2026-10-30', repeatDays: 3 }));
    expect(rows.map((r) => r.starts_at.slice(0, 10))).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it.each([
    ['a bad date', { date: '2026-02-31' }],
    ['a bad time', { time: '9am' }],
    ['24:00', { time: '24:00' }],
    ['zero capacity', { capacity: 0 }],
    ['a fractional capacity', { capacity: 2.5 }],
    ['capacity over the limit', { capacity: 501 }],
    ['zero repeat days', { repeatDays: 0 }],
    ['repeat over the limit', { repeatDays: 61 }],
    ['no duration', { durationMinutes: 0 }],
  ])('refuses %s', (_name, over) => {
    expect(() => buildSlotRows(input(over))).toThrow(SlotInputInvalid);
  });

  it('refuses a departure that has already left', () => {
    // 09:00 Jamaica on the 29th is 14:00Z, an hour before NOW.
    expect(() => buildSlotRows(input({ date: '2026-10-29' }))).toThrow('already passed');
  });

  it('accepts a departure later today (positive control for the past check)', () => {
    expect(buildSlotRows(input({ date: '2026-10-29', time: '17:00' }))).toHaveLength(1);
  });
});
