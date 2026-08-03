import { Image, Pressable, Text, View, type ImageSourcePropType } from 'react-native';
import { palette, radius, semantic, spacing, typography } from '@cvip/ui';

/**
 * The UI kit the mockups describe.
 *
 * Everything the customer-journey mockups repeat — the wordmark, pill chips, rating rows, status
 * badges, stat tiles, section headers and the two button weights — lives here rather than being
 * re-typed per screen. That is what stops six screens drifting into six slightly different card
 * styles, which is the specific failure the mockups' own "consistent bottom navigation / better
 * hierarchy and spacing" notes call out.
 *
 * Colours come only from `semantic`/`palette` (PRD §16), never from literals, so the contrast
 * tests in `@cvip/ui` still govern what is readable outdoors.
 */

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------

/**
 * The Caribbean VIP wordmark: script "Caribbean" over a heavy gold "VIP".
 *
 * Drawn in type rather than shipped as an image so it stays crisp at any size, recolours for dark
 * and light backgrounds, and adds nothing to the bundle. PRD §3: the product is always "Caribbean
 * VIP" — the island only ever changes the sub-brand, never this.
 */
export function Wordmark({
  size = 'md',
  onDark = false,
}: {
  size?: 'sm' | 'md' | 'lg';
  onDark?: boolean;
}) {
  const scale = size === 'lg' ? 1.6 : size === 'sm' ? 0.62 : 1;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="Caribbean VIP">
      <Text
        style={{
          fontSize: 34 * scale,
          lineHeight: 40 * scale,
          fontStyle: 'italic',
          fontWeight: '600',
          color: onDark ? '#FFFFFF' : palette.green900,
        }}
      >
        Caribbean
      </Text>
      <Text
        style={{
          fontSize: 30 * scale,
          lineHeight: 34 * scale,
          fontWeight: '800',
          letterSpacing: 3 * scale,
          color: palette.gold,
          marginTop: -4 * scale,
        }}
      >
        VIP
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export function PrimaryButton({
  label,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={{
        backgroundColor: disabled ? semantic.surfaceSunken : semantic.brand,
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
        // 48pt tall: the mockups' primary actions are full-width and thumb-sized, and PRD §16 wants
        // this usable one-handed outdoors.
        minHeight: 52,
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          ...typography.bodyStrong,
          color: disabled ? semantic.textMuted : semantic.textOnDark,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  onDark = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  onDark?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={{
        backgroundColor: onDark ? '#FFFFFF' : semantic.surface,
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: onDark ? 'transparent' : semantic.border,
        minHeight: 52,
        justifyContent: 'center',
      }}
    >
      <Text style={{ ...typography.bodyStrong, color: palette.green900 }}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Chips, badges, ratings
// ---------------------------------------------------------------------------

/** The All / Activities / Attractions / Tours filter row. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!selected }}
      style={{
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        backgroundColor: selected ? semantic.brand : semantic.surface,
        borderWidth: 1,
        borderColor: selected ? semantic.brand : semantic.border,
      }}
    >
      <Text
        style={{
          ...typography.caption,
          fontWeight: selected ? '600' : '400',
          color: selected ? semantic.textOnDark : semantic.textPrimary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export type BadgeTone = 'info' | 'success' | 'offer' | 'pending';

/** Small status pill — "Confirmed", "Family Friendly", "Free Rum Punch Today", "8 min away". */
export function Badge({ label, tone = 'info' }: { label: string; tone?: BadgeTone }) {
  const tones: Record<BadgeTone, { bg: string; fg: string }> = {
    info: { bg: palette.sandDeep, fg: palette.inkMuted },
    success: { bg: '#E3F1EA', fg: palette.success },
    offer: { bg: '#FBEFD9', fg: palette.goldDeep },
    pending: { bg: '#FAEEE6', fg: palette.warning },
  };
  const { bg, fg } = tones[tone];
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingVertical: 4,
        paddingHorizontal: spacing.sm + 2,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ ...typography.caption, fontSize: 12, fontWeight: '600', color: fg }}>
        {label}
      </Text>
    </View>
  );
}

/** "★ 4.8 (1,285)" — the rating treatment used on every card in the mockups. */
export function Rating({
  average,
  count,
  showCount = true,
  compact = false,
}: {
  average: number;
  count: number;
  showCount?: boolean;
  compact?: boolean;
}) {
  if (average <= 0) return null;
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
      accessible
      accessibilityLabel={`Rated ${average} out of 5 from ${count} reviews`}
    >
      <Text style={{ fontSize: compact ? 13 : 15, color: palette.gold }}>★</Text>
      <Text
        style={{
          ...typography.caption,
          fontSize: compact ? 13 : 14,
          fontWeight: '700',
          color: semantic.textPrimary,
        }}
      >
        {average.toFixed(1)}
      </Text>
      {showCount ? (
        <Text style={{ ...typography.caption, fontSize: compact ? 12 : 13, color: semantic.textMuted }}>
          ({formatCount(count)})
        </Text>
      ) : null}
    </View>
  );
}

/** 1285 → "1.3k". The mockups shorten large review counts rather than wrapping the line. */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

/** "Recommended for You / Curated just for your vibe        View all" */
export function SectionHeader({
  title,
  subtitle,
  actionLabel = 'View all',
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ ...typography.heading, color: semantic.textPrimary }}>{title}</Text>
        {subtitle ? (
          <Text style={{ ...typography.caption, color: semantic.textMuted }}>{subtitle}</Text>
        ) : null}
      </View>
      {onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text style={{ ...typography.caption, fontWeight: '600', color: semantic.accent }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** One of the three facts under the title on the detail page: Duration / Entry / Hotel Pickup. */
export function StatTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.sm }}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text
        style={{ ...typography.caption, fontSize: 13, fontWeight: '600', color: semantic.textPrimary }}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text style={{ ...typography.caption, fontSize: 12, color: semantic.textMuted }}>{label}</Text>
    </View>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: semantic.surface,
        borderWidth: 1,
        borderColor: semantic.border,
        borderRadius: radius.md,
      }}
    >
      {children}
    </View>
  );
}

