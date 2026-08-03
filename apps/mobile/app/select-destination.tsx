import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import { useIsland } from '../lib/island';
import { destinationImage } from '../lib/destinationMedia';
import { Chip, Divider, Icon, Photo, PrimaryButton } from '../components/kit';

/**
 * "Where are you going?" — mockup screen 3, and T-02.
 *
 * A "Use My Location" card, then the island's destinations as photo rows with a chevron, exactly as
 * the mockup draws them. The island switcher sits above as a chip row, because switching island is
 * a rarer action than switching town and the mockup gives the towns the whole screen.
 *
 * PRD §5 requires manual selection as an alternative to location permission, so nothing here
 * depends on location being granted — "Use My Location" is an accelerator, and declining it leaves
 * the screen fully usable. Only active islands are listed, which the RLS policy guarantees rather
 * than this component filtering.
 */
export default function SelectDestination() {
  const { islands, destinations, island, destination, selectIsland, selectDestination } =
    useIsland();
  const choose = async (id: string | null) => {
    await selectDestination(id);
    router.back();
  };

  /**
   * "Use My Location" hands off to Nearby rather than requesting permission here.
   *
   * Nearby already owns the whole flow — the prompt, the denied state, the distance sort — and PRD
   * §14 forbids asking for location outside an explicit user action. Two screens each running their
   * own permission dance is how one of them ends up prompting on mount. It also does not guess a
   * destination from a coordinate: being confidently wrong about which town you are in is worse
   * than showing what is actually close.
   */
  const useMyLocation = () => router.replace('/nearby');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: semantic.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}
    >
      <Text style={{ ...typography.caption, color: semantic.textMuted }}>
        Choose your destination, or let the app find what is nearby.
      </Text>

      {/* The mockup's "Use My Location" card — tinted, with the pin leading and a target trailing. */}
      <Pressable
        onPress={useMyLocation}
        accessibilityRole="button"
        accessibilityLabel="Use my location to see what is nearby"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          // Green-tinted with a green hairline, as the mockup draws it — it is the one
          // accelerator on the screen and it should not look like another list row.
          backgroundColor: semantic.tintBrand,
          borderWidth: 1.5,
          borderColor: semantic.accent,
          borderRadius: radius.lg,
          padding: spacing.md,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Icon name="map-pin" size={22} color={semantic.accent} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
            Use My Location
          </Text>
          <Text style={{ ...typography.caption, fontSize: 13, color: semantic.textMuted }}>
            See what&apos;s nearby
          </Text>
        </View>
        <Icon name="crosshair" size={20} color={semantic.accent} />
      </Pressable>

      {/* Island switcher. One account, one wallet, one trip history — wherever you land. */}
      {islands.length > 1 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.captionStrong, color: semantic.textMuted }}>Island</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm }}
          >
            {islands.map((i) => (
              <Chip
                key={i.id}
                label={i.name}
                selected={i.id === island?.id}
                onPress={() => void selectIsland(i.id)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Text style={{ ...typography.heading, color: semantic.textPrimary }}>
          Popular in {island?.name ?? 'the Caribbean'}
        </Text>

        <View
          style={{
            backgroundColor: semantic.surface,
            borderWidth: 1,
            borderColor: semantic.border,
            borderRadius: radius.lg,
            overflow: 'hidden',
          }}
        >
          <DestinationRow
            label="Anywhere on the island"
            detail={`Everything across ${island?.name ?? 'the island'}`}
            selected={!destination}
            onPress={() => void choose(null)}
          />
          {destinations.map((d) => (
            <View key={d.id}>
              <Divider />
              <DestinationRow
                label={d.name}
                detail={d.editorial_content ?? island?.name ?? ''}
                image={destinationImage(d.slug, island?.hero_media_path)}
                selected={d.id === destination?.id}
                onPress={() => void choose(d.id)}
              />
            </View>
          ))}
        </View>
      </View>

      <PrimaryButton label="Done" onPress={() => router.back()} />
    </ScrollView>
  );
}

function DestinationRow({
  label,
  detail,
  image,
  selected,
  onPress,
}: {
  label: string;
  detail: string;
  image?: ReturnType<typeof destinationImage>;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}. ${detail}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.sm + 4,
        backgroundColor: pressed ? semantic.surfaceSunken : 'transparent',
      })}
    >
      {image ? (
        <View style={{ width: 56 }}>
          <Photo source={image} ratio={1} radius={radius.md} />
        </View>
      ) : (
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: radius.md,
            backgroundColor: semantic.surfaceSunken,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="globe" size={22} color={semantic.textMuted} />
        </View>
      )}

      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{label}</Text>
        <Text
          numberOfLines={1}
          style={{ ...typography.caption, fontSize: 13, color: semantic.textMuted }}
        >
          {detail}
        </Text>
      </View>

      {selected ? (
        <Icon name="check" size={20} color={semantic.accent} />
      ) : (
        <Icon name="chevron-right" size={20} color={semantic.textMuted} />
      )}
    </Pressable>
  );
}
