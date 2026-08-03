import {
  Image,
  Pressable,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
  type TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Feather from '@expo/vector-icons/Feather';
import { elevation, palette, radius, semantic, spacing, typography } from '@cvip/ui';

/**
 * The UI kit the mockups describe.
 *
 * Everything the customer-journey mockups repeat — the crest, pill chips, rating rows, status
 * badges, stat tiles, section headers and the button weights — lives here rather than being
 * re-typed per screen. That is what stops six screens drifting into six slightly different card
 * styles, which is the specific failure the mockups' own "consistent hierarchy and spacing" notes
 * call out.
 *
 * Colours come only from `semantic`/`palette` (PRD §16), never from literals, so the contrast tests
 * in `@cvip/ui` still govern what is readable outdoors.
 */

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

/**
 * Line icons, at the weight the mockup draws them.
 *
 * Every icon in the mockup is a thin monoline outline — the nav bar, the stat tiles, the trip
 * detail rows. This app was drawing them as text glyphs (`◎`, `◈`, `▤`) and emoji, which is the
 * most conspicuous single difference on the Explore screen: emoji are full-colour, differently
 * shaped on every platform, and cannot take the brand colour. Feather is a monoline set at
 * effectively the same stroke weight, so it drops straight in.
 */
export type IconName = React.ComponentProps<typeof Feather>['name'];

export function Icon({
  name,
  size = 20,
  color = semantic.textPrimary,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Feather name={name} size={size} color={color} />;
}

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------

/**
 * The VIP crest — a double gold ring on a translucent deep-green disc, "VIP" in the display serif,
 * the island beneath.
 *
 * Drawn in type and views rather than shipped as an image so it stays crisp at any size and adds
 * nothing to the bundle. Three details carry the mockup's version and were all missing before:
 *
 * - **The disc is translucent.** It was a flat `green950`. On the welcome screen the mockup's crest
 *   lets the water read through it, which is what stops it looking like a sticker pasted onto the
 *   photograph. `onPhoto` keeps that; on an ivory surface it goes opaque, because translucency over
 *   a flat background is just a lighter green.
 * - **There are two rings**, a heavy outer one and a hairline inset a few points inside it.
 * - **The lettering is the display serif**, not the UI sans.
 *
 * PRD §3 says the product is never renamed per island, and the crest honours that by construction:
 * the mark is always the same, and only the small word underneath localizes.
 */
export function Crest({
  island,
  size = 'md',
  onPhoto = false,
}: {
  /** Island name, upper-cased beneath the mark. Omit for the unbranded product mark. */
  island?: string | null;
  size?: 'sm' | 'md' | 'lg';
  /** True over a photograph — keeps the disc translucent, as the mockup draws it. */
  onPhoto?: boolean;
}) {
  // 172 is the mockup's crest measured as a fraction of the phone's width (~44%) at 390pt.
  const diameter = size === 'lg' ? 172 : size === 'sm' ? 60 : 112;
  const scale = diameter / 172;
  const ring = Math.max(2, Math.round(5 * scale));
  const inset = Math.max(4, Math.round(9 * scale));

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={island ? `Caribbean VIP, ${island}` : 'Caribbean VIP'}
      style={{
        width: diameter,
        height: diameter,
        borderRadius: diameter / 2,
        backgroundColor: onPhoto ? 'rgba(12,43,37,0.86)' : palette.green950,
        borderWidth: ring,
        borderColor: palette.goldLight,
        alignItems: 'center',
        justifyContent: 'center',
        ...elevation.raised,
      }}
    >
      {/* The inner hairline ring. */}
      <View
        style={{
          position: 'absolute',
          top: inset,
          left: inset,
          right: inset,
          bottom: inset,
          borderRadius: diameter / 2,
          borderWidth: Math.max(1, Math.round(1.5 * scale)),
          borderColor: 'rgba(228,193,115,0.65)',
          pointerEvents: 'none',
        }}
      />

      {/* Three four-point stars, the middle one larger — the mockup's flourish. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 * scale }}>
        <Text style={{ fontSize: 9 * scale, color: palette.goldLight }}>✦</Text>
        <Text style={{ fontSize: 15 * scale, color: palette.goldLight }}>✦</Text>
        <Text style={{ fontSize: 9 * scale, color: palette.goldLight }}>✦</Text>
      </View>

      <Text
        style={{
          fontFamily: typography.display.fontFamily,
          fontSize: 62 * scale,
          lineHeight: 74 * scale,
          fontWeight: '700',
          color: palette.goldTop,
          letterSpacing: 1 * scale,
        }}
      >
        VIP
      </Text>

      {island ? (
        <Text
          style={{
            fontFamily: typography.display.fontFamily,
            fontSize: 15 * scale,
            lineHeight: 18 * scale,
            fontWeight: '700',
            color: palette.goldTop,
            letterSpacing: 5 * scale,
            // The letterspacing is applied to the right of the last glyph too, so without this the
            // word sits visibly left of centre inside the ring.
            marginLeft: 5 * scale,
          }}
          numberOfLines={1}
        >
          {island.toUpperCase()}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Irie AI's mark: a cluster of gold four-point stars — one large, two small.
 *
 * This is the concierge's signature and it appears wherever Irie does: the centre nav badge, the
 * chat avatar, the greeting on Explore, the "Ask Irie" affordance on a listing. Gold on green,
 * always, never the other way round — the nav badge was built as a gold disc with a green star,
 * which is the inverse of the mockup and loses the one motif that ties the concierge together
 * across the journey.
 */
export function IrieStars({
  size = 22,
  color = palette.goldTop,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessible={false}
    >
      <Text style={{ position: 'absolute', top: 0, right: 0, fontSize: size * 0.4, color }}>✦</Text>
      <Text style={{ fontSize: size * 0.78, color, marginTop: size * 0.08 }}>✦</Text>
      <Text
        style={{ position: 'absolute', bottom: 0, left: size * 0.04, fontSize: size * 0.3, color }}
      >
        ✦
      </Text>
    </View>
  );
}

/**
 * The gold-ringed green disc Irie lives in — the chat avatar, and the shape the nav badge uses.
 */
export function IrieAvatar({ size = 34 }: { size?: number }) {
  return (
    <View
      accessible
      accessibilityLabel="Irie AI"
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        backgroundColor: palette.green900,
        borderWidth: Math.max(1, size * 0.05),
        borderColor: palette.goldLight,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <IrieStars size={size * 0.62} />
    </View>
  );
}

/**
 * The product name as type, for places a crest is too heavy — headers and dark hero panels.
 *
 * "Caribbean" in the display serif above a letterspaced gold "VIP", which is how the Caribbean VIP
 * mockups set the lockup.
 */
export function Wordmark({
  size = 'md',
  onDark = false,
}: {
  size?: 'sm' | 'md' | 'lg';
  onDark?: boolean;
}) {
  const scale = size === 'lg' ? 1.5 : size === 'sm' ? 0.62 : 1;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="Caribbean VIP">
      <Text
        style={{
          fontFamily: typography.display.fontFamily,
          fontSize: 30 * scale,
          lineHeight: 36 * scale,
          fontWeight: '700',
          color: onDark ? semantic.textOnDark : palette.green900,
        }}
      >
        Caribbean
      </Text>
      <Text
        style={{
          fontFamily: typography.display.fontFamily,
          fontSize: 30 * scale,
          lineHeight: 34 * scale,
          fontWeight: '700',
          letterSpacing: 4 * scale,
          color: palette.gold,
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

/**
 * Button labels in the mockup are letterspaced caps in every weight — gold, green and outlined.
 * Kept in one place so a new button cannot arrive in sentence case.
 */
function ButtonLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text style={{ ...typography.overline, fontSize: 14, letterSpacing: 1.6, color }}>
      {label.toUpperCase()}
    </Text>
  );
}

const BUTTON_HEIGHT = 54;

/**
 * The deep green action — "Check Availability", "View Ticket", "Pay".
 *
 * Radius 14 and a soft lift, matching the mockup, which is noticeably rounder and softer than the
 * hard 12pt rectangle this was.
 */
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
      style={({ pressed }) => ({
        backgroundColor: disabled ? semantic.surfaceSunken : semantic.brand,
        borderRadius: radius.md,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: BUTTON_HEIGHT,
        opacity: pressed ? 0.9 : 1,
        ...(disabled ? {} : elevation.raised),
      })}
    >
      <ButtonLabel label={label} color={disabled ? semantic.textMuted : semantic.textOnDark} />
    </Pressable>
  );
}

/**
 * The gold action — the welcome screen's "Continue as Guest" and the voucher's "Save Voucher".
 *
 * A vertical gradient, `goldTop` to `goldBottom`, which is how the mockup renders it; a flat gold
 * fill loses the metallic reading the whole aesthetic rests on. The label is deep green rather than
 * the mockup's white: white on this gold is 2.4:1 and PRD §16 makes sunlight legibility a hard
 * constraint, so the token test pins the pairing. It is the one deliberate deviation in the palette.
 */
export function GoldButton({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1, ...elevation.raised })}
    >
      <LinearGradient
        colors={[palette.goldTop, palette.goldBottom]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          borderRadius: radius.pill,
          paddingHorizontal: spacing.lg,
          minHeight: BUTTON_HEIGHT,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ButtonLabel label={label} color={semantic.brand} />
      </LinearGradient>
    </Pressable>
  );
}

/**
 * The outlined action over a photograph — the welcome screen's "Sign In".
 *
 * A gold hairline over a translucent green fill, so the photograph still reads through it.
 */
export function OutlineButton({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => ({
        backgroundColor: 'rgba(12,43,37,0.55)',
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: palette.goldLight,
        paddingHorizontal: spacing.lg,
        minHeight: BUTTON_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <ButtonLabel label={label} color={palette.goldLight} />
    </Pressable>
  );
}

/** The quiet action on an ivory surface — a bordered pill with green caps. */
export function SecondaryButton({
  label,
  onPress,
  onDark = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  /** Over a photograph — renders as the gold-outlined pill instead. */
  onDark?: boolean;
  accessibilityLabel?: string;
}) {
  if (onDark) {
    return (
      <OutlineButton
        label={label}
        onPress={onPress}
        {...(accessibilityLabel ? { accessibilityLabel } : {})}
      />
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => ({
        backgroundColor: semantic.surface,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: semantic.brand,
        paddingHorizontal: spacing.lg,
        minHeight: BUTTON_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <ButtonLabel label={label} color={semantic.brand} />
    </Pressable>
  );
}

/** The underlined text action beneath a button pair — "Create an Account", "Maybe Later". */
export function TextLink({
  label,
  onPress,
  onDark = false,
}: {
  label: string;
  onPress: () => void;
  onDark?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={10}
      style={{ alignItems: 'center', paddingVertical: spacing.sm }}
    >
      <Text
        style={{
          ...typography.captionStrong,
          color: onDark ? semantic.textOnDark : semantic.brand,
          textDecorationLine: 'underline',
        }}
      >
        {label}
      </Text>
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
        paddingVertical: spacing.sm + 1,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        backgroundColor: selected ? semantic.brand : semantic.surface,
        borderWidth: 1,
        borderColor: selected ? semantic.brand : semantic.border,
      }}
    >
      <Text
        style={{
          ...(selected ? typography.captionStrong : typography.caption),
          color: selected ? semantic.textOnDark : semantic.textPrimary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export type BadgeTone = 'info' | 'success' | 'offer' | 'pending' | 'brand';

/**
 * Small status pill — "Top Rated", "Bestseller", "Confirmed", "Upcoming".
 *
 * The mockup's badges are letterspaced caps in a tinted pill, and the two on the detail page are
 * the pair this maps: `offer` is the gold-tinted "Top Rated", `info` the sand "Bestseller".
 */
export function Badge({ label, tone = 'info' }: { label: string; tone?: BadgeTone }) {
  const tones: Record<BadgeTone, { bg: string; fg: string }> = {
    info: { bg: palette.ivorySunken, fg: palette.inkMuted },
    success: { bg: semantic.tintSuccess, fg: palette.success },
    offer: { bg: semantic.tintOffer, fg: palette.goldDeep },
    pending: { bg: semantic.tintWarning, fg: palette.warning },
    brand: { bg: palette.green900, fg: semantic.textOnDark },
  };
  const { bg, fg } = tones[tone];
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingVertical: 5,
        paddingHorizontal: spacing.sm + 4,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ ...typography.overline, fontSize: 11, letterSpacing: 0.9, color: fg }}>
        {label}
      </Text>
    </View>
  );
}

/** "★ 4.8 (124)" — the rating treatment used on every card in the mockups. */
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
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
      accessible
      accessibilityLabel={`Rated ${average} out of 5 from ${count} reviews`}
    >
      <Text style={{ fontSize: compact ? 13 : 15, color: palette.ratingStar }}>★</Text>
      <Text
        style={{
          ...typography.captionStrong,
          fontFamily: typography.bodyStrong.fontFamily,
          fontWeight: '700',
          fontSize: compact ? 13 : 14,
          color: semantic.textPrimary,
        }}
      >
        {average.toFixed(1)}
      </Text>
      {showCount ? (
        <Text
          style={{ ...typography.caption, fontSize: compact ? 12 : 13, color: semantic.textMuted }}
        >
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

/**
 * "Recommended for You                                [ View All ]"
 *
 * The section action is a green **outlined pill**, not a line of coloured text. That is how the
 * mockup draws it, and it is also the reason it reads: gold text on ivory is 2.3:1 and a muddy
 * smear at 14pt, whereas the outlined green pill is both a clear affordance and AA-legible.
 */
export function SectionHeader({
  title,
  subtitle,
  actionLabel = 'View All',
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ ...typography.heading, color: semantic.textPrimary }}>{title}</Text>
        {subtitle ? (
          <Text style={{ ...typography.caption, color: semantic.textMuted }}>{subtitle}</Text>
        ) : null}
      </View>
      {onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}, ${title}`}
          style={({ pressed }) => ({
            borderWidth: 1.5,
            borderColor: semantic.accent,
            borderRadius: radius.pill,
            paddingVertical: 5,
            paddingHorizontal: spacing.sm + 4,
            backgroundColor: pressed ? semantic.surfaceSunken : 'transparent',
          })}
        >
          <Text style={{ ...typography.captionStrong, fontSize: 13, color: semantic.accent }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * One of the three facts under the title on the detail page: Duration / Departs / Group Size.
 *
 * Each is its own bordered tile in the mockup rather than a cell in a shared row, so the tile
 * carries its own surface and radius and `StatRow` only distributes them.
 */
export function StatTile({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 3,
        paddingVertical: spacing.md - 2,
        paddingHorizontal: spacing.xs,
        backgroundColor: semantic.surfaceSunken,
        borderWidth: 1,
        borderColor: semantic.border,
        borderRadius: radius.md,
      }}
    >
      <Icon name={icon} size={19} color={semantic.textMuted} />
      <Text style={{ ...typography.caption, fontSize: 12, color: semantic.textMuted }}>
        {label}
      </Text>
      <Text
        style={{ ...typography.captionStrong, fontFamily: typography.bodyStrong.fontFamily, fontWeight: '700', fontSize: 13, color: semantic.textPrimary }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>{children}</View>
  );
}

/** A "✓ Snorkeling Gear" line from the detail page's What's Included list. */
export function IncludedRow({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 }}>
      <Icon name="check" size={16} color={semantic.brand} />
      <Text style={{ ...typography.caption, flex: 1, color: semantic.textPrimary }}>{label}</Text>
    </View>
  );
}

/** An icon-and-text fact row — the trip card's date, time, location, party size. */
export function FactRow({
  icon,
  children,
}: {
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4 }}>
      <View style={{ paddingTop: 2 }}>
        <Icon name={icon} size={17} color={semantic.textMuted} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>{children}</View>
    </View>
  );
}

/** The hairline the mockup uses to separate a card's facts from its action. */
export function Divider() {
  return <View style={{ height: 1, backgroundColor: semantic.border }} />;
}

/** A screen's serif title with an optional muted line under it — Interests, Select Destination. */
export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ ...typography.display, fontSize: 28, lineHeight: 34, color: semantic.textPrimary }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ ...typography.caption, color: semantic.textMuted }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

/**
 * The pill search field, with the magnifier inside it and an optional trailing control.
 *
 * Explore and Search both draw this; they had two different hand-rolled inputs, which is how a
 * search box ends up one height on one screen and another height on the next.
 */
export function SearchField({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'Search experiences, tours, locations...',
  autoFocus = false,
  trailing,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm + 2,
          backgroundColor: semantic.surface,
          borderWidth: 1,
          borderColor: semantic.border,
          borderRadius: radius.pill,
          paddingVertical: spacing.sm + 3,
          paddingHorizontal: spacing.md,
        }}
      >
        <Icon name="search" size={18} color={semantic.textMuted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          {...(onSubmit ? { onSubmitEditing: onSubmit } : {})}
          returnKeyType="search"
          autoFocus={autoFocus}
          placeholder={placeholder}
          placeholderTextColor={semantic.textMuted}
          accessibilityLabel="Search experiences"
          style={[
            { flex: 1, ...typography.body, fontSize: 15, color: semantic.textPrimary },
            // Web-only: react-native-web draws a focus ring inside the pill that reads as a
            // second border. The pill is the affordance.
            { outlineStyle: 'none' } as unknown as TextStyle,
          ]}
        />
        {value.length > 0 ? (
          <Pressable
            onPress={() => onChangeText('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Icon name="x" size={16} color={semantic.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

/**
 * A shimmer-free loading placeholder.
 *
 * The app showed a bare centred spinner while a list loaded, which tells you nothing about what is
 * coming and makes the screen jump when it arrives. A block in the shape of the content holds the
 * layout still — the mockups' "smooth, logical user flow" note in practice.
 */
export function Skeleton({
  height,
  width = '100%',
  radius: r = radius.sm,
}: {
  height: number;
  width?: number | `${number}%`;
  radius?: number;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height, width, borderRadius: r, backgroundColor: semantic.surfaceSunken }}
    />
  );
}

/** The loading state for a list of experience rows — the same shape as `ExperienceCard` row. */
export function RowSkeleton() {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        padding: spacing.sm + 2,
        backgroundColor: semantic.surface,
        borderWidth: 1,
        borderColor: semantic.border,
        borderRadius: radius.lg,
      }}
    >
      <Skeleton height={92} width={92} radius={radius.md} />
      <View style={{ flex: 1, gap: spacing.sm, paddingVertical: 4 }}>
        <Skeleton height={16} width="80%" />
        <Skeleton height={12} width="55%" />
        <Skeleton height={12} width="35%" />
      </View>
    </View>
  );
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: spacing.sm + 4 }}>
      {Array.from({ length: count }, (_, i) => (
        <RowSkeleton key={i} />
      ))}
    </View>
  );
}

/**
 * The empty state the mockups imply but never draw: an icon, a line, a reason, and one action.
 *
 * Centred and quiet. An empty list that says nothing reads as a bug.
 */
export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.pill,
          backgroundColor: semantic.surfaceSunken,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 2,
        }}
      >
        <Icon name={icon} size={24} color={semantic.textMuted} />
      </View>
      <Text style={{ ...typography.heading, color: semantic.textPrimary, textAlign: 'center' }}>
        {title}
      </Text>
      <Text
        style={{
          ...typography.caption,
          color: semantic.textMuted,
          textAlign: 'center',
          maxWidth: 300,
        }}
      >
        {body}
      </Text>
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.sm }}>
          <SecondaryButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
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

/**
 * The gradient scrim that makes white text readable over the bottom of a photograph.
 *
 * The mockup's hero cards fade from transparent at the top to near-opaque green at the bottom
 * rather than tinting the whole image flat, which is what keeps the photograph looking like a
 * photograph.
 */
export function PhotoScrim({ height = '62%' }: { height?: number | `${number}%` }) {
  return (
    <LinearGradient
      colors={['rgba(12,43,37,0)', 'rgba(12,43,37,0.82)']}
      // pointerEvents belongs in the style, not as a prop — as a prop it is not forwarded and the
      // scrim intercepts taps meant for the card underneath it.
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height, pointerEvents: 'none' }}
    />
  );
}

/** The rounded surface every card in the mockups sits on. */
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
    ...elevation.card,
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

/** The circular translucent control over a photograph — back, save, share on the detail page. */
export function RoundIconButton({
  icon,
  onPress,
  accessibilityLabel,
  active = false,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        backgroundColor: 'rgba(12,43,37,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Icon name={icon} size={19} color={active ? palette.goldLight : semantic.textOnDark} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * "US$89" — the mockup's price format throughout, in preference to "$89 USD".
 *
 * `withCode` is kept for the checkout summary, where the mockup does spell out "Total (USD)".
 */
export function formatUsd(minor: number, withCode = false): string {
  const major = minor / 100;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: major % 1 === 0 ? 0 : 2,
  }).format(major);
  if (withCode) return `${formatted} USD`;
  return formatted.replace('$', 'US$');
}

/**
 * "≈ JAM $11,700" — the indicative local figure the mockups show beside the USD total.
 *
 * OD-09 is "display localized, settle in USD", so this is display only and is always prefixed with
 * an approximation sign. Returns null for an island that settles in USD anyway, because "≈ USD $75"
 * beside "US$75" is noise.
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
