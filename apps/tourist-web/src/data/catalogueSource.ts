import {
  DEMO_DESTINATIONS,
  DEMO_EXPERIENCES,
  DEMO_ISLANDS,
  DEMO_MEDIA_CREDITS,
  DEMO_VENDORS,
  demoOptionsFor,
  type DemoDestination,
  type DemoExperience,
  type DemoIsland,
  type DemoVendor,
} from '@cvip/demo';

/**
 * Where the catalogue comes from.
 *
 * The app reads listings through synchronous functions in `catalogue.ts` (about sixteen screens and
 * helpers depend on that), so a `CatalogueSource` that returned promises would mean rewriting every
 * caller; that is the attempt that reached 60% and was reverted on 2026-09-10. Instead the source is
 * a *snapshot* held in memory: demo mode uses the bundled dataset with nothing to load; live mode
 * fetches one snapshot at start-up, installs it with `installCatalogue`, and only then renders.
 * Every read stays synchronous, and the visibility rule in `catalogue.ts` is applied to whatever
 * the snapshot holds, so a source cannot hand the app something the database would hide.
 *
 * Not yet in the snapshot: pricing config and the promotion. They stay demo-derived until a
 * Supabase adapter reads `platform_settings` and `promotions`.
 */
/** One open departure, in the UTC-wall-clock convention `resolve-slot` uses to find it again. */
export interface LiveSlot {
  dateISO: string;
  /** "09:00", 24-hour. */
  time: string;
  capacityRemaining: number;
}

export interface PricingRates {
  taxRate: number;
  serviceFeeRate: number;
  commissionRate: number;
}

export interface CatalogueSnapshot {
  islands: DemoIsland[];
  destinations: DemoDestination[];
  vendors: DemoVendor[];
  /** Every listing the source holds, visible or not. `visibleExperiences()` filters. */
  experiences: DemoExperience[];
  /** Options (guest tickets, add-ons) for one listing. */
  optionsFor: (experience: DemoExperience) => ReturnType<typeof demoOptionsFor>;
  /** Credit lines by media key. Empty for a source whose photos need no attribution. */
  mediaCredits: typeof DEMO_MEDIA_CREDITS;
  /**
   * Real departures by listing id, from `availability_slots`. Absent in demo mode, where the
   * deterministic generator in `availability.ts` stands in. When present it is the ONLY source:
   * a listing with no entry has no departures, never generated ones.
   */
  slots?: Map<string, LiveSlot[]>;
  /**
   * The rates the server will charge with. Absent in demo mode (the demo constants apply). The
   * commission rate is vendor-side, is not readable by guests, and does not change what they pay,
   * so it stays at the demo value.
   */
  pricing?: PricingRates;
}

export function demoSnapshot(): CatalogueSnapshot {
  return {
    islands: DEMO_ISLANDS,
    destinations: DEMO_DESTINATIONS,
    vendors: DEMO_VENDORS,
    experiences: DEMO_EXPERIENCES,
    optionsFor: demoOptionsFor,
    mediaCredits: DEMO_MEDIA_CREDITS,
  };
}

let current: CatalogueSnapshot = demoSnapshot();

export function currentCatalogue(): CatalogueSnapshot {
  return current;
}

/** Live mode only, once, before the first render. Demo mode never calls this. */
export function installCatalogue(snapshot: CatalogueSnapshot): void {
  current = snapshot;
  for (const listener of listeners) listener();
}

/** Live mode: replace only the departures, keeping everything else. Safe to call repeatedly. */
export function installSlots(slots: Map<string, LiveSlot[]>): void {
  current = { ...current, slots };
}

/** Tests only: back to the bundled dataset. */
export function resetCatalogue(): void {
  installCatalogue(demoSnapshot());
}

const listeners = new Set<() => void>();
/** Lets `catalogue.ts` refresh values it derives at module level (the island list). */
export function onCatalogueInstalled(fn: () => void): void {
  listeners.add(fn);
}
