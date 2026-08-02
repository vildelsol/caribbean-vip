/**
 * Geographic primitives.
 *
 * Used by the Nearby tab (PRD §5) and by geofence eligibility (PRD §9). Kept pure and here rather
 * than in a maps SDK so the maths is testable without a provider, and so swapping the provider
 * (OD-05) cannot change what "500 metres away" means.
 */

import { z } from 'zod';

export const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type Coordinates = z.infer<typeof coordinatesSchema>;

const EARTH_RADIUS_M = 6_371_008.8; // IUGG mean radius

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than a planar approximation: the Caribbean spans enough latitude that a flat
 * approximation drifts, and geofence radii are as small as 50m where a percentage error matters.
 */
export function distanceMetres(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whether a point falls inside a circular geofence. */
export function isWithinRadius(
  point: Coordinates,
  centre: Coordinates,
  radiusMetres: number,
): boolean {
  if (radiusMetres < 0) return false;
  return distanceMetres(point, centre) <= radiusMetres;
}

/**
 * Human-readable distance for a card or list row.
 *
 * Rounds coarsely on purpose. Displaying "487 m" from a consumer GPS fix implies a precision the
 * device does not have, and PRD §9 requires distance be shown to the tourist honestly.
 */
export function formatDistance(metres: number, unit: 'metric' | 'imperial' = 'metric'): string {
  if (!Number.isFinite(metres) || metres < 0) return '';

  if (unit === 'imperial') {
    const miles = metres / 1609.344;
    if (miles < 0.1) return 'right here';
    if (miles < 10) return `${miles.toFixed(1)} mi away`;
    return `${Math.round(miles)} mi away`;
  }

  if (metres < 100) return 'right here';
  if (metres < 1000) return `${Math.round(metres / 50) * 50} m away`;
  const km = metres / 1000;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

/** A bounding box wide enough to contain every point, with padding. Used to frame the map. */
export function boundsFor(
  points: readonly Coordinates[],
  paddingDegrees = 0.01,
): { north: number; south: number; east: number; west: number } | null {
  if (points.length === 0) return null;

  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  for (const p of points) {
    north = Math.max(north, p.lat);
    south = Math.min(south, p.lat);
    east = Math.max(east, p.lng);
    west = Math.min(west, p.lng);
  }

  return {
    north: Math.min(90, north + paddingDegrees),
    south: Math.max(-90, south - paddingDegrees),
    east: Math.min(180, east + paddingDegrees),
    west: Math.max(-180, west - paddingDegrees),
  };
}
