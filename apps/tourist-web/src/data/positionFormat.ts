export { formatAccuracy } from './position';

/**
 * A coarse distance for the "you are somewhere else" line.
 *
 * Rounded hard on purpose: the point of the sentence is "not here", and "7,412 km" invites the
 * reader to check a number that means nothing to them.
 */
export function formatKmish(metres: number): string {
  const km = metres / 1000;
  if (km < 10) return `${Math.round(km)} km`;
  if (km < 1000) return `${Math.round(km / 10) * 10} km`;
  return `${(Math.round(km / 100) * 100).toLocaleString('en-US')} km`;
}
