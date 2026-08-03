import type { ImageSourcePropType } from 'react-native';
import { demoImage } from './demoMedia';

/**
 * A photograph for a destination row on "Where are you going?".
 *
 * Destinations carry no `hero_media_path` of their own — only islands and experiences do — but the
 * mockup's Select Destination screen is a list of photo rows, and a list of photo rows with no
 * photos is a list. Rather than add a column for demo content, each destination slug is mapped to
 * a bundled image that actually shows that place. Kept beside `demoMedia` so the two are obviously
 * the same kind of thing, and falls back to the island hero so a new destination is never blank.
 *
 * When real Storage-backed media arrives (see HANDOVER §8, "Live media does not render"), this is
 * one of the call sites that goes away.
 */
const BY_SLUG: Record<string, string> = {
  // Jamaica
  'ocho-rios': 'jm-dunns-1',
  'montego-bay': 'jm-mobay-1',
  // Seven Mile Beach rather than Bloody Bay: both are Negril, but the Bloody Bay frame is
  // near-monochrome and reads as a different island entirely at thumbnail size.
  negril: 'jm-seven-mile-1',
  kingston: 'jm-music-1',
  'port-antonio': 'jm-blue-lagoon-1',
  'south-coast': 'jm-south-coast-1',
  // Cayman
  'george-town': 'ky-camana-1',
  'seven-mile-beach-ky': 'ky-seven-mile-1',
  'west-bay': 'ky-hell-1',
  'rum-point': 'ky-rum-point-1',
  'east-end': 'ky-kaibo-1',
  // Barbados
  bridgetown: 'bb-bridgetown-1',
  'west-coast-bb': 'bb-west-coast-1',
  'south-coast-bb': 'bb-south-coast-1',
  'east-coast-bb': 'bb-bathsheba-1',
  'north-bb': 'bb-animal-flower-1',
  'central-bb': 'bb-harrisons-1',
};

export function destinationImage(
  slug: string | null | undefined,
  islandHeroKey?: string | null,
): ImageSourcePropType | null {
  const key = slug ? BY_SLUG[slug] : undefined;
  return demoImage(key ?? islandHeroKey ?? null);
}
