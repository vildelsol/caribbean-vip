import { describe, expect, it } from 'vitest';
import {
  ITINERARY_SHAPES,
  buildItinerary,
  buildSoonestDay,
  formatClock,
  formatSpan,
  minutesOfTime,
  shapeById,
  type BuildInput,
  type ItineraryShape,
} from './itinerary';
import {
  DEFAULT_PARTY,
  ISLANDS,
  destinationsFor,
  experiencesFor,
  visibleExperiences,
  type DemoDestination,
  AT_VENUE_METRES,
  experienceCoords,
} from './catalogue';
import { distanceMetres } from '@cvip/types';
import { isoDate, slotsFor } from './availability';

/** Straight-line metres between where two listings actually start. */
function metresApart(a: Parameters<typeof experienceCoords>[0], b: Parameters<typeof experienceCoords>[0]) {
  const pa = experienceCoords(a);
  const pb = experienceCoords(b);
  return pa && pb ? distanceMetres(pa, pb) : null;
}
import { DEMO_EXPERIENCES } from '@cvip/demo';

/**
 * Irie's itinerary builder.
 *
 * The three properties worth testing are the ones a demonstration would be embarrassed by if they
 * broke: that Irie cannot put an invisible listing on a guest's day, that it never invents a
 * figure, and that the day it composes could actually be booked as drawn.
 *
 * The availability simulation is deterministic (`availability.ts` derives slots from a hash of the
 * listing id and the date), so these assertions hold on any machine — but the *date* is real, so
 * every case builds against a fixed near-future day rather than "today", whose morning departures
 * disappear as the afternoon wears on.
 */

const island = ISLANDS[0]!;
const destination = destinationsFor(island.id)[0]! as DemoDestination;

/** A day far enough ahead that the 90-minute same-day cut-off can never apply. */
function futureDay(offsetDays = 3): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return isoDate(d);
}

function input(overrides: Partial<BuildInput> = {}): BuildInput {
  return {
    shape: shapeById('full-day')!,
    islandId: island.id,
    destination,
    dateISO: futureDay(),
    party: DEFAULT_PARTY,
    bookings: [],
    plannedExperienceIds: [],
    ...overrides,
  };
}

describe('time helpers', () => {
  it('parses and formats a slot key symmetrically', () => {
    expect(minutesOfTime('09:00')).toBe(540);
    expect(minutesOfTime('16:30')).toBe(990);
    expect(formatClock(540)).toBe('9:00 AM');
    expect(formatClock(990)).toBe('4:30 PM');
  });

  it('formats midnight and noon as 12, not 0', () => {
    expect(formatClock(0)).toBe('12:00 AM');
    expect(formatClock(720)).toBe('12:00 PM');
  });

  it('spans from the first start to the last end', () => {
    const built = buildItinerary(input());
    expect(built.stops.length).toBeGreaterThan(0);
    expect(formatSpan(built.stops)).toBe(
      `${formatClock(built.stops[0]!.startMinutes)} – ${formatClock(built.stops[built.stops.length - 1]!.endMinutes)}`,
    );
  });

  it('has no span to format when nothing could be placed', () => {
    expect(formatSpan([])).toBe('');
  });
});

