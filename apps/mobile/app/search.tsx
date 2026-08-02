import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import {
  EMPTY_FILTERS,
  EXPERIENCE_CATEGORIES,
  SORT_LABELS,
  SORT_OPTIONS,
  activeFilterCount,
  searchAndSort,
  type ExperienceCategory,
  type SearchFilters,
  type SortOption,
} from '@cvip/types';
import { isSupabaseConfigured } from '../lib/supabase';
import { useIsland } from '../lib/island';
import { useSaved } from '../lib/saved';
import { searchCatalogue, type CatalogueItem } from '../lib/catalogue';
import { ExperienceCard, formatFrom } from '../components/ExperienceCard';
import { Notice } from '../components/Notice';
import { categoryLabel } from './(tabs)/index';

/**
 * Search results with filters and sort — T-03.
 *
 * Filtering happens server-side (so a filtered search is not just the first page re-filtered),
 * while sorting happens client-side over the returned set. Sorting locally is safe — it cannot
 * reveal a row the server did not send — and it makes changing the sort instant.
 */
export default function Search() {
  const params = useLocalSearchParams<{ q?: string; category?: string }>();
  const { island, destination } = useIsland();
  const { isSaved, toggle, requiresSignIn } = useSaved();

  const [query, setQuery] = useState(params.q ?? '');
  const [submitted, setSubmitted] = useState(params.q ?? '');
  const [filters, setFilters] = useState<SearchFilters>({
    ...EMPTY_FILTERS,
    categories: params.category ? [params.category as ExperienceCategory] : [],
  });
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { items: rows, error: err } = await searchCatalogue({
      ...filters,
      query: submitted,
      ...(island ? { islandId: island.id } : {}),
      ...(filters.destinationId
        ? { destinationId: filters.destinationId }
        : destination
          ? { destinationId: destination.id }
          : {}),
    });
    setItems(rows);
    setError(err);
    setLoading(false);
  }, [
    submitted,
    filters.categories.join(','),
    filters.minPriceMinor,
    filters.maxPriceMinor,
    filters.maxDurationMinutes,
    filters.destinationId,
    island?.id,
    destination?.id,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sorting is applied over what the server returned; it can never widen the result set.
  const results = useMemo(
    () =>
      searchAndSort(
        items.map((i) => ({
          id: i.id,
          title: i.title,
          summary: i.summary,
          category: i.category as ExperienceCategory,
          fromAmountMinor: i.fromAmountMinor,
          durationMinutes: i.durationMinutes,
          destinationId: i.destinationId,
          islandId: i.islandId,
        })),
        { ...EMPTY_FILTERS, sort: filters.sort },
      ),
    [items, filters.sort],
  );

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const filterCount = activeFilterCount(filters);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: semantic.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      keyboardShouldPersistTaps="handled"
    >
      <TextInput
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => setSubmitted(query)}
        returnKeyType="search"
        autoFocus={!params.q && !params.category}
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

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Pressable
          onPress={() => setFiltersOpen((v) => !v)}
          accessibilityRole="button"
          style={chip(filterCount > 0)}
        >
          <Text style={{ ...typography.caption, color: semantic.accent }}>
            Filters{filterCount > 0 ? ` (${filterCount})` : ''}
          </Text>
        </Pressable>

        {filterCount > 0 ? (
          <Pressable
            onPress={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })}
            accessibilityRole="button"
            style={chip(false)}
          >
            <Text style={{ ...typography.caption, color: semantic.alert }}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {filtersOpen ? (
        <FilterPanel filters={filters} onChange={setFilters} />
      ) : null}

      <SortRow value={filters.sort} onChange={(sort) => setFilters({ ...filters, sort })} />

      {!isSupabaseConfigured ? (
        <Notice
          tone="alert"
          title="No backend configured"
          body="Search needs a Supabase connection. See docs/setup.md."
        />
      ) : null}

      {error ? <Notice tone="alert" title="Search failed" body={error} onRetry={load} /> : null}

      {loading ? <ActivityIndicator color={semantic.brandActive} /> : null}

      {!loading && !error && results.length === 0 ? (
        <Notice
          tone="muted"
          title="No matches"
          body={
            filterCount > 0
              ? 'Nothing matches all of these filters. Try removing one.'
              : 'Nothing matched that search. Try a different word.'
          }
          {...(filterCount > 0
            ? {
                action: {
                  label: 'Clear filters',
                  onPress: () => setFilters({ ...EMPTY_FILTERS, sort: filters.sort }),
                },
              }
            : {})}
        />
      ) : null}

      {!loading && results.length > 0 ? (
        <Text style={{ ...typography.caption, color: semantic.textMuted }}>
          {results.length} {results.length === 1 ? 'experience' : 'experiences'}
        </Text>
      ) : null}

      {results.map((r) => {
        const item = byId.get(r.id);
        if (!item) return null;
        return (
          <ExperienceCard
            key={item.id}
            item={item}
            saved={isSaved(item.id)}
            {...(requiresSignIn ? {} : { onToggleSave: () => void toggle(item.id) })}
          />
        );
      })}
    </ScrollView>
  );
}

