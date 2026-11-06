import { ISLANDS, destinationsFor, type DemoDestination, type DemoIsland } from '../data/catalogue';

/**
 * Where the guest is: the island and the town they last chose, as the store persists them.
 *
 * These two strings are the only part of the persisted store that names a row in the *catalogue*
 * rather than something the device owns, so they are the only part that can go stale when the
 * catalogue changes under them. Everything here exists because of one way that happens.
 *
 * ## The failure this prevents
 *
 * Demo mode's islands are hand-written with ids like `island-jm`; a live snapshot's are database
 * UUIDs. A device that onboarded against one and then loads the other has a stored `islandId` that
 * matches nothing, and `ISLANDS.find` returns undefined. Explore needs both an island and a
 * destination to draw its hero, so it rendered nothing at all — the app frame and the bottom nav
 * with no `<main>` between them, no console error, no failed request, on every visit for ever,
 * because nothing in the store ever rewrote the bad id. Staging showed exactly that on 2026-11-05.
 * The same thing happens without changing modes at all: deactivate an island or rename a
 * destination slug and every device pinned to it goes blank.
 *
 * The store cannot be versioned out of this. A `VERSION` bump discards the whole store, bookings
 * included, which is the one thing persistence is there to prevent. So the stored place is
 * reconciled against the installed catalogue on load instead, and the screen that needs it has
 * something to say for the case where the catalogue is genuinely empty and there is nothing to
 * reconcile to.
 */
export interface Place {
  islandId: string;
  destinationSlug: string;
}

/**
 * The stored place, corrected to one the installed catalogue actually holds.
 *
 * An unknown island falls back to the first live island, and a destination that is not on the
 * resulting island to that island's first. A place that is already valid is returned unchanged, so
 * demo mode reconciles to itself and nothing moves. With no islands at all there is nothing to
 * correct against and the stored value is kept as-is — `resolvePlace` reports that case.
 */
export function reconcilePlace(stored: Place): Place {
  const island = ISLANDS.find((i) => i.id === stored.islandId) ?? ISLANDS[0];
  if (!island) return stored;
  const destinations = destinationsFor(island.id);
  const destination = destinations.find((d) => d.slug === stored.destinationSlug) ?? destinations[0];
  return {
    islandId: island.id,
    destinationSlug: destination?.slug ?? stored.destinationSlug,
  };
}

/**
 * The rows a screen needs, or `ok: false` when the catalogue cannot supply them.
 *
 * `ok: false` means the live catalogue holds no island or no destination for one — never that the
 * device's stored ids were stale, which `reconcilePlace` has already dealt with. A screen must
 * render something for it: live mode may not fall back to demo listings, so an empty catalogue is
 * a legitimate state, and the guest is owed a sentence rather than a blank frame.
 */
export type ResolvedPlace =
  | { ok: true; island: DemoIsland; destination: DemoDestination }
  | { ok: false };

export function resolvePlace(stored: Place): ResolvedPlace {
  const place = reconcilePlace(stored);
  const island = ISLANDS.find((i) => i.id === place.islandId);
  const destination = destinationsFor(place.islandId).find((d) => d.slug === place.destinationSlug);
  if (!island || !destination) return { ok: false };
  return { ok: true, island, destination };
}
