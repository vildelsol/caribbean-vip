import { describe, expect, it } from 'vitest';
import { DEMO_ISLANDS } from '@cvip/demo';
import {
  OFFER_NEARBY_METRES,
  destinationsFor,
  promotedExperienceNear,
  simulatedPosition,
  travelToExperience,
  vendorFor,
} from './catalogue';

const liveIslands = DEMO_ISLANDS.filter((i) => i.is_active);
const defaultDestination = (islandId: string) => destinationsFor(islandId)[0]!;

describe('the geofenced offer is only offered where it is', () => {
  it('fires in the destination every guest starts in, on every island', () => {
    // Not a nicety — the offer fires on proximity to the issuing vendor, so a promotion with
    // nothing near the town the app opens in is a feature nobody in a demonstration will see.
    for (const island of liveIslands) {
      const home = defaultDestination(island.id);
      const found = promotedExperienceNear(island.id, home.slug);
      expect(found, `${island.in_app_brand} has no offer in ${home.name}`).toBeDefined();
    }
  });

  it('does not offer the Negril jetty to a guest in Ocho Rios', () => {
    // The defect: selection by island printed "A few minutes from Ocho Rios" above a vendor 130 km
    // away, on the one screen whose whole claim is proximity.
    const found = promotedExperienceNear('island-jm', 'ocho-rios');
    expect(found?.id).not.toBe('exp-catamaran');
  });

  it('offers the Negril listing to a guest who is actually in Negril', () => {
    expect(promotedExperienceNear('island-jm', 'negril')?.id).toBe('exp-catamaran');
  });

  it('never names a vendor further away than the nearby radius', () => {
    for (const island of liveIslands) {
      for (const destination of destinationsFor(island.id)) {
        const found = promotedExperienceNear(island.id, destination.slug);
        if (!found) continue;
        const vendor = vendorFor(found)!;
        const trip = travelToExperience(simulatedPosition(destination), found)!;
        const sameDestination = vendor.location.destinationSlug === destination.slug;
        expect(
          sameDestination || trip.metres <= OFFER_NEARBY_METRES,
          `${destination.name} → ${found.title} at ${Math.round(trip.metres)} m`,
        ).toBe(true);
      }
    }
  });

  it('returns nothing for a destination with no qualifying vendor near it', () => {
    // Port Antonio is the far northeast; nothing promoted is within reach of it.
    expect(promotedExperienceNear('island-jm', 'port-antonio')).toBeUndefined();
  });

  it('picks the nearest when more than one qualifies', () => {
    const home = defaultDestination('island-jm');
    const found = promotedExperienceNear('island-jm', home.slug)!;
    const trip = travelToExperience(simulatedPosition(home), found)!;
    expect(trip.metres).toBeLessThanOrEqual(OFFER_NEARBY_METRES);
  });
});
