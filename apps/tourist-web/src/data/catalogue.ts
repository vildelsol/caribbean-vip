import {
  DEMO_DESTINATIONS,
  DEMO_EXPERIENCES,
  DEMO_ISLANDS,
  DEMO_MEDIA_CREDITS,
  DEMO_PRICING_CONFIG,
  DEMO_PROMOTION,
  DEMO_VENDORS,
  demoOptionsFor,
  isPubliclyVisibleDemo,
  type DemoDestination,
  type DemoExperience,
  type DemoIsland,
  type DemoVendor,
} from '@cvip/demo';
import { calculateBookingTotal, distanceMetres, type PriceBreakdown } from '@cvip/types';

/**
 * The catalogue the app reads.
 *
 * Everything here comes from `@cvip/demo`, which is the same dataset the React Native app and the
 * SQL seed carry — so this app did not get its own copy of the inventory, and a listing that
 * exists here exists there. Reusing it also means reusing the two rules that matter:
 *
 *  - **Visibility.** `isPubliclyVisibleDemo` mirrors the `experiences_public_read` RLS policy: a
 *    draft listing, or an approved listing under an unapproved vendor, is not visible. The dataset
 *    contains one of each on purpose. Filtering happens in `visibleExperiences()` and nowhere else,
 *    so the demo cannot show something the real backend would hide.
 *  - **Money.** Totals come from `calculateBookingTotal` in `@cvip/types`, which is unit-tested and
 *    fixes the order of operations (subtotal → discount → tax → fee). No screen in this app adds up
 *    a total itself, which is what makes the figure on the detail page, the checkout summary, the
 *    confirmation and the trip total agree by construction rather than by care.
 *
 * Every `*_minor` amount is USD (OD-09). Island currency is display-only and never takes part in a
 * calculation that leads to a charge.
 */

export type { DemoDestination, DemoExperience, DemoIsland, DemoVendor };

export const PRICING_CONFIG = DEMO_PRICING_CONFIG;
export const PROMOTION = DEMO_PROMOTION;

/** Live islands only. The inactive fixture (Antigua) is filtered here, as the RLS policy would. */
export const ISLANDS: DemoIsland[] = DEMO_ISLANDS.filter((i) => i.is_active);

export function islandById(id: string): DemoIsland | undefined {
  return ISLANDS.find((i) => i.id === id);
}

export function destinationsFor(islandId: string): DemoDestination[] {
  return DEMO_DESTINATIONS.filter((d) => d.island_id === islandId && d.is_active).sort(
    (a, b) => a.sort_order - b.sort_order,
  );
}

export function destinationBySlug(slug: string): DemoDestination | undefined {
  return DEMO_DESTINATIONS.find((d) => d.slug === slug);
}

export function vendorFor(experience: DemoExperience): DemoVendor | undefined {
  return DEMO_VENDORS.find((v) => v.id === experience.vendorId);
}

/** Every listing the public may see. The single place the visibility rule is applied. */
export function visibleExperiences(): DemoExperience[] {
  return DEMO_EXPERIENCES.filter(isPubliclyVisibleDemo);
}

export function experiencesFor(islandId: string): DemoExperience[] {
  return visibleExperiences().filter((e) => e.islandId === islandId);
}

