/**
 * Departure times on the island's wall clock.
 *
 * A vendor types "09:00" and means nine o'clock where the boat is, not nine in the browser's zone
 * or in UTC. Pure and import-free so the conversion can be tested without a backend.
 */

export class SlotInputInvalid extends Error {}

/** Wall-clock minus real time, in ms, for a zone at an instant. */
function offsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const wallAsUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return wallAsUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant at which `dateIso` (YYYY-MM-DD) `time` (HH:MM) is showing on a clock in `timeZone`. */
export function zonedToUtc(dateIso: string, time: string, timeZone: string): Date {
  const [y, m, d] = dateIso.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes settle zones whose offset changes between the guess and the answer.
  let guess = wall;
  for (let i = 0; i < 2; i += 1) guess = wall - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

export interface NewSlotInput {
  experienceId: string;
  /** YYYY-MM-DD, island calendar date of the first departure. */
  date: string;
  /** HH:MM, 24-hour. */
  time: string;
  capacity: number;
  durationMinutes: number;
  /** How many consecutive days to repeat the departure, starting on `date`. 1 = just that day. */
  repeatDays: number;
  timeZone: string;
  now: Date;
}

/** A type alias, not an interface: supabase-js insert wants an index-signature-compatible row. */
export type SlotRow = {
  experience_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
};

export const SLOT_LIMITS = { maxCapacity: 500, maxRepeatDays: 60 } as const;

function addDays(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Validate a departure and expand it into the rows to insert. Throws `SlotInputInvalid`. */
export function buildSlotRows(i: NewSlotInput): SlotRow[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date) || addDays(i.date, 0) !== i.date) {
    throw new SlotInputInvalid('Choose a date.');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(i.time)) {
    throw new SlotInputInvalid('Enter the departure time as HH:MM, for example 09:00.');
  }
  if (!Number.isInteger(i.capacity) || i.capacity < 1 || i.capacity > SLOT_LIMITS.maxCapacity) {
    throw new SlotInputInvalid(`Capacity must be a whole number from 1 to ${SLOT_LIMITS.maxCapacity}.`);
  }
  if (!Number.isInteger(i.repeatDays) || i.repeatDays < 1 || i.repeatDays > SLOT_LIMITS.maxRepeatDays) {
    throw new SlotInputInvalid(`Repeat for 1 to ${SLOT_LIMITS.maxRepeatDays} days.`);
  }
  if (!Number.isFinite(i.durationMinutes) || i.durationMinutes < 1) {
    throw new SlotInputInvalid('This experience has no duration set, so its end time is unknown.');
  }

  const rows: SlotRow[] = [];
  for (let n = 0; n < i.repeatDays; n += 1) {
    const start = zonedToUtc(addDays(i.date, n), i.time, i.timeZone);
    if (start.getTime() <= i.now.getTime()) {
      throw new SlotInputInvalid(
        n === 0 ? 'That departure time has already passed.' : 'Part of that range is in the past.',
      );
    }
    rows.push({
      experience_id: i.experienceId,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + i.durationMinutes * 60_000).toISOString(),
      capacity: i.capacity,
    });
  }
  return rows;
}
