import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { semantic } from '@cvip/ui';
import { SessionProvider } from '../lib/session';
import { IslandProvider } from '../lib/island';
import { SavedProvider } from '../lib/saved';
import { DemoBanner } from '../components/DemoBanner';

/**
 * Root layout.
 *
 * There is deliberately no auth gate here. T-01 requires a guest to reach Explore and open an
 * experience without an account, so the providers supply session and island context to every
 * screen and sign-in is requested only where a requirement demands it (checkout, Trips, saving).
 */
export default function RootLayout() {
  return (
    <SessionProvider>
      <IslandProvider>
        <SavedProvider>
        <StatusBar style="light" />
        <DemoBanner />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: semantic.brand },
            headerTintColor: semantic.textOnDark,
            contentStyle: { backgroundColor: semantic.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="sign-in"
            options={{ title: 'Sign in', presentation: 'modal' }}
          />
          <Stack.Screen
            name="select-destination"
            options={{ title: 'Choose your destination', presentation: 'modal' }}
          />
          <Stack.Screen name="search" options={{ title: 'Search' }} />
          <Stack.Screen name="experience/[id]" options={{ title: 'Experience' }} />
        </Stack>
        </SavedProvider>
      </IslandProvider>
    </SessionProvider>
  );
}