function SortRow({
  value,
  onChange,
}: {
  value: SortOption;
  onChange: (s: SortOption) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
      {SORT_OPTIONS.filter((s) => s !== 'distance').map((s) => (
        <Pressable key={s} onPress={() => onChange(s)} accessibilityRole="button" style={chip(s === value)}>
          <Text
            style={{
              ...typography.caption,
              color: s === value ? semantic.textOnDark : semantic.textMuted,
            }}
          >
            {SORT_LABELS[s]}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function FilterPanel({
  filters,
  onChange,
}: {
  filters: SearchFilters;
  onChange: (f: SearchFilters) => void;
}) {
  const toggleCategory = (c: ExperienceCategory) => {
    const next = filters.categories.includes(c)
      ? filters.categories.filter((x) => x !== c)
      : [...filters.categories, c];
    onChange({ ...filters, categories: next });
  };

  const priceBands: { label: string; min?: number; max?: number }[] = [
    { label: 'Any price' },
    { label: `Under ${formatFrom(5000, 'USD')}`, max: 5000 },
    { label: `${formatFrom(5000, 'USD')}–${formatFrom(10000, 'USD')}`, min: 5000, max: 10000 },
    { label: `${formatFrom(10000, 'USD')}+`, min: 10000 },
  ];

  const durations: { label: string; max?: number }[] = [
    { label: 'Any length' },
    { label: 'Under 2 hours', max: 120 },
    { label: 'Half day', max: 300 },
    { label: 'Full day', max: 600 },
  ];

  return (
    <View
      style={{
        backgroundColor: semantic.surface,
        borderWidth: 1,
        borderColor: semantic.border,
        borderRadius: radius.lg,
        padding: spacing.md,
        gap: spacing.md,
      }}
    >
      <FilterGroup label="Category">
        {EXPERIENCE_CATEGORIES.map((c) => (
          <Pressable
            key={c}
            onPress={() => toggleCategory(c)}
            accessibilityRole="button"
            accessibilityState={{ selected: filters.categories.includes(c) }}
            style={chip(filters.categories.includes(c))}
          >
            <Text
              style={{
                ...typography.caption,
                color: filters.categories.includes(c) ? semantic.textOnDark : semantic.textMuted,
              }}
            >
              {categoryLabel(c)}
            </Text>
          </Pressable>
        ))}
      </FilterGroup>

      <FilterGroup label="Price">
        {priceBands.map((b) => {
          const selected = filters.minPriceMinor === b.min && filters.maxPriceMinor === b.max;
          return (
            <Pressable
              key={b.label}
              onPress={() => {
                const next = { ...filters };
                if (b.min === undefined) delete next.minPriceMinor;
                else next.minPriceMinor = b.min;
                if (b.max === undefined) delete next.maxPriceMinor;
                else next.maxPriceMinor = b.max;
                onChange(next);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={chip(selected)}
            >
              <Text
                style={{
                  ...typography.caption,
                  color: selected ? semantic.textOnDark : semantic.textMuted,
                }}
              >
                {b.label}
              </Text>
            </Pressable>
          );
        })}
      </FilterGroup>

      <FilterGroup label="Duration">
        {durations.map((d) => {
          const selected = filters.maxDurationMinutes === d.max;
          return (
            <Pressable
              key={d.label}
              onPress={() => {
                const next = { ...filters };
                if (d.max === undefined) delete next.maxDurationMinutes;
                else next.maxDurationMinutes = d.max;
                onChange(next);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={chip(selected)}
            >
              <Text
                style={{
                  ...typography.caption,
                  color: selected ? semantic.textOnDark : semantic.textMuted,
                }}
              >
                {d.label}
              </Text>
            </Pressable>
          );
        })}
      </FilterGroup>
    </View>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>
    </View>
  );
}

function chip(selected: boolean) {
  return {
    backgroundColor: selected ? semantic.brandActive : semantic.surface,
    borderWidth: 1,
    borderColor: selected ? semantic.brandActive : semantic.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  } as const;
}
