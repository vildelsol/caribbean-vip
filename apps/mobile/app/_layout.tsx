import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { semantic } from '@cvip/ui';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: semantic.brand },
          headerTintColor: semantic.textOnDark,
          contentStyle: { backgroundColor: semantic.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
