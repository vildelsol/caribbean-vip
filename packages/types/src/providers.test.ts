import { describe, expect, it } from 'vitest';
import {
  MOCK_MAP_PROVIDER,
  createMockLocationProvider,
  mapProviderInfo,
  regionForMarkers,
  type MapMarker,
} from './providers.ts';

const OCHO_RIOS = { lat: 18.4074, lng: -77.103 };
const NEGRIL = { lat: 18.2683, lng: -78.348 };

describe('mock location provider', () => {
  it('defaults to DENIED so the location-denied path is the one exercised locally', () => {
    // A mock that pretended permission was granted would leave the PRD §14 fallback untested in
    // every local run — the state most likely to ship broken.
    const p = createMockLocationProvider();
    return expect(p.getPermission()).resolves.toBe('denied');
  });

  it('returns no fix while permission is denied', async () => {
    const p = createMockLocationProvider();
    await expect(p.getCurrentPosition()).resolves.toBeNull();
  });

  it('returns a fix once permission is granted', async () => {
    const p = createMockLocationProvider({ permission: 'granted' });
    const fix = await p.getCurrentPosition();
    expect(fix?.coordinates).toEqual(OCHO_RIOS);
    expect(fix?.accuracyMetres).toBeGreaterThan(0);
  });

  it('grants on request only from undetermined — a denial is not silently overturned', async () => {
    const undetermined = createMockLocationProvider({ permission: 'undetermined' });
    await expect(undetermined.requestPermission()).resolves.toBe('granted');

    const denied = createMockLocationProvider({ permission: 'denied' });
    await expect(denied.requestPermission()).resolves.toBe('denied');
  });

  it('returns null rather than throwing when there is no fix to give', async () => {
    const p = createMockLocationProvider({ permission: 'granted', fix: null });
    await expect(p.getCurrentPosition()).resolves.toBeNull();
  });

  it('exposes no background or watch capability (PRD §9: never depend on continuous tracking)', () => {
    const p = createMockLocationProvider();
    expect(Object.keys(p).sort()).toEqual([
      'getCurrentPosition',
      'getPermission',
      'name',
      'requestPermission',
    ]);
  });
});

describe('map provider info', () => {
  it('falls back to the mock for an unset or unknown provider', () => {
    expect(mapProviderInfo(undefined)).toEqual(MOCK_MAP_PROVIDER);
    expect(mapProviderInfo('something-else')).toEqual(MOCK_MAP_PROVIDER);
  });

  it('reports that the mock cannot render a map, so the UI shows its list fallback', () => {
    expect(mapProviderInfo('mock').canRenderMap).toBe(false);
  });

  it('carries the attribution each real provider requires', () => {
    expect(mapProviderInfo('google').attribution).toBeTruthy();
    expect(mapProviderInfo('mapbox').attribution).toBeTruthy();
    expect(mapProviderInfo('google').canRenderMap).toBe(true);
  });
});

describe('regionForMarkers', () => {
  const markers: MapMarker[] = [
    { id: 'a', coordinates: OCHO_RIOS, title: 'Ocho Rios' },
    { id: 'b', coordinates: NEGRIL, title: 'Negril' },
  ];

  it('centres between the markers and contains both', () => {
    const r = regionForMarkers(markers, OCHO_RIOS);
    expect(r.centre.lat).toBeGreaterThan(NEGRIL.lat);
    expect(r.centre.lat).toBeLessThan(OCHO_RIOS.lat);
    expect(r.longitudeDelta).toBeGreaterThan(Math.abs(OCHO_RIOS.lng - NEGRIL.lng));
  });

  it('never produces a zero-size region for a single marker', () => {
    // A zero delta makes most map SDKs zoom to maximum, which reads as a bug.
    const r = regionForMarkers([markers[0] as MapMarker], NEGRIL);
    expect(r.latitudeDelta).toBeGreaterThan(0);
    expect(r.longitudeDelta).toBeGreaterThan(0);
  });

  it('falls back to the supplied centre when there are no markers', () => {
    const r = regionForMarkers([], NEGRIL);
    expect(r.centre).toEqual(NEGRIL);
  });
});
