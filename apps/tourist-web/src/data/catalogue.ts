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
 * Why a quote failed — so the button can name the blocker rather than guess at it.
 *
 * Checkout's disabled button read "Choose a departure" whenever a quote failed for any reason,
 * including when a departure *was* chosen and the party simply did not fit it. A control that
 * misnames what is wrong sends the guest to change the one thing that was already right.
 */
export type QuoteFailure = 'capacity' | 'no-guests' | 'other';

/**
 * The largest party that fits, capped at the default.
 *
 * Checkout auto-selects the first departure with room and used to auto-set the party to two — then
 * showed a red error when the departure only had one seat. The app made both choices and blamed
 * the guest for the combination. It now opens on a party the chosen departure can actually take.
 */
export function partyFitting(capacityRemaining: number): PartySelection {
  return { ...DEFAULT_PARTY, adults: Math.max(1, Math.min(DEFAULT_PARTY.adults, capacityRemaining)) };
}

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
): { ok: true; breakdown: PriceBreakdown } | { ok: false; code: QuoteFailure; message: string } {
  const options = demoOptionsFor(experience);
  const adult = options.find((o) => o.kind === 'adult');
  const child = options.find((o) => o.kind === 'child');
  const addon = options.find((o) => o.kind === 'addon');
  if (!adult || !child || !addon)
    return { ok: false, code: 'other', message: 'Listing is missing its options.' };

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
  if (lines.length === 0) return { ok: false, code: 'no-guests', message: 'Choose at least one guest.' };

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
      code: result.error.code === 'EXCEEDS_CAPACITY' ? 'capacity' : 'other',
      message:
        result.error.code === 'EXCEEDS_CAPACITY'
          ? // Plural, and it says what to do about it. "Only 1 places left on this departure" was
            // a grammar error on the money screen, and naming a constraint without naming the way
            // out of it is the same failure Irie's clash resolver exists to avoid.
            `Only ${result.error.capacityRemaining} ${
              result.error.capacityRemaining === 1 ? 'place' : 'places'
            } left on this departure — reduce your party, or choose another time.`
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

/**
 * What one adult actually pays — the number every browse surface shows.
 *
 * The cards used to print `fromAmountMinor`, the vendor's base rate, and checkout then added 15%
 * tax and a 5% service fee: "From US$98" became US$117.60 at the last step. The checkout summary
 * itemised it honestly, but a 20% reveal after the guest has chosen is drip pricing, and it is the
 * wrong first impression for a brand whose promise is that nothing surprises you.
 *
 * It is computed by running the **same** `priceFor` the checkout charges from, rather than by
 * multiplying the base by 1.20 here. A second copy of the tax arithmetic is a second thing to keep
 * in step, and the failure mode — browse and checkout disagreeing about money — is the one that
 * costs trust fastest. If the rates change in `platform_settings`, both move together or neither
 * does.
 *
 * `fromAmountMinor` itself is untouched: it is the vendor's rate, it is what the vendor dashboard
 * and the checkout itemisation must keep showing, and it is what this is derived from.
 */
export function allInFromMinor(experience: DemoExperience): number {
  const quote = priceFor(experience, { adults: 1, children: 0, photoPackage: false }, 1);
  // An unpriceable listing falls back to the base rate rather than rendering nothing — a card with
  // no price is worse than a card with an unadorned one.
  return quote.ok ? quote.breakdown.total.amountMinor : experience.fromAmountMinor;
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

/**
 * Below this the guest is standing at the operator's base, not travelling to it.
 *
 * Only reachable with a real position — the simulated origin is a destination centre, kilometres
 * from any vendor. Several listings share one operator and therefore one set of coordinates, so a
 * guest at Dunn's River Falls is genuinely 0 m from three different experiences, and rendering that
 * as "1 min walk · 0 m" (the travel floor is one minute) reads as a broken calculation rather than
 * as the truth. "You're here" is both shorter and correct.
 */
export const AT_VENUE_METRES = 75;

export function isAtVenue(metres: number): boolean {
  return metres <= AT_VENUE_METRES;
}

export function isWalkable(metres: number): boolean {
  return metres <= WALKABLE_METRES;
}

/** "4.4 km" / "600 m" — metres below a kilometre, because "0.6 km" reads as further than it is. */
export function formatKm(metres: number): string {
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}

// ---------------------------------------------------------------------------
// The promoted listing
// ---------------------------------------------------------------------------

/** Every listing the on-island promotion applies to. */
export function promotedExperiencesOn(islandId: string): DemoExperience[] {
  return PROMOTION.appliesToExperienceIds
    .map((id) => experienceById(id))
    .filter((e): e is DemoExperience => Boolean(e) && e!.islandId === islandId);
}

/**
 * How far from the guest's destination an offer may still call itself nearby.
 *
 * The simulated position is a town centre, not a phone, so the real 250 m fence in `geofence.ts`
 * cannot be applied to it — nothing is 250 m from a centroid. This is the radius that says "the
 * same trip out": Camana Bay is 4.3 km from the centre of George Town and is plainly nearby; the
 * Negril jetty is 130 km from Ocho Rios and is plainly not. 8 km separates those without needing
 * a judgement call, and the screen states the measured travel either way, so the number is a
 * threshold rather than a claim.
 */
export const OFFER_NEARBY_METRES = 8000;

/**
 * The promoted listing the guest is actually near, if any.
 *
 * Selecting by island alone was enough to put "A few minutes from Ocho Rios" above the Negril
 * jetty — 130 km away, on the one screen whose entire claim is proximity. The dataset was never
 * wrong; the screen was, and it was wrong about the thing the product is sold on.
 *
 * Nearby means **the vendor is in the guest's destination, or within `OFFER_NEARBY_METRES` of its
 * centre**. The second clause matters: a destination boundary is an administrative line, not a
 * distance, and a slug-only rule would have refused a genuine offer 4 km up the coast while a
 * distance-only rule against a centroid has no principled radius. Where both could apply, the
 * nearest wins.
 *
 * Returning `undefined` is a real answer. Nothing nearby qualifies is the ordinary case, and it is
 * why the demo fallback in `Explore` no longer fires everywhere.
 */
export function promotedExperienceNear(
  islandId: string,
  destinationSlug: string,
): DemoExperience | undefined {
  const destination = destinationBySlug(destinationSlug);
  if (!destination) return undefined;
  const origin = simulatedPosition(destination);

  return promotedExperiencesOn(islandId)
    .map((experience) => {
      const vendor = vendorFor(experience);
      if (!vendor) return null;
      const metres = distanceMetres(origin, {
        lat: vendor.location.lat,
        lng: vendor.location.lng,
      });
      const here = vendor.location.destinationSlug === destinationSlug;
      return here || metres <= OFFER_NEARBY_METRES ? { experience, metres } : null;
    })
    .filter((x): x is { experience: DemoExperience; metres: number } => x !== null)
    .sort((a, b) => a.metres - b.metres)[0]?.experience;
}

/** How far the guest is from a listing's operator, and how they would get there. */
export function travelToExperience(
  origin: { lat: number; lng: number },
  experience: DemoExperience,
): { metres: number; travel: Travel } | undefined {
  const vendor = vendorFor(experience);
  if (!vendor) return undefined;
  const metres = distanceMetres(origin, { lat: vendor.location.lat, lng: vendor.location.lng });
  return { metres, travel: travelFrom(metres) };
}
