import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import { useIsland } from '../lib/island';

/**
 * Manual island and destination selection — T-02.
 *
 * PRD §5 requires manual selection as an alternative to location permission, so this screen never
 * asks for location and works fully without it. Only active islands are listed, which the RLS
 * policy guarantees rather than this component filtering.
 */
export default function SelectDestination() {
  const { islands, destinations, island, destination, selectIsland, selectDestination } =
    useIsland();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: semantic.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
    >
      <View style={{ gap: spacing.sm }}>
        <Text style={{ ...typography.heading, color: semantic.textPrimary }}>Island</Text>
        <Text style={{ ...typography.caption, color: semantic.textMuted }}>
          One account, one wallet, one trip history — wherever you land.
        </Text>
        {islands.map((i) => (
          <Pressable
            key={i.id}
            onPress={() => void selectIsland(i.id)}
            style={rowStyle(i.id === island?.id)}
          >
            <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{i.name}</Text>
            <Text style={{ ...typography.caption, color: semantic.textMuted }}>
              {i.in_app_brand} · {i.currency}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ ...typography.heading, color: semantic.textPrimary }}>Where are you?</Text>

        <Pressable onPress={() => void selectDestination(null)} style={rowStyle(!destination)}>
          <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
            Anywhere on the island
          </Text>
        </Pressable>

        {destinations.map((d) => (
          <Pressable
            key={d.id}
            onPress={() => void selectDestination(d.id)}
            style={rowStyle(d.id === destination?.id)}
          >
            <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{d.name}</Text>
            {d.editorial_content ? (
              <Text style={{ ...typography.caption, color: semantic.textMuted }}>
                {d.editorial_content}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => router.back()}
        style={{
          backgroundColor: semantic.brandActive,
          borderRadius: radius.md,
          padding: spacing.md,
          alignItems: 'center',
        }}
      >
        <Text style={{ ...typography.bodyStrong, color: semantic.textOnDark }}>Done</Text>
      </Pressable>
    </ScrollView>
  );
}

function rowStyle(selected: boolean) {
  return {
    backgroundColor: selected ? semantic.surfaceSunken : semantic.surface,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? semantic.brandActive : semantic.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  } as const;
}
