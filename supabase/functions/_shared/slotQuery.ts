/**
 * Validating what `resolve-slot` is asked for.
 *
 * The function used to splice `date` and `time` straight into a timestamp string and give it to
 * Postgres, so a malformed value came back as a database error whose text named columns and types.
 * Anything that is not a real calendar date and a real clock time is refused here, before any query.
 * Pure and in its own file for the same reason as `returnUrls.ts`.
 */

export type SlotQuery = { ok: true; title: string; startsAt: string } | { ok: false };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_TITLE = 200;

function isRealDate(year: number, month: number, day: number): boolean {
  // Date.UTC rolls an impossible day over (30 Feb becomes 2 Mar), so a round trip is the test.
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * The slot timestamp is built as UTC wall-clock, matching how the seed generates departures
 * (see resolve-slot). `{ ok: false }` carries no reason on purpose: the caller answers every
 * refusal the same way, so the response does not teach an attacker which part failed.
 */
export function parseSlotQuery(
  title: string | null,
  date: string | null,
  time: string | null,
): SlotQuery {
  if (title === null || date === null || time === null) return { ok: false };
  if (title.trim() === '' || title.length > MAX_TITLE) return { ok: false };

  const d = DATE.exec(date);
  if (!d || !TIME.test(time)) return { ok: false };
  if (!isRealDate(Number(d[1]), Number(d[2]), Number(d[3]))) return { ok: false };

  return { ok: true, title, startsAt: `${date}T${time}:00+00:00` };
}
