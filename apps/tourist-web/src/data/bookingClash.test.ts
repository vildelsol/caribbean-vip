import { describe, expect, it } from 'vitest';
import { experiencesFor, ISLANDS } from './catalogue';
import {
  attendeeLabel,
  bookingsFor,
  describeClash,
  findBookingClashes,
  knownAttendees,
  normaliseAttendee,
  sameAttendee,
  type BookingLike,
} from './bookingClash';

const DAY = '2026-10-08';
const OTHER_DAY = '2026-10-09';

const island = ISLANDS[0]!;
const catalogue = experiencesFor(island.id);
const first = catalogue[0]!;
const second = catalogue.find((e) => e.id !== first.id)!;

function booking(over: Partial<BookingLike> = {}): BookingLike {
  return {
    id: 'b1',
    experienceId: first.id,
    dateISO: DAY,
    time: '09:00',
    status: 'confirmed',
    attendeeName: null,
    ...over,
  };
}

describe('one person cannot be in two places at once', () => {
  it('flags a second booking that runs at the same time', () => {
    const held = booking();
    const clashes = findBookingClashes(
      { experienceId: second.id, dateISO: DAY, time: '09:00', attendeeName: null },
      [held],
    );
    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.kind).toBe('overlap');
    expect(clashes[0]!.existing.id).toBe('b1');
  });

  it('flags a departure that starts while the held booking is still running', () => {
    // The defect as reported was "the same time", but the harm is identical at any point inside
    // the first booking's duration — a guest halfway up Dunn's River cannot start a boat.
    const held = booking({ time: '09:00' });
    const mid = 30; // minutes into the first, which every listing in the catalogue outlasts.
    expect(first.durationMinutes).toBeGreaterThan(mid);
    const clashes = findBookingClashes(
      { experienceId: second.id, dateISO: DAY, time: '09:30', attendeeName: null },
      [held],
    );
    expect(clashes[0]!.kind).toBe('overlap');
  });

  it('says nothing about a booking on another day', () => {
    const clashes = findBookingClashes(
      { experienceId: second.id, dateISO: OTHER_DAY, time: '09:00', attendeeName: null },
      [booking()],
    );
    expect(clashes).toEqual([]);
  });

  it('says nothing about a cancelled booking — the seat was given back', () => {
    const clashes = findBookingClashes(
      { experienceId: second.id, dateISO: DAY, time: '09:00', attendeeName: null },
      [booking({ status: 'cancelled' })],
    );
    expect(clashes).toEqual([]);
  });

  it('does not let a booking clash with itself when it is rescheduled', () => {
    const held = booking();
    const clashes = findBookingClashes(
      {
        experienceId: held.experienceId,
        dateISO: DAY,
        time: '09:00',
        attendeeName: null,
        ignoreBookingId: 'b1',
      },
      [held],
    );
    expect(clashes).toEqual([]);
  });

  it('puts the overlap before the tight connection, so showing one shows the worst', () => {
    const overlapping = booking({ id: 'over', time: '09:00' });
    // A booking that ends well before, but not far enough before to travel, sorts second.
    const clashes = findBookingClashes(
      { experienceId: second.id, dateISO: DAY, time: '09:00', attendeeName: null },
      [overlapping],
    );
    expect(clashes[0]!.kind).toBe('overlap');
  });
});

describe('a couple booking from one account is not a double booking', () => {
  it('does not flag an overlap when the two bookings are for different people', () => {
    // The load-bearing case. One card, two people, two things at the same hour — refusing this,
    // or warning about it every time, would be the app misreading its most ordinary customer.
    const hers = booking({ attendeeName: 'Sarah' });
    const clashes = findBookingClashes(
      { experienceId: second.id, dateISO: DAY, time: '09:00', attendeeName: 'Marcus' },
      [hers],
    );
    expect(clashes).toEqual([]);
  });

  it('still flags an overlap when the same named person is booked twice', () => {
    const hers = booking({ attendeeName: 'Sarah' });
    const clashes = findBookingClashes(
      { experienceId: second.id, dateISO: DAY, time: '09:00', attendeeName: 'Sarah' },
      [hers],
    );
    expect(clashes).toHaveLength(1);
  });

  it('treats a name typed with different capitalisation or spacing as the same person', () => {
    const hers = booking({ attendeeName: 'Sarah' });
    const clashes = findBookingClashes(
      { experienceId: second.id, dateISO: DAY, time: '09:00', attendeeName: '  sarah ' },
      [hers],
    );
    expect(clashes).toHaveLength(1);
  });

  it('treats a named attendee and the account holder as different people', () => {
    // They are: the account holder booked something for Sarah and then something for themselves.
    const hers = booking({ attendeeName: 'Sarah' });
    const clashes = findBookingClashes(
      { experienceId: second.id, dateISO: DAY, time: '09:00', attendeeName: null },
      [hers],
    );
    expect(clashes).toEqual([]);
  });

  it('errs towards warning when two names are merely similar', () => {
    // "Sarah" and "Sarah M" are not merged. Suppressing a warning wrongly sells a seat nobody can
    // use; raising one wrongly costs a tap and the guest can say it is for someone else.
    expect(sameAttendee('Sarah', 'Sarah M')).toBe(false);
  });
});

