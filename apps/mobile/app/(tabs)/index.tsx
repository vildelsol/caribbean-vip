import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import { EXPERIENCE_CATEGORIES, type ExperienceCategory } from '@cvip/types';
import { hasCatalogue } from '../../lib/mode';
import { hasSeenOnboarding } from '../../lib/onboarding';
import { useIsland } from '../../lib/island';
import { useSession } from '../../lib/session';
import { useSaved } from '../../lib/saved';
import { searchCatalogue, type CatalogueItem } from '../../lib/catalogue';
import { demoImage } from '../../lib/demoMedia';
import { ExperienceCard } from '../../components/ExperienceCard';
import { Notice } from '../../components/Notice';
import { Card, Chip, Crest, Photo, SectionHeader } from '../../components/kit';

/**
 * Bottom padding that clears the floating tab bar.
 *
 * The Irie AI button sits proud of the bar (PRD §16 puts it at the centre of five tabs), so without
 * this the last card is partly underneath it — unreadable and untappable.
 */
const TAB_BAR_CLEARANCE = spacing.xxl * 2;

/**
 * Explore — destination-aware home. T-01, T-02, T-03, and the "Explore Home" mockup.
 *
 * Laid out the way the mockups specify: a greeting with the current destination, a search field, a
 * quick filter row, a full-bleed "Near You Now" hero, then two-up recommendation cards and a
 * last-minute row. The mockups' own "key improvements" note asks for visual cards instead of long
 * text and a clear action on every screen, which is the shape this follows.
 *
 * Sections are built from the same RLS-governed catalogue query rather than a curated table, so
 * nothing here can surface a listing that is not publicly visible. No query in this file filters on
 * approval status: that is the database's job (AD-10), and the negative tests prove it.
 */

/**
 * The Cayman mockup's "Categories" row.
 *
 * Four broad tiles rather than the PRD's twelve raw categories, because twelve is a wall on a phone
 * and a tourist does not think in the taxonomy. Each tile maps onto real categories, so tapping one
 * runs the same RLS-governed search as everything else.
 */
const CATEGORY_TILES: { icon: string; label: string; categories: ExperienceCategory[] }[] = [
  { icon: '⛵', label: 'Boat Tours', categories: ['water_sports', 'day_trips'] },
  { icon: '🤿', label: 'Snorkel & Dive', categories: ['adventure', 'water_sports'] },
  { icon: '🏖', label: 'Beach & Relax', categories: ['beaches', 'wellness'] },
  { icon: '🍽', label: 'Food & Culture', categories: ['food', 'culture', 'nightlife'] },
];

/** The mockups' filter row. Each maps onto the PRD's twelve categories. */
const QUICK_FILTERS: { label: string; categories: ExperienceCategory[] }[] = [
  { label: 'All', categories: [] },
  { label: 'Activities', categories: ['adventure', 'water_sports', 'wellness', 'family'] },
  { label: 'Attractions', categories: ['waterfalls', 'beaches', 'culture'] },
  { label: 'Tours', categories: ['day_trips', 'transportation', 'shopping'] },
  { label: 'Food', categories: ['food', 'nightlife'] },
];

