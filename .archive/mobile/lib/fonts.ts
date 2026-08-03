import { useFonts } from 'expo-font';
import {
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';

/**
 * The two faces the mockup uses.
 *
 * Playfair Display carries the display copy — the crest's "VIP", the destination title, the
 * voucher headline — and DM Sans carries everything else. They are bundled rather than named in a
 * CSS stack so the demo renders identically wherever it is opened; a stack that falls back to
 * Georgia and the system UI font is close enough to fool a glance and wrong enough to be obvious
 * beside the mockup.
 *
 * The keys here must match `fonts` in `@cvip/ui`, which is what `typography` refers to.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    PlayfairDisplay_700Bold,
    PlayfairDisplay_600SemiBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  // A font that fails to load must not blank the app — the platform default is a worse-looking
  // screen, not a broken one, so treat a failure as "carry on" rather than holding the splash.
  return loaded || error !== null;
}
