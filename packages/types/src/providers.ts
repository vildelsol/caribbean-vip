/**
 * Provider adapter interfaces — AD-07.
 *
 * The build prompt requires maps/geolocation, notifications and AI to be mockable so local
 * development needs no credentials (operating rule 4). The maps and notification providers are
 * also still an open commercial decision (OD-05), so this boundary is what keeps that choice
 * reversible: swapping Google for Mapbox should touch one file, not every screen.
 *
 * Only the interfaces and the mocks live here — no SDK imports, so this package stays pure and
 * usable from React Native, Next.js and Deno alike.
 */

import type { Coordinates } from './geo.ts';

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

export type LocationPermission = 'granted' | 'denied' | 'undetermined';

export interface LocationFix {
  coordinates: Coordinates;
  /** Metres. Used to avoid implying more precision than the device has. */
  accuracyMetres: number;
  timestamp: number;
}

/**
 * PRD §9: the experience must never depend on continuous tracking, and must remain functional
 * when background permission is denied. This interface has no "watch" or "background" method on
 * purpose — a one-shot foreground fix is the only capability the MVP is allowed to rely on.
 */
export interface LocationProvider {
  readonly name: string;
  getPermission(): Promise<LocationPermission>;
  /**
   * Ask for permission. Must only ever be called after the user has taken an action that implies
   * they want it — never on app launch.
   */
  requestPermission(): Promise<LocationPermission>;
  /** Resolves null when permission is absent or no fix is available. Never throws. */
  getCurrentPosition(): Promise<LocationFix | null>;
}

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

export interface MapMarker {
  id: string;
  coordinates: Coordinates;
  title: string;
  subtitle?: string;
  /** Highlights the marker the user has selected in the list. */
  selected?: boolean;
}

export interface MapRegion {
  centre: Coordinates;
  /** Degrees of latitude/longitude visible. */
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MapProviderInfo {
  readonly name: 'mock' | 'google' | 'mapbox';
  /** False for the mock: the Nearby tab renders its list-only fallback instead of a map. */
  readonly canRenderMap: boolean;
  /** Attribution string the provider's terms require be displayed. */
  readonly attribution: string | null;
}

// ---------------------------------------------------------------------------
// Mock implementations
// ---------------------------------------------------------------------------

/**
 * Mock location provider.
 *
 * Defaults to DENIED, not granted. A mock that pretends permission was granted would let the
 * location-denied path — an explicit PRD §14 requirement — go unexercised in every local run,
 * which is exactly the state most likely to ship broken.
 */
export function createMockLocationProvider(
  options: {
    permission?: LocationPermission;
    fix?: Coordinates | null;
  } = {},
): LocationProvider {
  let permission: LocationPermission = options.permission ?? 'denied';
  // Ocho Rios, so mock fixes land inside the seeded Jamaica content.
  const fix = options.fix === undefined ? { lat: 18.4074, lng: -77.103 } : options.fix;

  return {
    name: 'mock',
    async getPermission() {
      return permission;
    },
    async requestPermission() {
      if (permission === 'undetermined') permission = 'granted';
      return permission;
    },
    async getCurrentPosition() {
      if (permission !== 'granted' || !fix) return null;
      return { coordinates: fix, accuracyMetres: 25, timestamp: Date.now() };
    },
  };
}

export const MOCK_MAP_PROVIDER: MapProviderInfo = {
  name: 'mock',
  canRenderMap: false,
  attribution: null,
};

export function mapProviderInfo(name: string | undefined): MapProviderInfo {
  switch (name) {
    case 'google':
      return { name: 'google', canRenderMap: true, attribution: 'Map data ©2026 Google' };
    case 'mapbox':
      return { name: 'mapbox', canRenderMap: true, attribution: '© Mapbox © OpenStreetMap' };
    default:
      return MOCK_MAP_PROVIDER;
  }
}

/**
 * A region framing every marker, with a floor on the zoom.
 *
 * Without the floor, a single marker produces a zero-size region and most map SDKs respond by
 * zooming to maximum, which reads as a bug.
 */
export function regionForMarkers(
  markers: readonly MapMarker[],
  fallbackCentre: Coordinates,
): MapRegion {
  if (markers.length === 0) {
    return { centre: fallbackCentre, latitudeDelta: 0.5, longitudeDelta: 0.5 };
  }

  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  for (const m of markers) {
    north = Math.max(north, m.coordinates.lat);
    south = Math.min(south, m.coordinates.lat);
    east = Math.max(east, m.coordinates.lng);
    west = Math.min(west, m.coordinates.lng);
  }

  const MIN_DELTA = 0.02; // roughly a 2 km viewport
  return {
    centre: { lat: (north + south) / 2, lng: (east + west) / 2 },
    latitudeDelta: Math.max((north - south) * 1.4, MIN_DELTA),
    longitudeDelta: Math.max((east - west) * 1.4, MIN_DELTA),
  };
}