export function experienceById(id: string): DemoExperience | undefined {
  return visibleExperiences().find((e) => e.id === id);
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

/**
 * A photograph's URL.
 *
 * Files live in `public/demo`, copied from the React Native app's bundled assets so both apps show
 * the same pictures. `import.meta.env.BASE_URL` keeps this correct under Vite's `base: './'`.
 */
export function mediaUrl(key: string | undefined): string {
  if (!key) return `${import.meta.env.BASE_URL}demo/jm-hero.jpg`;
  return `${import.meta.env.BASE_URL}demo/${key}.jpg`;
}

export function heroUrl(experience: DemoExperience): string {
  return mediaUrl(experience.media[0]);
}

/**
 * The credit line for a photograph.
 *
 * Most of this photography is CC BY or CC BY-SA, which require attribution *wherever the work
 * appears* — so this renders in the UI, not only in `docs/media-credits.md`. `subject` is what the
 * picture actually shows, which matters because several listings are illustrated with a
 * representative photograph of the right island rather than of that exact operator.
 */
export function creditFor(key: string | undefined) {
  return key ? DEMO_MEDIA_CREDITS[key] : undefined;
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export interface PartySelection {
  adults: number;
  children: number;
  photoPackage: boolean;
}

export const DEFAULT_PARTY: PartySelection = { adults: 2, children: 0, photoPackage: false };

/**
 * Price a party against a listing, through the shared calculator.
 *
 * `capacityRemaining` is what the chosen slot has left; the calculator rejects a party larger than
 * the slot, which is what stops the UI quoting a total for a booking that could never be taken.
 */
export function priceFor(
  experience: DemoExperience,
  party: PartySelection,
  capacityRemaining: number,
  opts: { rumPunch?: boolean } = {},
): { ok: true; breakdown: PriceBreakdown } | { ok: false; message: string } {
  const options = demoOptionsFor(experience);
  const adult = options.find((o) => o.kind === 'adult');
  const child = options.find((o) => o.kind === 'child');
  const addon = options.find((o) => o.kind === 'addon');
  if (!adult || !child || !addon) return { ok: false, message: 'Listing is missing its options.' };

  const lines = [];
  if (party.adults > 0) {
    lines.push({
      optionId: adult.id,
      label: adult.label,
      unitAmountMinor: adult.unitAmountMinor,
      quantity: party.adults,
      occupiesCapacity: true,
    });
  }
  if (party.children > 0) {
    lines.push({
      optionId: child.id,
      label: child.label,
      unitAmountMinor: child.unitAmountMinor,
      quantity: party.children,
      occupiesCapacity: true,
    });
  }
  if (party.photoPackage) {
    lines.push({
      optionId: addon.id,
      label: addon.label,
      unitAmountMinor: addon.unitAmountMinor,
      quantity: 1,
      occupiesCapacity: false,
    });
  }
  if (lines.length === 0) return { ok: false, message: 'Choose at least one guest.' };

  const result = calculateBookingTotal({
    currency: 'USD',
    lines,
    // The rum punch is a complimentary add-on, not a discount: it changes what the guest receives,
    // not what they pay. Modelling it as money off would quietly alter the total the vendor is
    // owed, and the offer's own terms say it is not redeemable for cash.
    discounts: [],
    config: PRICING_CONFIG,
    capacityRemaining,
  });

  if (!result.ok) {
    return {
      ok: false,
      message:
        result.error.code === 'EXCEEDS_CAPACITY'
          ? `Only ${result.error.capacityRemaining} places left on this departure.`
          : result.error.message,
    };
  }
  void opts;
  return { ok: true, breakdown: result.breakdown };
}

export function seatsIn(party: PartySelection): number {
  return party.adults + party.children;
}

export function qualifiesForRumPunch(experience: DemoExperience): boolean {
  return PROMOTION.appliesToExperienceIds.includes(experience.id);
}

// ---------------------------------------------------------------------------
// Proximity
// ---------------------------------------------------------------------------

/**
 * The guest's simulated position — the centre of the selected destination.
 *
 * Real geolocation is deliberately not requested. This is an investor demonstration that has to
 * behave identically on every machine it is opened on, and a browser permission prompt that the
 * presenter declines (or that a desktop answers with an office in another country) turns the whole
 * proximity story off mid-demonstration. `docs/…` records this as a simulation, and the UI says so.
 */
export function simulatedPosition(destination: DemoDestination) {
  return { lat: destination.centre_lat, lng: destination.centre_lng };
}

export interface WithDistance {
  experience: DemoExperience;
  metres: number;
}

export function byDistanceFrom(
  origin: { lat: number; lng: number },
  experiences: DemoExperience[],
): WithDistance[] {
  return experiences
    .map((experience) => {
      const vendor = vendorFor(experience);
      const metres = vendor
        ? distanceMetres(origin, { lat: vendor.location.lat, lng: vendor.location.lng })
        : Number.MAX_SAFE_INTEGER;
      return { experience, metres };
    })
    .sort((a, b) => a.metres - b.metres);
}

export interface Travel {
  minutes: number;
  mode: 'walk' | 'drive';
}

/**
 * How long it takes to get there, and how.
 *
 * The design's cards say "4 min away" and "12 min away", and its geography is tight enough that
 * those are all walks. The real vendor coordinates are not: Camana Bay is 4.4 km from the Seven
 * Mile Beach centre, which at walking pace is 66 minutes. Rendering that as "66 min away" beside a
 * badge reading "Pickup available" is the kind of small incoherence that an audience notices even
 * when they cannot say why.
 *
 * So the mode is chosen from the distance and then *stated*, rather than a walk being assumed:
 * 4 km/h under 1.2 km, and 28 km/h beyond it — a realistic average for Caribbean coastal roads with
 * junctions and single-lane sections, not open-highway speed.
 */
export function travelFrom(metres: number): Travel {
  if (metres <= WALKABLE_METRES) {
    return { minutes: Math.max(1, Math.round(metres / 66.7)), mode: 'walk' };
  }
  return { minutes: Math.max(2, Math.round(metres / 466.7)), mode: 'drive' };
}

/** Beyond this a listing is offered with pickup rather than as a walk. */
export const WALKABLE_METRES = 1200;

export function isWalkable(metres: number): boolean {
  return metres <= WALKABLE_METRES;
}

/** "4.4 km" / "600 m" — metres below a kilometre, because "0.6 km" reads as further than it is. */
export function formatKm(metres: number): string {
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}
