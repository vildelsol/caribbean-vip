import type { ImageSourcePropType } from 'react-native';
import { demoMediaCredit, demoMediaCreditLine } from '@cvip/demo';

/**
 * Demo photography, resolved from a media key to a bundled image.
 *
 * Metro requires a *static* string literal in every `require`, so this table cannot be generated
 * from the dataset at runtime — a dynamic path silently resolves to nothing. It is therefore
 * written out by hand, and `assertDemoMediaComplete` (exercised by the demo tests) fails loudly if
 * the dataset ever references a key that was not added here. That check is the reason a missing
 * entry becomes a red test rather than a blank hero image discovered during a demonstration.
 *
 * Files come from `scripts/seed-media/fetch.py`; credits live in `@cvip/demo`.
 */
const DEMO_MEDIA: Record<string, ImageSourcePropType> = {
  // -- Jamaica ------------------------------------------------------------
  'jm-hero': require('../assets/demo/jm-hero.jpg'),
  'jm-dunns-1': require('../assets/demo/jm-dunns-1.jpg'),
  'jm-dunns-2': require('../assets/demo/jm-dunns-2.jpg'),
  'jm-dunns-3': require('../assets/demo/jm-dunns-3.jpg'),
  'jm-mystic-1': require('../assets/demo/jm-mystic-1.jpg'),
  'jm-white-river-1': require('../assets/demo/jm-white-river-1.jpg'),
  'jm-white-river-2': require('../assets/demo/jm-white-river-2.jpg'),
  'jm-blue-hole-1': require('../assets/demo/jm-blue-hole-1.jpg'),
  'jm-blue-hole-2': require('../assets/demo/jm-blue-hole-2.jpg'),
  'jm-seven-mile-1': require('../assets/demo/jm-seven-mile-1.jpg'),
  'jm-seven-mile-2': require('../assets/demo/jm-seven-mile-2.jpg'),
  'jm-negril-bay': require('../assets/demo/jm-negril-bay.jpg'),
  'jm-catamaran-1': require('../assets/demo/jm-catamaran-1.jpg'),
  'jm-west-end-1': require('../assets/demo/jm-west-end-1.jpg'),
  'jm-west-end-2': require('../assets/demo/jm-west-end-2.jpg'),
  'jm-coffee-1': require('../assets/demo/jm-coffee-1.jpg'),
  'jm-coffee-2': require('../assets/demo/jm-coffee-2.jpg'),
  'jm-coffee-3': require('../assets/demo/jm-coffee-3.jpg'),
  'jm-blue-mountains': require('../assets/demo/jm-blue-mountains.jpg'),
  'jm-music-1': require('../assets/demo/jm-music-1.jpg'),
  'jm-music-2': require('../assets/demo/jm-music-2.jpg'),
  'jm-craft-1': require('../assets/demo/jm-craft-1.jpg'),
  'jm-rafting-1': require('../assets/demo/jm-rafting-1.jpg'),
  'jm-rafting-2': require('../assets/demo/jm-rafting-2.jpg'),
  'jm-reach-1': require('../assets/demo/jm-reach-1.jpg'),
  'jm-blue-lagoon-1': require('../assets/demo/jm-blue-lagoon-1.jpg'),
  'jm-rose-hall-1': require('../assets/demo/jm-rose-hall-1.jpg'),
  'jm-mobay-1': require('../assets/demo/jm-mobay-1.jpg'),
  'jm-treasure-1': require('../assets/demo/jm-treasure-1.jpg'),
  'jm-south-coast-1': require('../assets/demo/jm-south-coast-1.jpg'),
  'jm-black-river-1': require('../assets/demo/jm-black-river-1.jpg'),

  // -- Cayman Islands -----------------------------------------------------
  'ky-hero': require('../assets/demo/ky-hero.jpg'),
  'ky-stingray-1': require('../assets/demo/ky-stingray-1.jpg'),
  'ky-stingray-2': require('../assets/demo/ky-stingray-2.jpg'),
  'ky-seven-mile-1': require('../assets/demo/ky-seven-mile-1.jpg'),
  'ky-sail-1': require('../assets/demo/ky-sail-1.jpg'),
  'ky-turtle-1': require('../assets/demo/ky-turtle-1.jpg'),
  'ky-turtle-2': require('../assets/demo/ky-turtle-2.jpg'),
  'ky-hell-1': require('../assets/demo/ky-hell-1.jpg'),
  'ky-rum-point-1': require('../assets/demo/ky-rum-point-1.jpg'),
  'ky-kaibo-1': require('../assets/demo/ky-kaibo-1.jpg'),
  'ky-camana-1': require('../assets/demo/ky-camana-1.jpg'),
  'ky-sunset-1': require('../assets/demo/ky-sunset-1.jpg'),

  // -- Barbados -----------------------------------------------------------
  'bb-hero': require('../assets/demo/bb-hero.jpg'),
  'bb-harrisons-1': require('../assets/demo/bb-harrisons-1.jpg'),
  'bb-harrisons-2': require('../assets/demo/bb-harrisons-2.jpg'),
  'bb-animal-flower-1': require('../assets/demo/bb-animal-flower-1.jpg'),
  'bb-animal-flower-2': require('../assets/demo/bb-animal-flower-2.jpg'),
  'bb-oistins-1': require('../assets/demo/bb-oistins-1.jpg'),
  'bb-bathsheba-1': require('../assets/demo/bb-bathsheba-1.jpg'),
  'bb-bathsheba-2': require('../assets/demo/bb-bathsheba-2.jpg'),
  'bb-rum-1': require('../assets/demo/bb-rum-1.jpg'),
  'bb-carlisle-1': require('../assets/demo/bb-carlisle-1.jpg'),
  'bb-carlisle-2': require('../assets/demo/bb-carlisle-2.jpg'),
  'bb-west-coast-1': require('../assets/demo/bb-west-coast-1.jpg'),
  'bb-bridgetown-1': require('../assets/demo/bb-bridgetown-1.jpg'),
  'bb-south-coast-1': require('../assets/demo/bb-south-coast-1.jpg'),
};

/** The bundled image for a media key, or null when the key is unknown. */
export function demoImage(key: string | undefined | null): ImageSourcePropType | null {
  if (!key) return null;
  return DEMO_MEDIA[key] ?? null;
}

/**
 * Attribution to render beneath an image.
 *
 * Never omit this. Most of the photography is CC BY or CC BY-SA, both of which require credit
 * wherever the work appears — a screenshot of an uncredited listing is the exact failure mode.
 */
export function demoImageCredit(key: string | undefined | null): string | null {
  return key ? demoMediaCreditLine(key) : null;
}

export { demoMediaCredit };

/** Every media key that has a bundled file. Used by the completeness test. */
export function demoMediaKeys(): string[] {
  return Object.keys(DEMO_MEDIA);
}
