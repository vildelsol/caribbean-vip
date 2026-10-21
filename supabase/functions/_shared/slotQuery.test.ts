import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSlotQuery } from './slotQuery';

/**
 * resolve-slot used to splice `date` and `time` into a timestamp string and hand it to Postgres,
 * so a malformed value came back as a database error whose text (`detail: error.message`) named
 * columns and types. Anyone with the anon key could read that. Input is now validated first, and
 * database errors are logged, never returned.
 */

describe('what resolve-slot accepts', () => {
  it('builds the UTC timestamp for a valid date and time', () => {
    expect(parseSlotQuery('Catamaran Snorkel & Sunset', '2026-10-25', '09:00')).toEqual({
      ok: true,
      title: 'Catamaran Snorkel & Sunset',
      startsAt: '2026-10-25T09:00:00+00:00',
    });
  });

  it('accepts the edges of a day', () => {
    expect(parseSlotQuery('X', '2026-01-01', '00:00').ok).toBe(true);
    expect(parseSlotQuery('X', '2026-12-31', '23:59').ok).toBe(true);
  });

  it('accepts 29 February only in a leap year', () => {
    expect(parseSlotQuery('X', '2028-02-29', '09:00').ok).toBe(true);
    expect(parseSlotQuery('X', '2026-02-29', '09:00').ok).toBe(false);
  });

  it.each([
    ['2026-13-01', 'month 13'],
    ['2026-00-10', 'month 0'],
    ['2026-02-30', 'a day that does not exist'],
    ['2026-10-32', 'day 32'],
    ['2026-1-5', 'unpadded'],
    ['26-10-25', 'two-digit year'],
    ['2026/10/25', 'wrong separator'],
    ['2026-10-25T09:00', 'a timestamp in the date field'],
    ["2026-10-25'; drop table x; --", 'injection text'],
    ['', 'empty'],
    ['not a date', 'prose'],
  ])('refuses the date %j (%s)', (date) => {
    expect(parseSlotQuery('X', date, '09:00')).toEqual({ ok: false });
  });

  it.each([
    ['24:00', 'hour 24'],
    ['09:60', 'minute 60'],
    ['9:00', 'unpadded'],
    ['09:00:00', 'with seconds'],
    ['09.00', 'wrong separator'],
    ['09:00+05:00', 'with an offset'],
    ['', 'empty'],
    ['noon', 'prose'],
  ])('refuses the time %j (%s)', (time) => {
    expect(parseSlotQuery('X', '2026-10-25', time)).toEqual({ ok: false });
  });

  it.each([['', 'empty'], ['   ', 'blank'], ['x'.repeat(201), 'over 200 characters']])(
    'refuses the title %j (%s)',
    (title) => {
      expect(parseSlotQuery(title, '2026-10-25', '09:00')).toEqual({ ok: false });
    },
  );

  it('refuses null for any field', () => {
    expect(parseSlotQuery(null, '2026-10-25', '09:00')).toEqual({ ok: false });
    expect(parseSlotQuery('X', null, '09:00')).toEqual({ ok: false });
    expect(parseSlotQuery('X', '2026-10-25', null)).toEqual({ ok: false });
  });
});

/**
 * A tripwire, not a behaviour test: the handler needs Deno and a live database, so nothing here can
 * run it. This reads its source and fails if a database error's text is put back into a response,
 * which is the shape of the original leak.
 */
describe('resolve-slot never returns database error text', () => {
  const source = readFileSync(new URL('../resolve-slot/index.ts', import.meta.url), 'utf8');

  it('has no `detail:` field in any response', () => {
    expect(source).not.toMatch(/\bdetail\s*:/);
  });

  it('never passes an error object\'s message into json()', () => {
    expect(source).not.toMatch(/json\([^)]*\.message/);
  });
});
