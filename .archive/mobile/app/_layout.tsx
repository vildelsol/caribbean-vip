import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { semantic, typography } from '@cvip/ui';
import { SessionProvider } from '../lib/session';
import { IslandProvider } from '../lib/island';
import { SavedProvider } from '../lib/saved';
import { useAppFonts } from '../lib/fonts';
import { DemoBanner } from '../components/DemoBanner';

/**
 * Root layout.
 *
 * There is deliberately no auth gate here. T-01 requires a guest to reach Explore and open an
 * experience without an account, so the providers supply session and island context to every
 * screen and sign-in is requested only where a requirement demands it (checkout, Trips, saving).
 *
 * The stack header is restyled to the mockup: ivory rather than deep green, with the title in the
 * UI sans. The mockup's chrome is ivory throughout — a green header above an ivory screen is the
 * same mistake the bottom navigation was making.
 */
export default function RootLayout() {
  const fontsReady = useAppFonts();

  // Painting before the faces are in swaps every screen's type a beat later, which is far more
  // visible than a short ivory hold. The background matches the app so there is no flash.
  if (!fontsReady) {
    return <View style={{ flex: 1, backgroundColor: semantic.background }} />;
  }

  return (
    <SessionProvider>
      <IslandProvider>
        <SavedProvider>
          <StatusBar style="dark" />
          <DemoBanner />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: semantic.background },
              headerTintColor: semantic.textPrimary,
              headerShadowVisible: false,
              headerTitleStyle: {
                fontFamily: typography.heading.fontFamily,
                fontSize: typography.heading.fontSize,
                color: semantic.textPrimary,
              },
              contentStyle: { backgroundColor: semantic.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
            <Stack.Screen name="interests" options={{ headerShown: false }} />
            <Stack.Screen name="sign-in" options={{ title: 'Sign in', presentation: 'modal' }} />
            <Stack.Screen
              name="select-destination"
              options={{ title: 'Where are you going?', presentation: 'modal' }}
            />
            <Stack.Screen name="search" options={{ title: 'Search' }} />
            {/* The detail page draws its own floating controls over a full-bleed photograph. */}
            <Stack.Screen name="experience/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="book/[id]" options={{ title: 'Secure Checkout' }} />
            <Stack.Screen name="booking/[id]" options={{ title: 'Your booking' }} />
            <Stack.Screen name="voucher/[id]" options={{ title: 'Your ticket' }} />
          </Stack>
        </SavedProvider>
      </IslandProvider>
    </SessionProvider>
  );
}
