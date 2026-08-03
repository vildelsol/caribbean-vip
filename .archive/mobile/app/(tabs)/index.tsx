import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { palette, radius, semantic, spacing, typography } from '@cvip/ui';
import { EXPERIENCE_CATEGORIES, type ExperienceCategory } from '@cvip/types';
import { hasCatalogue } from '../../lib/mode';
import { hasSeenOnboarding } from '../../lib/onboarding';
import { rankByInterest } from '../../lib/interests';
import { useIsland } from '../../lib/island';
import { useSession } from '../../lib/session';
import { useSaved } from '../../lib/saved';
import { searchCatalogue, type CatalogueItem } from '../../lib/catalogue';
import { ExperienceCard } from '../../components/ExperienceCard';
import { Notice } from '../../components/Notice';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  IrieStars,
  ListSkeleton,
  SearchField,
  SectionHeader,
  Skeleton,
  type IconName,
} from '../../components/kit';

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
const CATEGORY_TILES: {
  icon: IconName;
  label: string;
  categories: ExperienceCategory[];
  /** Gold rather than green, alternating down the row as the mockup does. */
  accent?: boolean;
}[] = [
  { icon: 'anchor', label: 'Boat Tours', categories: ['water_sports', 'day_trips'] },
  { icon: 'life-buoy', label: 'Snorkel & Dive', categories: ['adventure', 'water_sports'] },
  { icon: 'umbrella', label: 'Beach & Relax', categories: ['beaches', 'wellness'], accent: true },
  {
    icon: 'coffee',
    label: 'Food & Culture',
    categories: ['food', 'culture', 'nightlife'],
    accent: true,
  },
];

/**
 * The mockups' filter row. Each maps onto the PRD's twelve categories.
 *
 * Exported because Search draws the same row — the mockup uses one chip vocabulary across both
 * screens, and two copies would drift the moment a category is added.
 */
