import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_EXPERIENCES } from '@cvip/demo';
import { mapSlots, type SlotRow } from './catalogueMapping';
import { daysFor, slotOn, slotsFor } from './availability';
import { demoSnapshot, installCatalogue, installSlots, resetCatalogue } from './catalogueSource';
import { fetchSlotRows } from './supabaseCatalogue';
import { refreshSlots } from './liveCatalogue';

afterEach(resetCatalogue);

const row = (o: Partial<SlotRow> = {}): SlotRow => ({
  experience_id: 'e1', starts_at: '2099-03-10T09:00:00+00:00', capacity: 10, booked_count: 4, status: 'open', ...o,
});
const exp = { ...DEMO_EXPERIENCES[0]!, id: 'e1' };

describe('mapSlots', () => {
  it('reads the start as UTC wall-clock, the convention resolve-slot uses to find it again', () => {
    expect(mapSlots([row({ starts_at: '2099-03-10T13:30:00+00:00' })]).get('e1')).toEqual([
      { dateISO: '2099-03-10', time: '13:30', capacityRemaining: 6 },
    ]);
  });
  it('groups by listing and sorts by time', () => {
    const m = mapSlots([row({ starts_at: '2099-03-11T09:00:00Z' }), row({ starts_at: '2099-03-10T14:00:00Z' }), row({ experience_id: 'e2' })]);
    expect(m.get('e1')!.map((s) => `${s.dateISO} ${s.time}`)).toEqual(['2099-03-10 14:00', '2099-03-11 09:00']);
    expect(m.get('e2')).toHaveLength(1);
  });
  it.each([
    ['closed', { status: 'closed' }], ['cancelled', { status: 'cancelled' }], ['full', { booked_count: 10 }],
    ['oversold', { booked_count: 12 }], ['bad time', { starts_at: 'soon' }], ['bad capacity', { capacity: 'NaN' }],
  ])('drops a %s slot instead of offering it', (_n, over) => {
    expect(mapSlots([row(over as Partial<SlotRow>)]).get('e1')).toBeUndefined();
  });
  it('coerces numeric strings', () => {
    expect(mapSlots([row({ capacity: '8', booked_count: '3' })]).get('e1')![0]!.capacityRemaining).toBe(5);
  });
});

describe('live availability in the picker', () => {
  const install = (rows: SlotRow[]) => installCatalogue({ ...demoSnapshot(), slots: mapSlots(rows) });

  it('offers exactly the database departures for that day, with their real seats', () => {
    install([row(), row({ starts_at: '2099-03-10T13:30:00Z', capacity: 3, booked_count: 3 }), row({ starts_at: '2099-03-11T09:00:00Z' })]);
    expect(slotsFor(exp, '2099-03-10')).toEqual([{ time: '09:00', label: '9:00 AM', capacityRemaining: 6 }]);
    expect(slotOn(exp, '2099-03-10', '09:00')?.capacityRemaining).toBe(6);
  });

  it('never falls back to generated departures: a listing with no slots has none', () => {
    install([]);
    expect(slotsFor(exp, '2099-03-10')).toEqual([]);
    expect(daysFor(exp).some((d) => d.hasAvailability)).toBe(false);
  });

  it('demo mode still generates (positive control)', () => {
    resetCatalogue();
    expect(slotsFor(exp, '2099-03-10').length).toBeGreaterThan(0);
  });

  it('installSlots swaps only the departures', () => {
    install([row()]);
    installSlots(mapSlots([row({ starts_at: '2099-03-10T11:30:00Z' })]));
    expect(slotsFor(exp, '2099-03-10').map((s) => s.time)).toEqual(['11:30']);
  });
});

describe('fetchSlotRows', () => {
  const fakeClient = (pages: Array<SlotRow[] | { message: string }>) => {
    let i = 0;
    const calls: Array<[number, number]> = [];
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'order']) q[m] = () => q;
    q.range = (a: number, b: number) => {
      calls.push([a, b]);
      const p = pages[i++]!;
      return Promise.resolve(Array.isArray(p) ? { data: p, error: null } : { data: null, error: p });
    };
    return { client: { from: () => q } as never, calls };
  };

  it('keeps reading until a short page, so a busy catalogue is not truncated at 1000', async () => {
    const full = Array.from({ length: 1000 }, () => row());
    const { client, calls } = fakeClient([full, full, [row(), row()]]);
    expect(await fetchSlotRows(client)).toHaveLength(2002);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('throws on a failed page rather than returning a short list', async () => {
    const { client } = fakeClient([Array.from({ length: 1000 }, () => row()), { message: 'timeout' }]);
    await expect(fetchSlotRows(client)).rejects.toThrow(/availability_slots: timeout/);
  });
});

describe('refreshSlots', () => {
  it('installs the new departures', async () => {
    const install = vi.fn();
    const m = new Map();
    expect(await refreshSlots({} as never, vi.fn().mockResolvedValue(m), install)).toBe(true);
    expect(install).toHaveBeenCalledWith(m);
  });
  it('keeps what is on screen when the refresh fails', async () => {
    const install = vi.fn();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await refreshSlots({} as never, vi.fn().mockRejectedValue(new Error('x')), install)).toBe(false);
    expect(install).not.toHaveBeenCalled();
    quiet.mockRestore();
  });
});
