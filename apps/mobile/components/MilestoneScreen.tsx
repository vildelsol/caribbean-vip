import { ScrollView, Text, View } from 'react-native';
import { semantic, spacing, radius, typography } from '@cvip/ui';
import { APP_BRAND, ISLAND_BRANDS } from '@cvip/types';

/**
 * M0 shell screen. Every tourist tab renders this until its milestone lands, so the navigation
 * is real and verifiable now without pretending any feature works (operating rule 5).
 */
export function MilestoneScreen({
  title,
  milestone,
  summary,
  requirements,
}: {
  title: string;
  milestone: string;
  summary: string;
  requirements: string[];
}) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: semantic.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
    >
      <Text style={{ ...typography.caption, color: semantic.textMuted }}>
        {APP_BRAND} · {ISLAND_BRANDS.JM}
      </Text>
      <Text style={{ ...typography.display, color: semantic.textPrimary }}>{title}</Text>
      <Text style={{ ...typography.body, color: semantic.textMuted }}>{summary}</Text>

      <View
        style={{
          backgroundColor: semantic.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: semantic.border,
          padding: spacing.md,
          gap: spacing.sm,
        }}
      >
        <Text style={{ ...typography.bodyStrong, color: semantic.brand }}>
          Arrives in {milestone}
        </Text>
        {requirements.map((r) => (
          <Text key={r} style={{ ...typography.caption, color: semantic.textMuted }}>
            • {r}
          </Text>
        ))}
      </View>

      <Text style={{ ...typography.caption, color: semantic.alert }}>
        Demo build — no live prices, availability or verified vendors.
      </Text>
    </ScrollView>
  );
}