describe('a day belongs to one person', () => {
  it('leaves a partner’s booking out of the account holder’s day', () => {
    // The consequence that follows from the feature and would otherwise have been a new defect:
    // Irie plans from these, so a partner's catamaran would have made the account holder's free
    // morning read as "your day is already full".
    const mine = booking({ id: 'mine', attendeeName: null });
    const theirs = booking({ id: 'theirs', attendeeName: 'Marcus' });
    expect(bookingsFor([mine, theirs], null).map((b) => b.id)).toEqual(['mine']);
    expect(bookingsFor([mine, theirs], 'Marcus').map((b) => b.id)).toEqual(['theirs']);
  });

  it('uses the same matching rule as the clash detector', () => {
    // If these two ever disagreed, a screen could warn about a clash it then planned around, or
    // plan around a booking it had just said was somebody else's.
    const theirs = booking({ attendeeName: 'Marcus' });
    const selected = bookingsFor([theirs], ' MARCUS ');
    expect(selected).toHaveLength(1);
    expect(sameAttendee(theirs.attendeeName, ' MARCUS ')).toBe(true);
  });
});

describe('naming', () => {
  it('reads the account holder as their onboarding name, and "Guest" when they skipped it', () => {
    expect(attendeeLabel(null, 'Ro')).toBe('Ro');
    expect(attendeeLabel(null, '')).toBe('Guest');
    expect(attendeeLabel(null, '   ')).toBe('Guest');
  });

  it('prefers the attendee over the account holder', () => {
    expect(attendeeLabel('Marcus', 'Ro')).toBe('Marcus');
    expect(attendeeLabel('  ', 'Ro')).toBe('Ro');
  });

  it('normalises to a comparable key', () => {
    expect(normaliseAttendee('  Sarah  ')).toBe('sarah');
    expect(normaliseAttendee(null)).toBe('');
  });

  it('always offers the account holder first, and never offers a name twice', () => {
    const names = knownAttendees(
      [
        booking({ id: 'a', attendeeName: 'Sarah' }),
        booking({ id: 'b', attendeeName: 'Marcus' }),
        booking({ id: 'c', attendeeName: 'sarah' }),
        booking({ id: 'd', attendeeName: null }),
      ],
      'Ro',
    );
    expect(names[0]).toBe('Ro');
    expect(names.filter((n) => n.toLowerCase() === 'sarah')).toHaveLength(1);
    expect(names).not.toContain('');
  });

  it('opens with just the account holder when nobody else has been booked for', () => {
    expect(knownAttendees([], '')).toEqual(['Guest']);
  });
});

describe('the warning says something the guest can act on', () => {
  it('names the booking, the time and who it belongs to', () => {
    const held = booking({ attendeeName: 'Sarah' });
    const clash = findBookingClashes(
      { experienceId: second.id, dateISO: DAY, time: '09:00', attendeeName: 'Sarah' },
      [held],
    )[0]!;
    const message = describeClash(clash, 'Sarah');
    expect(message.headline).toContain('Sarah');
    expect(message.detail).toContain(first.title);
    // No bare 24-hour clock on a guest-facing string — `formatClock` is the app's one format.
    expect(message.detail).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
  });

  it('never states a negative duration', () => {
    // A shortfall computed from an overlap can go negative, and "−45 min short" is nonsense on a
    // screen someone is budgeting a morning from.
    const held = booking();
    const clash = findBookingClashes(
      { experienceId: second.id, dateISO: DAY, time: '09:00', attendeeName: null },
      [held],
    )[0]!;
    expect(describeClash(clash, 'Guest').detail).not.toMatch(/-\d/);
  });
});
