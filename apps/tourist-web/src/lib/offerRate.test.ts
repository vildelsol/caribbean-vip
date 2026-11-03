/** How often the app may ask the server about a position, and the held-token store. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: null, isLiveMode: false }));

import {
  MIN_GAP_MS,
  RECHECK_AFTER_MS,
  RECHECK_DISTANCE_METRES,
  appOffersClient,
  clearHeldToken,
  loadHeldToken,
  saveHeldToken,
  shouldCheckOffer,
} from './offers';

const metres = (d: number) => () => d;
const here = { lat: 18, lng: -77 };

describe('shouldCheckOffer', () => {
  it('asks the first time', () => {
    expect(shouldCheckOffer(null, here, 0, metres(0))).toBe(true);
  });
  it('never asks inside the minimum gap, even after a big move', () => {
    expect(shouldCheckOffer({ at: 0, ...here }, here, MIN_GAP_MS - 1, metres(5000))).toBe(false);
  });
  it('does not ask again for a small move soon after', () => {
    expect(shouldCheckOffer({ at: 0, ...here }, here, MIN_GAP_MS + 1, metres(RECHECK_DISTANCE_METRES - 1))).toBe(false);
  });
  it('asks after a real move (positive control)', () => {
    expect(shouldCheckOffer({ at: 0, ...here }, here, MIN_GAP_MS + 1, metres(RECHECK_DISTANCE_METRES))).toBe(true);
  });
  it('asks after the long interval even when standing still', () => {
    expect(shouldCheckOffer({ at: 0, ...here }, here, RECHECK_AFTER_MS, metres(0))).toBe(true);
  });
});

describe('appOffersClient', () => {
  it('is null in demo mode: no client, so nothing can be sent', () => {
    expect(appOffersClient()).toBeNull();
  });
});

describe('held token', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it('round-trips a live token (positive control)', () => {
    saveHeldToken({ promotionId: 'p1', token: 't', validUntil: '2030-01-01T00:00:00Z' });
    expect(loadHeldToken(Date.parse('2029-01-01'))).toEqual({ promotionId: 'p1', token: 't', validUntil: '2030-01-01T00:00:00Z' });
  });
  it('drops an expired token and forgets it', () => {
    saveHeldToken({ promotionId: 'p1', token: 't', validUntil: '2030-01-01T00:00:00Z' });
    expect(loadHeldToken(Date.parse('2031-01-01'))).toBeNull();
    expect(loadHeldToken(Date.parse('2029-01-01'))).toBeNull();
  });
  it('ignores a malformed entry', () => {
    localStorage.setItem('cvip.liveVoucher', '{"token":1}');
    expect(loadHeldToken()).toBeNull();
    clearHeldToken();
  });
});
