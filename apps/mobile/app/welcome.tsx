import { Image, Pressable, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { palette, semantic, spacing, typography } from '@cvip/ui';
import { demoImage } from '../lib/demoMedia';
import { markOnboardingSeen } from '../lib/onboarding';
import { Crest, PrimaryButton, SecondaryButton } from '../components/kit';

/**
 * Welcome — mockup screen 1.
 *
 * A full-bleed photograph with the wordmark and two ways in. "Continue as Guest" is the primary
 * action on purpose: T-01 requires a guest to reach Explore and open an experience without an
 * account, and putting sign-in first would contradict that on the very first screen.
 *
 * Shown once. `markOnboardingSeen` records that it has been, so relaunching goes straight to
 * Explore rather than making a returning guest walk past a splash screen every time.
 */
export default function Welcome() {
  const background = demoImage('jm-blue-lagoon-1') ?? demoImage('jm-hero');

  const enter = (destination: '/' | '/sign-in') => {
    markOnboardingSeen();
    router.replace(destination);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: palette.green900 }}>
        {background ? (
          <Image
            source={background}
            style={{ ...fill, width: '100%', height: '100%' }}
            resizeMode="cover"
            accessible={false}
          />
        ) : null}

        {/* Scrim: the tagline has to stay readable over whatever the photograph is doing, and PRD
            §16 makes outdoor readability a hard constraint rather than a preference. */}
        <View style={{ ...fill, backgroundColor: 'rgba(4,33,28,0.62)' }} />

        <View
          style={{
            flex: 1,
            padding: spacing.lg,
            paddingBottom: spacing.xxl,
            justifyContent: 'flex-end',
            gap: spacing.lg,
          }}
        >
          <View style={{ gap: spacing.md, alignItems: 'center' }}>
            <Crest island="Jamaica" size="lg" />
            <Text
              style={{
                ...typography.caption,
                color: palette.gold,
                letterSpacing: 3,
                marginTop: spacing.sm,
              }}
            >
              DISCOVER. BOOK. EXPERIENCE.
            </Text>
            <Text
              style={{
                ...typography.title,
                color: semantic.textOnDark,
                textAlign: 'center',
              }}
            >
              Your Caribbean Adventure Starts Here
            </Text>
            <Text
              style={{
                ...typography.body,
                color: semantic.textOnDark,
                opacity: 0.92,
                textAlign: 'center',
              }}
            >
              Authentic experiences. Verified local operators. Unforgettable memories.
            </Text>
          </View>

          <View style={{ gap: spacing.sm }}>
            <PrimaryButton
              label="Continue as Guest"
              onPress={() => enter('/')}
              accessibilityLabel="Continue as a guest, without an account"
            />
            <SecondaryButton label="Sign In / Create Account" onDark onPress={() => enter('/sign-in')} />
            <Pressable
              onPress={() => enter('/')}
              accessibilityRole="button"
              style={{ alignItems: 'center', paddingVertical: spacing.sm }}
            >
              <Text style={{ ...typography.caption, color: semantic.textOnDark, opacity: 0.85 }}>
                Skip for now
              </Text>
            </Pressable>
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