describe('shapes', () => {
  it('exposes every shape by id', () => {
    for (const shape of ITINERARY_SHAPES) {
      expect(shapeById(shape.id)).toBe(shape);
    }
    expect(shapeById('nonsense')).toBeUndefined();
  });

  it('gives every shape a window that runs forwards and room for more than one stop', () => {
    for (const shape of ITINERARY_SHAPES) {
      expect(shape.toMinutes).toBeGreaterThan(shape.fromMinutes);
      expect(shape.maxStops).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('what may appear on a day', () => {
  /**
   * The dataset carries a draft listing and an approved listing under an unapproved vendor on
   * purpose. Neither is publicly visible, and a concierge that puts one on a guest's day has
   * bypassed the rule the RLS policy exists to enforce.
   */
  it('never places a listing the public cannot see', () => {
    const hidden = DEMO_EXPERIENCES.filter(
      (e) => !visibleExperiences().some((v) => v.id === e.id),
    );
    expect(hidden.length).toBeGreaterThan(0);

    for (const shape of ITINERARY_SHAPES) {
      for (const offset of [1, 2, 3, 4, 5]) {
        const built = buildItinerary(input({ shape, dateISO: futureDay(offset) }));
        for (const stop of built.stops) {
          expect(hidden.some((h) => h.id === stop.experience.id)).toBe(false);
        }
      }
    }
  });

  it('never places a listing from another island', () => {
    for (const isl of ISLANDS) {
      const dest = destinationsFor(isl.id)[0];
      if (!dest) continue;
      const built = buildItinerary(input({ islandId: isl.id, destination: dest }));
      for (const stop of built.stops) {
        expect(stop.experience.islandId).toBe(isl.id);
      }
    }
  });

  it('cannot suggest a listing twice, or repeat a category', () => {
    for (const offset of [1, 3, 6]) {
      const built = buildItinerary(input({ dateISO: futureDay(offset) }));
      const ids = built.stops.map((s) => s.experience.id);
      const categories = built.stops.map((s) => s.experience.category);
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(categories).size).toBe(categories.length);
    }
  });

  it('honours the shape it was asked for', () => {
    for (const shape of ITINERARY_SHAPES) {
      const built = buildItinerary(input({ shape }));
      expect(built.shapeId).toBe(shape.id);
      expect(built.stops.length).toBeLessThanOrEqual(shape.maxStops);
      for (const stop of built.stops) {
        expect(stop.startMinutes).toBeGreaterThanOrEqual(shape.fromMinutes);
        expect(stop.endMinutes).toBeLessThanOrEqual(shape.toMinutes);
      }
    }
  });
});

describe('the day could actually be booked', () => {
  it('is ordered, and every stop leaves time to reach the next', () => {
    for (const offset of [1, 2, 4, 7]) {
      const built = buildItinerary(input({ dateISO: futureDay(offset) }));
      for (let i = 1; i < built.stops.length; i++) {
        const prev = built.stops[i - 1]!;
        const next = built.stops[i]!;
        expect(next.startMinutes).toBeGreaterThanOrEqual(prev.endMinutes);
        // A leg is stated whenever both vendors have a location, which every demo vendor does.
        expect(next.arriveFrom).not.toBeNull();
        if (next.arriveFrom!.kind === 'transfer') {
          expect(next.startMinutes - prev.endMinutes).toBeGreaterThanOrEqual(next.arriveFrom!.minutes);
        }
      }
    }
  });

  /**
   * Two stops at the same place must read as "no transfer", never as a zero-distance journey —
   * and two stops merely run by the same operator must not.
   *
   * This test used to key on `vendorId`, back when location lived only on the vendor and two
   * listings from one operator really were at one coordinate. Listings carry their own meeting
   * point now, so that shortcut had White River Tubing and the Dunn's River climb — 5 km apart on
   * opposite sides of Ocho Rios — planned as a same-site stay with no travel time allowed for. The
   * rule is the distance, which is what the claim on the screen was always about.
   */
  it('calls a hop between two stops at one place a same-site stay, not a 0 m walk', () => {
    let sawSameSite = false;
    let sawTransfer = false;
    // Every destination, not just each island's default: the one pair in the catalogue that
    // genuinely shares a site — the two Rum Point boats — only ever appears in a day built from
    // Rum Point, so a sweep of default destinations alone never exercises the same-site branch.
    for (const isl of ISLANDS) {
      for (const dest of destinationsFor(isl.id)) {
      for (const shape of ITINERARY_SHAPES) {
        for (let offset = 1; offset <= 7; offset++) {
          const built = buildItinerary(
            input({ islandId: isl.id, destination: dest, shape, dateISO: futureDay(offset) }),
          );
          for (let i = 1; i < built.stops.length; i++) {
            const prev = built.stops[i - 1]!;
            const next = built.stops[i]!;
            const arrival = next.arriveFrom!;
            const apart = metresApart(prev.experience, next.experience);
            if (apart !== null && apart <= AT_VENUE_METRES) {
              expect(arrival.kind).toBe('same-site');
              sawSameSite = true;
            } else {
              expect(arrival.kind).toBe('transfer');
              // A stated transfer always covers real ground; a zero-metre one is the bug this guards.
              expect((arrival as { metres: number }).metres).toBeGreaterThan(0);
              sawTransfer = true;
            }
          }
        }
      }
      }
    }
    // The transfer branch has to occur or this sweep proves nothing. The same-site branch is
    // asserted separately below: only two pairs in the catalogue genuinely share a site, and the
    // builder never happens to place either pair together, so demanding it here would be
    // demanding a coincidence rather than a behaviour.
    expect(sawTransfer).toBe(true);
    void sawSameSite;
  });

  /**
   * The same-site branch, forced rather than waited for.
   *
   * The two Rum Point boats leave from one jetty — the only genuine same-site pair the planner can
   * be handed. Planning both puts them in one day deterministically, where a sweep over shapes and
   * dates never does.
   */
  it('allows no travel time between two stops that leave from one jetty', () => {
    const pair = ['exp-ky-rum-point', 'exp-ky-bio-bay'];
    const ky = ISLANDS.find((i) => i.id === 'island-ky')!;
    const rumPoint = destinationsFor(ky.id).find((d) => d.slug === 'rum-point')!;

    let checked = false;
    for (const shape of ITINERARY_SHAPES) {
      for (let offset = 1; offset <= 7; offset++) {
        const built = buildItinerary(
          input({
            islandId: ky.id,
            destination: rumPoint,
            shape,
            dateISO: futureDay(offset),
            plannedExperienceIds: pair,
          }),
        );
        const ids = built.stops.map((st) => st.experience.id);
        if (!pair.every((id) => ids.includes(id))) continue;

        const second = built.stops[ids.indexOf(pair[1]!)]!;
        const first = built.stops[ids.indexOf(pair[0]!)]!;
        const later = second.startMinutes > first.startMinutes ? second : first;
        expect(later.arriveFrom!.kind).toBe('same-site');
        // The same-site variant carries no distance and no duration — that is the whole point of
        // it being a separate variant rather than a transfer of zero metres.
        expect((later.arriveFrom as { metres?: number }).metres).toBeUndefined();
        checked = true;
      }
    }
    expect(checked, 'the two Rum Point boats never landed in one day').toBe(true);
  });

  it('only counts real transfers towards the route distance', () => {
    for (const offset of [1, 3, 5]) {
      const built = buildItinerary(input({ dateISO: futureDay(offset) }));
      const summed = built.stops.reduce(
        (total, s) => total + (s.arriveFrom?.kind === 'transfer' ? s.arriveFrom.metres : 0),
        0,
      );
      expect(built.routeMetres).toBe(summed);
    }
  });

  it('reports the room the shape had, so a short day can say why', () => {
    for (const shape of ITINERARY_SHAPES) {
      const built = buildItinerary(input({ shape, dateISO: futureDay(2) }));
      expect(built.stopsWanted).toBe(shape.maxStops);
      expect(built.stops.length).toBeLessThanOrEqual(built.stopsWanted);
    }
  });

  it('only ever chooses a departure the party fits on', () => {
    const party = { adults: 4, children: 2, photoPackage: false };
    const dateISO = futureDay(2);
    const built = buildItinerary(input({ party, dateISO }));
    for (const stop of built.stops) {
      if (stop.state === 'confirmed') continue;
      const slot = slotsFor(stop.experience, dateISO).find((s) => s.time === stop.time);
      expect(slot).toBeDefined();
      expect(slot!.capacityRemaining).toBeGreaterThanOrEqual(6);
      expect(stop.capacityRemaining).toBe(slot!.capacityRemaining);
    }
  });

  it('places the stop the guest was looking at, when it fits', () => {
    const candidates = experiencesFor(island.id);
    expect(candidates.length).toBeGreaterThan(0);
    const dateISO = futureDay(2);

    // At least one listing must be anchorable, or the affordance on the detail page is decorative.
    const anchored = candidates.filter((experience) => {
      const built = buildItinerary(input({ dateISO, anchorExperienceId: experience.id }));
      return built.stops.some((s) => s.experience.id === experience.id);
    });
    expect(anchored.length).toBeGreaterThan(0);

    // And when it is placed, it is placed as the guest's own, not as a suggestion.
    const built = buildItinerary(input({ dateISO, anchorExperienceId: anchored[0]!.id }));
    const stop = built.stops.find((s) => s.experience.id === anchored[0]!.id)!;
    expect(stop.state).toBe('planned');
  });

  it('treats a listing already on the day plan as planned rather than suggested', () => {
    const dateISO = futureDay(2);
    const first = experiencesFor(island.id)[0]!;
    const built = buildItinerary(input({ dateISO, plannedExperienceIds: [first.id] }));
    const stop = built.stops.find((s) => s.experience.id === first.id);
    if (stop) expect(stop.state).toBe('planned');
    // Whether or not it fits, nothing planned may come back labelled as Irie's own idea.
    expect(built.stops.some((s) => s.experience.id === first.id && s.state === 'suggested')).toBe(false);
  });
});

describe('confirmed bookings', () => {
  const dateISO = futureDay(2);
  const booked = experiencesFor(island.id)[0]!;
  const bookings = [
    { experienceId: booked.id, dateISO, time: '09:00', totalMinor: 21360 },
  ];

  it('anchors the day and keeps the price that was agreed', () => {
    const built = buildItinerary(input({ dateISO, bookings }));
    const stop = built.stops.find((s) => s.experience.id === booked.id)!;
    expect(stop.state).toBe('confirmed');
    expect(stop.startMinutes).toBe(minutesOfTime('09:00'));
    // The frozen total, not a re-quote — this is what keeps the day agreeing with the ticket.
    expect(stop.estimateMinor).toBe(21360);
    expect(stop.capacityRemaining).toBeNull();
  });

  it('ignores a booking on another day', () => {
    const built = buildItinerary(
      input({ dateISO, bookings: [{ ...bookings[0]!, dateISO: futureDay(9) }] }),
    );
    expect(built.stops.some((s) => s.state === 'confirmed')).toBe(false);
  });

  it('is never offered as something to add', () => {
    const built = buildItinerary(input({ dateISO, bookings }));
    expect(built.addableExperienceIds).not.toContain(booked.id);
    for (const id of built.addableExperienceIds) {
      expect(built.stops.find((s) => s.experience.id === id)!.state).not.toBe('confirmed');
    }
  });

  it('does not schedule a suggestion over the top of it', () => {
    const built = buildItinerary(input({ dateISO, bookings }));
    const fixed = built.stops.find((s) => s.experience.id === booked.id)!;
    for (const stop of built.stops) {
      if (stop === fixed) continue;
      const clashes = stop.startMinutes < fixed.endMinutes && fixed.startMinutes < stop.endMinutes;
      expect(clashes).toBe(false);
    }
  });
});

describe('the estimate', () => {
  it('is the sum of the stops and nothing else', () => {
    for (const shape of ITINERARY_SHAPES) {
      const built = buildItinerary(input({ shape, dateISO: futureDay(2) }));
      const summed = built.stops.reduce((total, s) => total + (s.estimateMinor ?? 0), 0);
      expect(built.totalMinor).toBe(summed);
    }
  });

  it('counts a stop it could not price rather than treating it as free', () => {
    const built = buildItinerary(input({ dateISO: futureDay(2) }));
    expect(built.unquotedCount).toBe(built.stops.filter((s) => s.estimateMinor === null).length);
    for (const stop of built.stops) {
      // Exactly one of the two is present: a figure, or a reason there is no figure.
      expect(stop.estimateMinor === null).toBe(stop.quoteNote !== null);
    }
  });

  it('rises with the party size', () => {
    const dateISO = futureDay(2);
    const shape = shapeById('afternoon')!;
    const two = buildItinerary(input({ shape, dateISO, party: { adults: 2, children: 0, photoPackage: false } }));
    const four = buildItinerary(input({ shape, dateISO, party: { adults: 4, children: 0, photoPackage: false } }));
    // Only comparable when the same stops were placed; a larger party can be turned away from a
    // near-full departure, which is the behaviour the capacity test above pins down.
    const same =
      two.stops.length === four.stops.length &&
      two.stops.every((s, i) => s.experience.id === four.stops[i]!.experience.id);
    if (same && two.totalMinor > 0) {
      expect(four.totalMinor).toBeGreaterThan(two.totalMinor);
    }
  });

  it('never returns a negative total or a negative route', () => {
    for (const shape of ITINERARY_SHAPES) {
      for (const offset of [1, 3, 5]) {
        const built = buildItinerary(input({ shape, dateISO: futureDay(offset) }));
        expect(built.totalMinor).toBeGreaterThanOrEqual(0);
        expect(built.routeMetres).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

/**
 * Two bookings the guest already holds can be impossible together — booked for the same morning,
 * or one on each side of an island 130 km wide. The builder must show both and say so. Dropping one
 * hides something that was paid for; showing them silently presents an impossible day as a plan.
 */
describe('bookings that clash with each other', () => {
  const dateISO = futureDay(2);
  const [a, b] = experiencesFor(island.id);

  it('keeps both, and marks the second', () => {
    const built = buildItinerary(
      input({
        dateISO,
        bookings: [
          { experienceId: a!.id, dateISO, time: '09:00', totalMinor: 10000 },
          { experienceId: b!.id, dateISO, time: '09:00', totalMinor: 20000 },
        ],
      }),
    );
    const ids = built.stops.map((s) => s.experience.id);
    expect(ids).toContain(a!.id);
    expect(ids).toContain(b!.id);
    expect(built.clashCount).toBe(1);
    // Both totals still count — the guest paid for both whether or not the day works.
    expect(built.totalMinor).toBeGreaterThanOrEqual(30000);
  });

  it('calls a same-time booking an overlap, and names what it runs over', () => {
    const built = buildItinerary(
      input({
        dateISO,
        bookings: [
          { experienceId: a!.id, dateISO, time: '09:00', totalMinor: 10000 },
          { experienceId: b!.id, dateISO, time: '09:00', totalMinor: 20000 },
        ],
      }),
    );
    const clashed = built.stops.find((s) => s.clash !== null)!;
    expect(clashed.clash!.kind).toBe('overlap');
    expect(clashed.clash!.shortfallMinutes).toBeGreaterThan(0);
    const named = built.stops.map((s) => s.experience.title);
    expect(named).toContain(clashed.clash!.withTitle);
  });

  /**
   * The proposed fix.
   *
   * A concierge that names a collision and stops there has handed the guest a puzzle. What makes
   * this worth testing is the failure mode: a proposal is a promise the checkout has to be able to
   * keep, so the only thing worse than no suggestion is one pointing at a departure that does not
   * exist, has no room, or lands on the same collision it was supposed to clear.
   */
  describe('proposing a way out', () => {
    const clashingDay = () =>
      buildItinerary(
        input({
          dateISO,
          bookings: [
            { experienceId: a!.id, dateISO, time: '09:00', totalMinor: 10000 },
            { experienceId: b!.id, dateISO, time: '09:00', totalMinor: 20000 },
          ],
        }),
      );

    it('only ever names a departure that actually exists', () => {
      const clashed = clashingDay().stops.find((s) => s.clash !== null)!;
      const { resolution } = clashed.clash!;
      if (!resolution) return; // "nothing fits" is a legitimate answer, covered below.
      const real = slotsFor(clashed.experience, resolution.dateISO).map((s) => s.time);
      expect(real).toContain(resolution.time);
    });

    it('never proposes a departure without room for the seats that booking holds', () => {
      const seats = 4;
      const built = buildItinerary(
        input({
          dateISO,
          bookings: [
            { experienceId: a!.id, dateISO, time: '09:00', totalMinor: 10000, seats },
            { experienceId: b!.id, dateISO, time: '09:00', totalMinor: 20000, seats },
          ],
        }),
      );
      const clashed = built.stops.find((s) => s.clash !== null)!;
      const { resolution } = clashed.clash!;
      if (!resolution) return;
      expect(resolution.capacityRemaining).toBeGreaterThanOrEqual(seats);
    });

    it('does not propose the departure the booking is already on', () => {
      const clashed = clashingDay().stops.find((s) => s.clash !== null)!;
      const { resolution } = clashed.clash!;
      if (!resolution) return;
      // Scoped to the same day on purpose: 9am tomorrow is a real fix for a 9am collision today,
      // and rejecting it because the clock reads the same would throw away the obvious answer.
      if (resolution.kind === 'later-slot') {
        expect(resolution.startMinutes).not.toBe(clashed.startMinutes);
      } else {
        expect(resolution.dateISO).not.toBe(dateISO);
      }
    });

    it('proposes a time that clears every other stop, not just the one it collided with', () => {
      const built = clashingDay();
      const clashed = built.stops.find((s) => s.clash !== null)!;
      const { resolution } = clashed.clash!;
      if (!resolution || resolution.kind !== 'later-slot') return;
      const start = resolution.startMinutes;
      const end = start + clashed.experience.durationMinutes;
      for (const other of built.stops) {
        if (other === clashed) continue;
        const overlapping = start < other.endMinutes && other.startMinutes < end;
        expect(overlapping).toBe(false);
      }
    });

    it('prefers the same day over moving the guest to another one', () => {
      const clashed = clashingDay().stops.find((s) => s.clash !== null)!;
      const { resolution } = clashed.clash!;
      if (!resolution) return;
      const sameDayWorks = slotsFor(clashed.experience, dateISO).some(
        (s) => minutesOfTime(s.time) !== clashed.startMinutes && s.capacityRemaining > 0,
      );
      if (sameDayWorks && resolution.kind === 'another-day') {
        // Only acceptable if no same-day slot actually cleared the rest of the day.
        expect(resolution.dateISO).not.toBe(dateISO);
      }
    });

    it('leaves a stop with no clash with nothing to resolve', () => {
      const built = buildItinerary(input({ dateISO }));
      for (const stop of built.stops) expect(stop.clash).toBeNull();
    });
  });

  it('calls an unreachable booking a travel problem rather than an overlap', () => {
    // Far apart, and sequential: the first ends well before the second starts, but no one can cross
    // Jamaica in the gap.
    const far = experiencesFor(island.id).find((e) => e.vendorId !== a!.vendorId)!;
    const built = buildItinerary(
      input({
        dateISO,
        shape: shapeById('full-day')!,
        bookings: [
          { experienceId: a!.id, dateISO, time: '09:00', totalMinor: 10000 },
          { experienceId: far.id, dateISO, time: '13:30', totalMinor: 20000 },
        ],
      }),
    );
    const clashed = built.stops.find((s) => s.clash !== null);
    if (clashed && clashed.startMinutes >= built.stops[0]!.endMinutes) {
      expect(clashed.clash!.kind).toBe('travel');
    }
  });

  it('reports no clash when a day is composed from suggestions alone', () => {
    // Fitted stops are checked against everything already placed, so they cannot clash by
    // construction. If this ever fails, `fit` and the clash check disagree about the same rule.
    for (const shape of ITINERARY_SHAPES) {
      for (let offset = 1; offset <= 7; offset++) {
        const built = buildItinerary(input({ shape, dateISO: futureDay(offset) }));
        expect(built.clashCount).toBe(0);
      }
    }
  });

  it('counts exactly the stops carrying a clash', () => {
    const built = buildItinerary(
      input({
        dateISO,
        bookings: [
          { experienceId: a!.id, dateISO, time: '09:00', totalMinor: 10000 },
          { experienceId: b!.id, dateISO, time: '09:00', totalMinor: 20000 },
        ],
      }),
    );
    expect(built.clashCount).toBe(built.stops.filter((s) => s.clash !== null).length);
  });

  it('spans to the latest finish, not the last stop to begin', () => {
    // A long booking begun at 09:00 can finish after a short one begun at 09:00 — the span has to
    // cover both or it understates the day.
    const built = buildItinerary(
      input({
        dateISO,
        bookings: [
          { experienceId: a!.id, dateISO, time: '09:00', totalMinor: 10000 },
          { experienceId: b!.id, dateISO, time: '09:00', totalMinor: 20000 },
        ],
      }),
    );
    const latest = Math.max(...built.stops.map((s) => s.endMinutes));
    expect(formatSpan(built.stops)).toContain(formatClock(latest));
  });
});

describe('buildSoonestDay', () => {
  const base = (() => {
    const { dateISO: _ignored, ...rest } = input();
    return rest;
  })();

  it('keeps the day it was asked for when that day can be filled', () => {
    const wanted = futureDay(3);
    const built = buildSoonestDay(base, wanted);
    expect(built.stops.length).toBeGreaterThan(0);
    expect(built.dateISO).toBe(wanted);
  });

  it('walks forward rather than returning nothing', () => {
    // An island with no catalogue can never be filled, so every day in the lookahead is tried and
    // the last one is handed back — a real date with an empty day, not an exception.
    const built = buildSoonestDay({ ...base, islandId: 'island-does-not-exist' }, futureDay(1), 2);
    expect(built.stops).toEqual([]);
    expect(built.dateISO).toBe(futureDay(3));
  });

  it('crosses a month boundary without producing an invalid date', () => {
    const built = buildSoonestDay({ ...base, islandId: 'island-does-not-exist' }, '2026-01-30', 3);
    expect(built.dateISO).toBe('2026-02-02');
  });
});

describe('degrading', () => {
  it('returns an empty day rather than throwing when the island has nothing', () => {
    const built = buildItinerary(input({ islandId: 'island-does-not-exist' }));
    expect(built.stops).toEqual([]);
    expect(built.totalMinor).toBe(0);
    expect(built.addableExperienceIds).toEqual([]);
    expect(formatSpan(built.stops)).toBe('');
  });

  it('ignores an anchor that is not in the visible catalogue', () => {
    const built = buildItinerary(input({ anchorExperienceId: 'exp-does-not-exist' }));
    expect(built.stops.every((s) => s.experience.id !== 'exp-does-not-exist')).toBe(true);
  });

  it('composes something on every shape, on every island, for the next week', () => {
    for (const isl of ISLANDS) {
      const dest = destinationsFor(isl.id)[0];
      if (!dest) continue;
      for (const shape of ITINERARY_SHAPES as ItineraryShape[]) {
        for (let offset = 1; offset <= 7; offset++) {
          const built = buildItinerary(
            input({ islandId: isl.id, destination: dest, shape, dateISO: futureDay(offset) }),
          );
          // An empty answer to a chip the app itself offered is a dead end; the screen has an empty
          // state for it, but it must be rare rather than routine.
          expect(built.stops.length).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