export const QUICK_FILTERS: { label: string; categories: ExperienceCategory[] }[] = [
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
  // first rows of the same list under a different heading — then anything matching an onboarding
  // interest floats to the top of that. Ranking, never filtering: nothing is hidden by a tile the
  // guest tapped on their first screen.
  const recommended = useMemo(
    () =>
      rankByInterest([...visible].sort((a, b) => b.ratingAverage - a.ratingAverage)).slice(0, 4),
    [visible],
  );
  const nearYou = visible[0] ?? null;

  /**
   * Whatever "Recommended" did not take.
   *
   * Derived by exclusion rather than by `slice(4, 10)`: Recommended sorts and ranks before it
   * slices, so a positional slice of the *unranked* list put the same experience in both sections
   * as soon as interest ranking moved anything. Two identical cards a screen apart reads as a bug
   * in the catalogue, not in the layout.
   */
  const availableToday = useMemo(() => {
    const taken = new Set(recommended.map((i) => i.id));
    return visible.filter((i) => !taken.has(i.id)).slice(0, 6);
  }, [visible, recommended]);

  // Mockup screen 1 is the first thing a new arrival sees. A redirect rather than a navigation
  // effect, so it happens before Explore paints and there is no flash of the wrong screen.
  //
  // Placed after every hook on purpose: React requires the same hooks to run in the same order on
  // every render, and an early return above `useMemo` would break that the moment onboarding is
  // dismissed.
  if (!hasSeenOnboarding()) return <Redirect href="/welcome" />;

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
      {/* Greeting and current destination — the mockup's header: a small muted line, the place
          name large in the display serif, and a bell on the right. No crest. The crest belongs to
          the welcome screen; repeating it at 60px beside the greeting shrank the one piece of
          brand furniture the design has into an illegible token. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 1 }}>
          {/* Irie's gold star leads the greeting, exactly as the mockup opens the screen. The
              concierge is present from the first line of the journey, not only on its own tab. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <IrieStars size={14} color={palette.gold} />
            <Text style={{ ...typography.caption, color: semantic.textMuted }}>
              {greeting()}
              {profile?.display_name ? `, ${profile.display_name}` : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/select-destination')}
            accessibilityRole="button"
            accessibilityLabel={`Change destination. Currently ${place}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            {/* Deep green, not ink — the mockup sets the destination in the brand colour, which
                is what makes it read as the one thing on the header you can change. */}
            <Text style={{ ...typography.display, fontSize: 29, color: semantic.brand }}>
              {place}
            </Text>
            <Icon name="chevron-down" size={19} color={semantic.brand} />
          </Pressable>
        </View>
        <Pressable
          onPress={() => router.push('/trips')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          style={{ paddingTop: 6 }}
        >
          <Icon name="bell" size={22} color={semantic.textPrimary} />
        </Pressable>
      </View>

      <SearchField
        value={query}
        onChangeText={setQuery}
        onSubmit={() => router.push({ pathname: '/search', params: query ? { q: query } : {} })}
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

{/* A skeleton in the shape of what is coming, not a centred spinner: the screen keeps
          its height and nothing jumps when the data lands. */}
      {islandLoading || loading ? (
        <View style={{ gap: spacing.lg }}>
          <Skeleton height={150} radius={radius.lg} />
          <ListSkeleton count={3} />
        </View>
      ) : null}

      {!loading && hasCatalogue && visible.length === 0 && !error ? (
        <EmptyState
          icon="compass"
          title="Nothing here yet"
          body={
            filter === 'All'
              ? 'No approved experiences for this destination yet. Try another part of the island.'
              : `No ${filter.toLowerCase()} here. Try another filter, or a different destination.`
          }
          {...(filter === 'All'
            ? { actionLabel: 'Change destination', onAction: () => router.push('/select-destination') }
            : { actionLabel: 'Show everything', onAction: () => setFilter('All') })}
        />
      ) : null}

      {/* "Nearby Discoveries" — the mockup's wide photo card, sitting directly under the search
          field. It used to come *after* Categories, behind a second near-identical "Near You Now"
          hero built from the same photograph. The mockup has one hero, here, and the duplicate is
          gone rather than restyled. */}
      {!loading && nearYou ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader title="Nearby Discoveries" onAction={() => router.push('/nearby')} />
          <ExperienceCard item={nearYou} variant="hero" />
        </View>
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
                style={{ flex: 1, alignItems: 'center', gap: 6 }}
              >
                {/* Mockup: a square sand tile holding a line icon, with the label *below* the
                    tile rather than inside it. The label sat inside a white card here, which is
                    why four two-word categories could not fit across a phone. */}
                <View
                  style={{
                    width: '100%',
                    aspectRatio: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: semantic.surfaceSunken,
                    borderWidth: 1,
                    borderColor: semantic.border,
                    borderRadius: radius.md,
                  }}
                >
                  {/* The mockup alternates the tile icons between deep green and gold rather than
                      running four of the same colour, which is what gives the row its rhythm. */}
                  <Icon
                    name={tile.icon}
                    size={26}
                    color={tile.accent ? palette.goldDeep : semantic.accent}
                  />
                </View>
                <Text
                  numberOfLines={2}
                  style={{
                    ...typography.caption,
                    fontSize: 12,
                    lineHeight: 16,
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

{/* "Recommended for You" — one card per line.
          Two 48%-wide cards side by side left a phone with two columns of clipped titles and
          thumbnails too small to read, so both of these lists are single column now. The row card
          gives each listing the full width for its title, rating and price. */}
      {recommended.length > 0 ? (
        <View style={{ gap: spacing.sm + 4 }}>
          <SectionHeader
            title="Recommended for You"
            subtitle="Curated just for your vibe"
            onAction={() => router.push('/search')}
          />
          {recommended.map((item) => (
            <ExperienceCard
              key={item.id}
              item={item}
              saved={isSaved(item.id)}
              {...(requiresSignIn ? {} : { onToggleSave: () => void toggle(item.id) })}
            />
          ))}
        </View>
      ) : null}

      {/* "Available Today" — also one per line, for the same reason. */}
      {availableToday.length > 0 ? (
        <View style={{ gap: spacing.sm + 4 }}>
          <SectionHeader
            title="Available Today"
            subtitle="Book last-minute experiences"
            onAction={() => router.push('/search')}
          />
          {availableToday.map((item) => (
            <ExperienceCard
              key={item.id}
              item={item}
              saved={isSaved(item.id)}
              {...(requiresSignIn ? {} : { onToggleSave: () => void toggle(item.id) })}
            />
          ))}
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
