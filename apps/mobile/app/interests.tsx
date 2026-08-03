import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import type { ExperienceCategory } from '@cvip/types';
import { palette, radius, semantic, spacing, typography } from '@cvip/ui';
import { setInterests } from '../lib/interests';
import { Icon, PrimaryButton, ScreenTitle, TextLink, type IconName } from '../components/kit';

/**
 * "What are you interested in?" — mockup screen 2, the step between Welcome and Explore.
 *
 * Eight tiles, two across, each mapping onto real PRD categories so a choice does something rather
 * than being decoration. Selection is multiple and entirely optional: "Skip" is a first-class exit,
 * not a grey afterthought, because T-01 requires a guest to reach Explore without committing to
 * anything.
 *
 * What the choice does: it *ranks*, it does not filter. See `lib/interests.ts` — picking "Beaches"
 * floats beaches up on Explore, it never hides the waterfalls. A first-run screen that quietly
 * removes half the catalogue is a trap, because the guest has no way to connect the empty list back
 * to the tile they tapped a minute earlier.
 */
const TILES: { icon: IconName; label: string; categories: ExperienceCategory[] }[] = [
  { icon: 'trending-up', label: 'Adventure', categories: ['adventure'] },
  { icon: 'umbrella', label: 'Beaches', categories: ['beaches'] },
  { icon: 'coffee', label: 'Food & Dining', categories: ['food'] },
  { icon: 'book-open', label: 'Culture', categories: ['culture'] },
  { icon: 'music', label: 'Nightlife', categories: ['nightlife'] },
  { icon: 'heart', label: 'Wellness', categories: ['wellness'] },
  { icon: 'users', label: 'Family', categories: ['family'] },
  { icon: 'map', label: 'Hidden Gems', categories: ['day_trips', 'waterfalls'] },
];

export default function Interests() {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (label: string) =>
    setSelected((s) => (s.includes(label) ? s.filter((x) => x !== label) : [...s, label]));

  const finish = (keep: boolean) => {
    setInterests(
      keep
        ? TILES.filter((t) => selected.includes(t.label)).flatMap((t) => t.categories)
        : [],
    );
    router.replace('/');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: semantic.background }}>
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingTop: spacing.xxl,
            gap: spacing.lg,
            flexGrow: 1,
          }}
        >
          <ScreenTitle
            title="What are you interested in?"
            subtitle="Select a few so we can personalize your experience. You can change this later."
          />

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: spacing.sm + 4,
            }}
          >
            {TILES.map((tile) => {
              const on = selected.includes(tile.label);
              return (
                <Pressable
                  key={tile.label}
                  onPress={() => toggle(tile.label)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={tile.label}
                  style={({ pressed }) => ({
                    // Two across, accounting for the gap between them.
                    width: '47%',
                    flexGrow: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: spacing.sm,
                    paddingVertical: spacing.lg,
                    borderRadius: radius.lg,
                    backgroundColor: on ? semantic.brand : semantic.surface,
                    borderWidth: on ? 2 : 1,
                    borderColor: on ? semantic.brand : semantic.border,
                    opacity: pressed ? 0.9 : 1,
                  })}
                >
                  <Icon
                    name={tile.icon}
                    size={26}
                    color={on ? palette.goldLight : semantic.brand}
                  />
                  <Text
                    style={{
                      ...typography.captionStrong,
                      color: on ? semantic.textOnDark : semantic.textPrimary,
                    }}
                  >
                    {tile.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flex: 1 }} />

          <View style={{ gap: spacing.xs }}>
            <PrimaryButton
              label={selected.length > 0 ? `Continue with ${selected.length}` : 'Continue'}
              onPress={() => finish(true)}
              accessibilityLabel={
                selected.length > 0
                  ? `Continue with ${selected.length} interests selected`
                  : 'Continue without selecting interests'
              }
            />
            <TextLink label="Skip" onPress={() => finish(false)} />
          </View>
        </ScrollView>
      </View>
    </>
  );
}