export default function Explore() {
  const { island, destination, loading: islandLoading } = useIsland();
  const { profile } = useSession();
  const { isSaved, toggle, requiresSignIn } = useSaved();

  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(hasCatalogue);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');

  const load = useCallback(async () => {
    if (!hasCatalogue || !island) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { items: rows, error: err } = await searchCatalogue({
      query: '',
      categories: [],
      sort: 'recommended',
      islandId: island.id,
      ...(destination ? { destinationId: destination.id } : {}),
    });
    setItems(rows);
    setError(err);
    setLoading(false);
  }, [island?.id, destination?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const active = QUICK_FILTERS.find((f) => f.label === filter) ?? QUICK_FILTERS[0]!;
  const visible = useMemo(
    () =>
      active.categories.length === 0
        ? items
        : items.filter((i) => active.categories.includes(i.category as ExperienceCategory)),
    [items, filter],
  );

  // Highest-rated first for "Recommended", so the section means something rather than being the
  // first rows of the same list under a different heading.
  const recommended = useMemo(
    () => [...visible].sort((a, b) => b.ratingAverage - a.ratingAverage).slice(0, 4),
    [visible],
  );
  const nearYou = visible[0] ?? null;
  const availableToday = useMemo(() => visible.slice(4, 10), [visible]);

  // Mockup screen 1 is the first thing a new arrival sees. A redirect rather than a navigation
  // effect, so it happens before Explore paints and there is no flash of the wrong screen.
  //
  // Placed after every hook on purpose: React requires the same hooks to run in the same order on
  // every render, and an early return above `useMemo` would break that the moment onboarding is
  // dismissed.
  if (!hasSeenOnboarding()) return <Redirect href="/welcome" />;

  const heroKey = island?.hero_media_path ?? null;
  const heroImage = demoImage(heroKey);
  const place = destination?.name ?? island?.name ?? '';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: semantic.background }}
      contentContainerStyle={{
        padding: spacing.lg,
        gap: spacing.lg,
        paddingBottom: TAB_BAR_CLEARANCE,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Greeting and current destination — the mockups' header. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Crest island={island?.name ?? null} size="sm" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ ...typography.caption, color: semantic.textMuted }}>
            {greeting()}
            {profile?.display_name ? `, ${profile.display_name}` : ''}
          </Text>
          <Pressable
            onPress={() => router.push('/select-destination')}
            accessibilityRole="button"
            accessibilityLabel={`Change destination. Currently ${place}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Text style={{ ...typography.title, color: semantic.textPrimary }}>{place}</Text>
            <Text style={{ fontSize: 14, color: semantic.textMuted }}>▾</Text>
          </Pressable>
        </View>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() =>
          router.push({ pathname: '/search', params: query ? { q: query } : {} })
        }
        returnKeyType="search"
        placeholder="What would you like to explore?"
        placeholderTextColor={semantic.textMuted}
        accessibilityLabel="Search experiences"
        style={{
          backgroundColor: semantic.surface,
          borderWidth: 1,
          borderColor: semantic.border,
          borderRadius: radius.pill,
          paddingVertical: spacing.sm + 4,
          paddingHorizontal: spacing.md,
          fontSize: typography.body.size,
          color: semantic.textPrimary,
        }}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {QUICK_FILTERS.map((f) => (
          <Chip
            key={f.label}
            label={f.label}
            selected={f.label === filter}
            onPress={() => setFilter(f.label)}
          />
        ))}
      </ScrollView>

      {!hasCatalogue ? (
        <Notice
          tone="alert"
          title="No backend configured"
          body="Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env. See docs/setup.md."
        />
      ) : null}

      {error ? (
        <Notice tone="alert" title="Could not load experiences" body={error} onRetry={load} />
      ) : null}

      {islandLoading || loading ? (
        <ActivityIndicator color={semantic.brandActive} style={{ marginTop: spacing.xl }} />
      ) : null}

      {!loading && hasCatalogue && visible.length === 0 && !error ? (
        <Notice
          tone="muted"
          title="Nothing here yet"
          body={
            filter === 'All'
              ? 'No approved experiences for this destination. Try another part of the island.'
              : `No ${filter.toLowerCase()} here. Try another filter or destination.`
          }
        />
      ) : null}

      {/* "Near You Now" — a dark hero over the island photograph. */}
      {!loading && nearYou ? (
        <Pressable
          onPress={() => router.push('/nearby')}
          accessibilityRole="button"
          accessibilityLabel="Near you now. Discover experiences nearby."
        >
          <View style={{ borderRadius: radius.lg, overflow: 'hidden' }}>
            {heroImage ? (
              <Photo source={heroImage} ratio={16 / 7} radius={0} />
            ) : (
              <View style={{ height: 150, backgroundColor: semantic.brand }} />
            )}
            <View
              style={{
                ...overlay,
                backgroundColor: 'rgba(7,58,50,0.55)',
                padding: spacing.lg,
                justifyContent: 'flex-end',
                gap: spacing.sm,
              }}
            >
              <Text style={{ ...typography.heading, color: semantic.textOnDark }}>
                Near You Now
              </Text>
              <Text style={{ ...typography.caption, color: semantic.textOnDark }}>
                Discover experiences close to you in {place}
              </Text>
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: radius.pill,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  alignSelf: 'flex-start',
                }}
              >
                <Text style={{ ...typography.caption, fontWeight: '700', color: semantic.brand }}>
                  View all
                </Text>
              </View>
            </View>
          </View>
        </Pressable>
      ) : null}

      {/* "Categories" — the Cayman mockup's icon tiles. */}
      {!loading && visible.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader title="Categories" onAction={() => router.push('/search')} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {CATEGORY_TILES.map((tile) => (
              <Pressable
                key={tile.label}
                onPress={() =>
                  router.push({
                    pathname: '/search',
                    params: { category: tile.categories[0] as string },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Browse ${tile.label}`}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  gap: 4,
                  paddingVertical: spacing.md,
                  backgroundColor: semantic.surface,
                  borderWidth: 1,
                  borderColor: semantic.border,
                  borderRadius: radius.md,
                }}
              >
                <Text style={{ fontSize: 22 }}>{tile.icon}</Text>
                <Text
                  numberOfLines={2}
                  style={{
                    ...typography.caption,
                    fontSize: 11,
                    textAlign: 'center',
                    color: semantic.textPrimary,
                  }}
                >
                  {tile.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* "Nearby Discoveries" — the wide card with a distance pill. */}
      {!loading && nearYou ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader title="Nearby Discoveries" onAction={() => router.push('/nearby')} />
          <ExperienceCard item={nearYou} variant="hero" />
        </View>
      ) : null}

      {/* "Recommended for You" — two-up cards. */}
      {recommended.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader
            title="Recommended for You"
            subtitle="Curated just for your vibe"
            onAction={() => router.push('/search')}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {recommended.map((item) => (
              <View key={item.id} style={{ width: '48%', flexGrow: 1 }}>
                <ExperienceCard
                  item={item}
                  variant="grid"
                  saved={isSaved(item.id)}
                  {...(requiresSignIn ? {} : { onToggleSave: () => void toggle(item.id) })}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* "Available Today" — a horizontal row of the rest. */}
      {availableToday.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader
            title="Available Today"
            subtitle="Book last-minute experiences"
            onAction={() => router.push('/search')}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
          >
            {availableToday.map((item) => (
              <View key={item.id} style={{ width: 190 }}>
                <ExperienceCard item={item} variant="grid" />
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Operating rule 9, once, at the foot of the screen the demo opens on. */}
      {!loading && visible.length > 0 ? (
        <Card>
          <Text style={{ ...typography.caption, color: semantic.textMuted }}>
            Every listing here is seeded demonstration content. Photographs are freely licensed and
            credited on each card; several show the right island rather than that exact operator.
          </Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const overlay = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function categoryLabel(category: ExperienceCategory | string): string {
  const labels: Record<string, string> = {
    waterfalls: 'Waterfalls',
    beaches: 'Beaches',
    adventure: 'Adventure',
    food: 'Food & drink',
    culture: 'Culture',
    nightlife: 'Nightlife',
    wellness: 'Wellness',
    transportation: 'Getting around',
    shopping: 'Shopping',
    family: 'Family',
    day_trips: 'Day trips',
    water_sports: 'On the water',
  };
  return labels[category] ?? category.replace(/_/g, ' ');
}

/** Kept for screens that still enumerate the full taxonomy (search filters). */
export const ALL_CATEGORIES = EXPERIENCE_CATEGORIES;
