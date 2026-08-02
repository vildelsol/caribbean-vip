import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Link, router } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import { EXPERIENCE_CATEGORIES, type ExperienceCategory } from '@cvip/types';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useIsland } from '../../lib/island';
import { useSession } from '../../lib/session';
import { useSaved } from '../../lib/saved';
import { searchCatalogue, type CatalogueItem } from '../../lib/catalogue';
import { ExperienceCard } from '../../components/ExperienceCard';
import { Notice } from '../../components/Notice';

/**
 * Explore — destination-aware home. T-01, T-02, T-03.
 *
 * Sections are built from the same RLS-governed catalogue query rather than a curated table, so
 * nothing here can surface a listing that is not publicly visible. No query in this file filters
 * on approval status: that is the database's job (AD-10), and the negative tests prove it.
 */
export default function Explore() {
  const { islandBrand, island, destination, loading: islandLoading } = useIsland();
  const { state } = useSession();
  const { isSaved, toggle, requiresSignIn } = useSaved();

  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !island) {
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

  useEffect(() => {
    void load();
  }, [load]);

  const submitSearch = () => {
    router.push({ pathname: '/search', params: query ? { q: query } : {} });
  };

  const featured = items.slice(0, 5);
  const byCategory = groupByCategory(items);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: semantic.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: spacing.xs }}>
        <Text style={{ ...typography.caption, color: semantic.textMuted }}>
          {islandBrand}
          {state === 'guest' ? ' · browsing as a guest' : ''}
        </Text>
        <Text style={{ ...typography.display, color: semantic.textPrimary }}>
          {destination ? destination.name : (island?.name ?? 'Explore')}
        </Text>
        {destination?.editorial_content ? (
          <Text style={{ ...typography.body, color: semantic.textMuted }}>
            {destination.editorial_content}
          </Text>
        ) : null}
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={submitSearch}
        returnKeyType="search"
        placeholder="Search experiences, tours, locations"
        placeholderTextColor={semantic.textMuted}
        accessibilityLabel="Search experiences"
        style={{
          backgroundColor: semantic.surface,
          borderWidth: 1,
          borderColor: semantic.border,
          borderRadius: radius.pill,
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.md,
          fontSize: typography.body.size,
          color: semantic.textPrimary,
        }}
      />

      <Link href="/select-destination" asChild>
        <Pressable style={chipStyle} accessibilityRole="button">
          <Text style={{ ...typography.caption, color: semantic.accent }}>
            {destination ? `${destination.name} · change` : 'Choose a destination'}
          </Text>
        </Pressable>
      </Link>

      {!isSupabaseConfigured ? (
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

      {!loading && isSupabaseConfigured && items.length === 0 && !error ? (
        <Notice
          tone="muted"
          title="Nothing here yet"
          body="No approved experiences for this destination. Try another part of the island."
        />
      ) : null}

      {featured.length > 0 ? (
        <Section title="Recommended for you" onSeeAll={() => router.push('/search')}>
          {featured.map((item) => (
            <ExperienceCard
              key={item.id}
              item={item}
              saved={isSaved(item.id)}
              {...(requiresSignIn ? {} : { onToggleSave: () => void toggle(item.id) })}
            />
          ))}
        </Section>
      ) : null}

      {Object.entries(byCategory).map(([category, group]) =>
        group.length === 0 ? null : (
          <Section
            key={category}
            title={categoryLabel(category as ExperienceCategory)}
            onSeeAll={() =>
              router.push({ pathname: '/search', params: { category } })
            }
          >
            {group.slice(0, 3).map((item) => (
              <ExperienceCard
                key={item.id}
                item={item}
                saved={isSaved(item.id)}
                {...(requiresSignIn ? {} : { onToggleSave: () => void toggle(item.id) })}
              />
            ))}
          </Section>
        ),
      )}
    </ScrollView>
  );
}

function Section({
  title,
  onSeeAll,
  children,
}: {
  title: string;
  onSeeAll?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={{ ...typography.heading, color: semantic.textPrimary, flex: 1 }}>{title}</Text>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} hitSlop={8} accessibilityRole="button">
            <Text style={{ ...typography.caption, color: semantic.accent }}>See all</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function groupByCategory(items: CatalogueItem[]): Record<string, CatalogueItem[]> {
  const out: Record<string, CatalogueItem[]> = {};
  for (const c of EXPERIENCE_CATEGORIES) out[c] = [];
  for (const item of items) {
    const bucket = out[item.category];
    if (bucket) bucket.push(item);
  }
  // Drop empty categories so the home screen shows only what this destination actually offers.
  for (const key of Object.keys(out)) {
    if ((out[key] ?? []).length === 0) delete out[key];
  }
  return out;
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

const chipStyle = {
  backgroundColor: semantic.surface,
  borderWidth: 1,
  borderColor: semantic.border,
  borderRadius: radius.pill,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  alignSelf: 'flex-start',
} as const;