/**
 * A photo in a fixed ratio frame.
 *
 * The frame carries the ratio and the image fills it: a bundled asset has intrinsic dimensions and
 * react-native-web writes those onto the element as a pixel height that beats `aspectRatio`, which
 * once rendered a 1400×930 photo as a 930px-tall card.
 */
export function Photo({
  source,
  ratio = 16 / 9,
  radius: r = radius.md,
  height,
  accessibilityLabel,
}: {
  source: ImageSourcePropType;
  ratio?: number;
  radius?: number;
  height?: number;
  accessibilityLabel?: string;
}) {
  return (
    <View
      style={{
        width: '100%',
        ...(height ? { height } : { aspectRatio: ratio }),
        borderRadius: r,
        overflow: 'hidden',
        backgroundColor: semantic.surfaceSunken,
      }}
    >
      <Image
        source={source}
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
        {...(accessibilityLabel
          ? { accessible: true, accessibilityLabel }
          : { accessible: false })}
      />
    </View>
  );
}

/** The white rounded surface every card in the mockups sits on. */
export function Card({
  children,
  padded = true,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  padded?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const style = {
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radius.lg,
    overflow: 'hidden' as const,
    ...(padded ? { padding: spacing.md } : {}),
  };

  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      style={style}
    >
      {children}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** "$59 USD" — the mockups always name the currency rather than leaving a bare $. */
export function formatUsd(minor: number, withCode = true): string {
  const major = minor / 100;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: major % 1 === 0 ? 0 : 2,
  }).format(major);
  return withCode ? `${formatted} USD` : formatted;
}

/**
 * "≈ JAM $11,700" — the indicative local figure the mockups show beside the USD total.
 *
 * OD-09 is "display localized, settle in USD", so this is display only and is always prefixed with
 * an approximation sign. Returns null for an island that settles in USD anyway, because "≈ USD $75"
 * beside "$75 USD" is noise.
 */
export function formatLocalApprox(
  minor: number,
  currency: string,
  perUsd: number,
): string | null {
  if (currency === 'USD' || !perUsd || perUsd === 1) return null;
  const local = (minor / 100) * perUsd;
  const rounded = local >= 100 ? Math.round(local / 10) * 10 : Math.round(local);
  const symbolByCurrency: Record<string, string> = { JMD: 'JAM $', KYD: 'CI $', BBD: 'BDS $' };
  const symbol = symbolByCurrency[currency] ?? `${currency} `;
  return `≈ ${symbol}${new Intl.NumberFormat('en-US').format(rounded)}`;
}
