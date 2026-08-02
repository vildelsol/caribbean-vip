import { Image, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import { formatDistance } from '@cvip/types';
import type { CatalogueItem } from '../lib/catalogue';
import { demoImage, demoImageCredit, demoMediaCredit } from '../lib/demoMedia';

/**
 * One listing in a list or search result.
 *
 * `isDemo` is rendered wherever a listing appears, not just on the detail page — operating rule 9
 * forbids presenting seeded content as live, and a card in a screenshot is exactly where that
 * would go wrong.
 */
export function ExperienceCard({
  item,
  distanceMetres,
  saved,
  onToggleSave,
}: {
  item: CatalogueItem;
  distanceMetres?: number | undefined;
  saved?: boolean;
  onToggleSave?: () => void;
}) {
  const hero = demoImage(item.heroMediaKey);
  const heroCredit = demoImageCredit(item.heroMediaKey);
  const heroAlt = demoMediaCredit(item.heroMediaKey ?? '')?.subject;

  return (
    <Link href={{ pathname: '/experience/[id]', params: { id: item.id } }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, from ${formatFrom(item.fromAmountMinor, item.currency)}`}
        style={{
          backgroundColor: semantic.surface,
          borderWidth: 1,
          borderColor: semantic.border,
          borderRadius: radius.lg,
          overflow: 'hidden',
        }}
      >
        {hero ? (
          <View style={heroFrame}>
            <Image
              source={hero}
              // Fills the 16:9 frame above rather than carrying the ratio itself. A bundled asset
              // has intrinsic dimensions, and react-native-web writes those onto the element as a
              // pixel height that beats `aspectRatio` — so a 1400×930 photo rendered a 930px-tall
              // card. Sizing the frame and filling it behaves the same on web and native.
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
              accessible
              accessibilityRole="image"
              {...(heroAlt ? { accessibilityLabel: heroAlt } : {})}
            />
            {heroCredit ? (
              // CC BY / CC BY-SA require credit wherever the work appears, and a card in a
              // screenshot is exactly where that gets forgotten.
              <Text
                numberOfLines={1}
                style={{
                  ...typography.caption,
                  fontSize: 11,
                  color: semantic.textOnDark,
                  backgroundColor: 'rgba(7,58,50,0.62)',
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 2,
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                }}
              >
                {heroCredit}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={{ padding: spacing.md, gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
          <Text style={{ ...typography.caption, color: semantic.accent, flex: 1 }}>
            {item.category.replace(/_/g, ' ')}
          </Text>
          {onToggleSave ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onToggleSave();
              }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={saved ? 'Remove from saved' : 'Save this experience'}
            >
              <Text style={{ fontSize: 20, color: saved ? semantic.premium : semantic.textMuted }}>
                {saved ? '★' : '☆'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={{ ...typography.heading, color: semantic.textPrimary }}>{item.title}</Text>

        {item.summary ? (
          <Text style={{ ...typography.body, color: semantic.textMuted }} numberOfLines={2}>
            {item.summary}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
          <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
            from {formatFrom(item.fromAmountMinor, item.currency)}
          </Text>
          <Text style={{ ...typography.caption, color: semantic.textMuted }}>
            {formatDuration(item.durationMinutes)}
          </Text>
          {distanceMetres !== undefined ? (
            <Text style={{ ...typography.caption, color: semantic.accent }}>
              {formatDistance(distanceMetres)}
            </Text>
          ) : null}
        </View>

        {item.isDemo ? (
          <Text style={{ ...typography.caption, color: semantic.alert }}>
            Demo listing — not live pricing or availability
          </Text>
        ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

/** 16:9 frame for a bundled photo. See the comment on the Image inside it. */
const heroFrame = {
  width: '100%',
  aspectRatio: 16 / 9,
  backgroundColor: semantic.surfaceSunken,
} as const;

export function formatFrom(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}
