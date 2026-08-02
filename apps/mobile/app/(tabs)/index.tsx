import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import type { ExperienceRow } from '@cvip/supabase';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useIsland } from '../../lib/island';
import { useSession } from '../../lib/session';

/**
 * Explore — the destination-aware home. T-01, T-02, T-03.
 *
 * The query below asks only for the island and destination in play. It does NOT filter on
 * `status = 'approved'`, and that is deliberate: the RLS policy already guarantees it (AD-10), so
 * the negative RLS tests — not this component — are what prove T-03. If the policy ever regressed,
 * a database test would fail before a draft listing could reach a screen.
 */
export default function Explore() {
  const { islandBrand, island, destination, loading: islandLoading } = useIsland();
  const { state } = useSession();
  const [items, setItems] = useState<ExperienceRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !island) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);

    void (async () => {
      let q = supabase.from('experiences').select('*').eq('island_id', island.id).limit(40);
      if (destination) q = q.eq('destination_id', destination.id);

      const { data, error: err } = await q;
      if (!active) return;
      setError(err?.message ?? null);
      setItems(data ?? []);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [island?.id, destination?.id]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: semantic.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
    >
      <Text style={{ ...typography.caption, color: semantic.textMuted }}>
        {islandBrand}
        {state === 'guest' ? ' · browsing as a guest' : ''}
      </Text>
      <Text style={{ ...typography.display, color: semantic.textPrimary }}>
        {destination ? destination.name : (island?.name ?? 'Explore')}
      </Text>

      <Link href="/select-destination" asChild>
        <Pressable
          style={{
            backgroundColor: semantic.surface,
            borderWidth: 1,
            borderColor: semantic.border,
            borderRadius: radius.pill,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            alignSelf: 'flex-start',
          }}
        >
          <Text style={{ ...typography.caption, color: semantic.accent }}>
            Change island or destination
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

      {error ? <Notice tone="alert" title="Could not load experiences" body={error} /> : null}

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

      {items.map((e) => (
        <View
          key={e.id}
          style={{
            backgroundColor: semantic.surface,
            borderWidth: 1,
            borderColor: semantic.border,
            borderRadius: radius.lg,
            padding: spacing.md,
            gap: spacing.xs,
          }}
        >
          <Text style={{ ...typography.caption, color: semantic.accent }}>
            {e.category.replace(/_/g, ' ')}
          </Text>
          <Text style={{ ...typography.heading, color: semantic.textPrimary }}>{e.title}</Text>
          {e.summary ? (
            <Text style={{ ...typography.body, color: semantic.textMuted }}>{e.summary}</Text>
          ) : null}
          <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
            from {formatFrom(e.from_amount_minor, e.currency)} · {e.duration_minutes} min
          </Text>
          {/* Operating rule 9: demo content is labelled wherever it is displayed. */}
          {e.is_demo ? (
            <Text style={{ ...typography.caption, color: semantic.alert }}>
              Demo listing — not live pricing or availability
            </Text>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function formatFrom(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
}

function Notice({ tone, title, body }: { tone: 'alert' | 'muted'; title: string; body: string }) {
  const color = tone === 'alert' ? semantic.alert : semantic.textMuted;
  return (
    <View
      style={{
        backgroundColor: semantic.surfaceSunken,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.xs,
      }}
    >
      <Text style={{ ...typography.bodyStrong, color }}>{title}</Text>
      <Text style={{ ...typography.caption, color: semantic.textMuted }}>{body}</Text>
    </View>
  );
}
