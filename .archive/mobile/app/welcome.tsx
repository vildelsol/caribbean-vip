import { Image, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, semantic, spacing, typography } from '@cvip/ui';
import { demoImage } from '../lib/demoMedia';
import { markOnboardingSeen } from '../lib/onboarding';
import { useIsland } from '../lib/island';
import { Crest, GoldButton, OutlineButton, TextLink } from '../components/kit';

/**
 * Welcome — mockup screen 1.
 *
 * Drawn to the VIP Cayman mockup: a full-bleed photograph, the crest floating over the water at
 * roughly a third of the way down, a short tagline pair, then a gold pill and a gold-outlined pill
 * with a text link beneath.
 *
 * Two things changed from the previous version, both of them things the mockup does deliberately:
 *
 * - **No flat scrim.** The whole photograph was tinted 62% green, which killed the water — the one
 *   thing the screen is selling. The mockup keeps the image clean and darkens only the bottom
 *   third, under a gradient, where the type actually sits.
 * - **The buttons are pills**, gold first. They were a green rectangle and a white rectangle, which
 *   is a different design.
 *
 * "Continue as Guest" is the primary action on purpose: T-01 requires a guest to reach Explore and
 * open an experience without an account, and putting sign-in first would contradict that on the
 * very first screen.
 *
 * Shown once. `markOnboardingSeen` records that it has been, so relaunching goes straight to
 * Explore rather than making a returning guest walk past a splash screen every time.
 */
export default function Welcome() {
  const { island } = useIsland();
  const background = demoImage('jm-blue-lagoon-1') ?? demoImage('jm-hero');
  const place = island?.name ?? 'the Caribbean';

  /**
   * Guests go on to Interests (mockup screen 2), which is optional and offers Skip; signing in
   * goes straight to the sign-in sheet. `markOnboardingSeen` fires here either way, so the splash
   * is shown once per session rather than every time Explore mounts.
   */
  const enter = (destination: '/interests' | '/sign-in') => {
    markOnboardingSeen();
    router.replace(destination);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: palette.green950 }}>
        {background ? (
          <Image
            source={background}
            style={{ ...fill, width: '100%', height: '100%' }}
            resizeMode="cover"
            accessible={false}
          />
        ) : null}

        {/* The mockup darkens only where type sits, so the photograph stays a photograph.
            PRD §16 makes outdoor readability a hard constraint, and a bottom-weighted gradient
            satisfies it without flattening the image. */}
        {/* `pointerEvents` must be a *style*, not a prop: react-native-web deprecated the prop and
            `expo-linear-gradient` does not forward it, so a full-bleed scrim with the prop form
            sits over the screen and silently swallows every tap on the buttons below it. */}
        <LinearGradient
          colors={['rgba(12,43,37,0.30)', 'rgba(12,43,37,0.10)', 'rgba(12,43,37,0.80)']}
          locations={[0, 0.34, 0.86]}
          style={{ ...fill, pointerEvents: 'none' }}
        />

        {/* The vertical rhythm is measured off the mockup rather than eyeballed: the crest sits
            about a fifth of the way down, there is a deliberate open stretch of water beneath it,
            and the type block lands at roughly two thirds. The flex weights below are those
            proportions, so they hold on a short phone and a tall one alike. */}
        <View
          style={{
            flex: 1,
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.lg,
          }}
        >
          <View style={{ flex: 21 }} />

          <View style={{ alignItems: 'center' }}>
            <Crest island={island?.name ?? null} size="lg" onPhoto />
          </View>

          <View style={{ flex: 26 }} />

          <View style={{ gap: spacing.sm }}>
            <Text
              style={{
                ...typography.title,
                fontSize: 25,
                color: semantic.textOnDark,
                textAlign: 'center',
              }}
            >
              Your Island. Your Way.
            </Text>
            <Text
              style={{
                ...typography.body,
                fontSize: 15,
                lineHeight: 23,
                color: semantic.textOnDark,
                opacity: 0.9,
                textAlign: 'center',
              }}
            >
              {`Premium experiences in\n${place}.`}
            </Text>
          </View>

          <View style={{ flex: 6 }} />

          <View style={{ gap: spacing.sm + 4 }}>
            <GoldButton
              label="Continue as Guest"
              onPress={() => enter('/interests')}
              accessibilityLabel="Continue as a guest, without an account"
            />
            <OutlineButton label="Sign In" onPress={() => enter('/sign-in')} />
            <TextLink label="Create an Account" onDark onPress={() => enter('/sign-in')} />
          </View>
        </View>
      </View>
    </>
  );
}

const fill = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};
