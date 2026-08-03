import * as Location from 'expo-location';
import {
  createMockLocationProvider,
  mapProviderInfo,
  type LocationFix,
  type LocationPermission,
  type LocationProvider,
} from '@cvip/types';

/**
 * Expo implementation of the LocationProvider interface (AD-07).
 *
 * Foreground only. PRD §9: "The experience must never depend on continuous tracking" — so there
 * is no background permission request and no watcher here. Whether the app later adds limited
 * background geofencing is an M6 decision; nothing in M2 may depend on it.
 *
 * Selected by env var so local development runs against the mock with no credentials, and so the
 * still-open provider choice (OD-05) stays reversible.
 */

function toPermission(status: Location.PermissionStatus): LocationPermission {
  if (status === Location.PermissionStatus.GRANTED) return 'granted';
  if (status === Location.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

const expoLocationProvider: LocationProvider = {
  name: 'expo',

  async getPermission() {
    const { status } = await Location.getForegroundPermissionsAsync();
    return toPermission(status);
  },

  async requestPermission() {
    // Only ever reached from an explicit user action — never on launch (PRD §14).
    const { status } = await Location.requestForegroundPermissionsAsync();
    return toPermission(status);
  },

  async getCurrentPosition(): Promise<LocationFix | null> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) return null;

      const pos = await Location.getCurrentPositionAsync({
        // Balanced, not Highest: a city-block fix is enough for "what is near me", and asking for
        // the best possible fix costs battery and takes longer outdoors.
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        coordinates: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        accuracyMetres: pos.coords.accuracy ?? 100,
        timestamp: pos.timestamp,
      };
    } catch {
      // A location failure degrades the Nearby tab to manual discovery; it never breaks the app.
      return null;
    }
  },
};

const useMock = (process.env.EXPO_PUBLIC_MAPS_PROVIDER ?? 'mock') === 'mock';

export const locationProvider: LocationProvider = useMock
  ? createMockLocationProvider()
  : expoLocationProvider;

export const mapProvider = mapProviderInfo(process.env.EXPO_PUBLIC_MAPS_PROVIDER);
