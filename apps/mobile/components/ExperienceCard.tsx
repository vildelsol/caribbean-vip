import { Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import { formatDistance } from '@cvip/types';
import type { CatalogueItem } from '../lib/catalogue';
import { demoImage, demoImageCredit, demoMediaCredit } from '../lib/demoMedia';
import { Badge, Card, Photo, Rating, formatUsd } from './kit';

/**
 * One listing, in the three shapes the mockups use.
 *
 * - `grid`   — the two-up "Recommended for You" card: photo on top, title, rating, from-price.
 * - `row`    — the search-result and "Other Bookings" row: thumbnail left, detail right.
 * - `hero`   — the wide "Near You in Ocho Rios" card with the photo behind the text.
 *
 * One component rather than three because the content and its accessibility labelling are
 * identical; only the arrangement differs, and keeping them together is what stops the price or the
 * demo label being present in one layout and quietly missing from another.
 *
 * `isDemo` is rendered in every variant. Operating rule 9 forbids presenting seeded content as
 * live, and a card in a screenshot is exactly where that would go wrong.
 */
export function ExperienceCard({
  item,
  variant = 'grid',
  distanceMetres,
  saved,
  onToggleSave,
}: {
  item: CatalogueItem;
  variant?: 'grid' | 'row' | 'hero';
  distanceMetres?: number | undefined;
  saved?: boolean;
  onToggleSave?: () => void;
}) {
  const hero = demoImage(item.heroMediaKey);
  const credit = demoImageCredit(item.heroMediaKey);
  const alt = demoMediaCredit(item.heroMediaKey ?? '')?.subject;
  const price = formatUsd(item.fromAmountMinor);
  const label = `${item.title}, from ${price}${
    item.ratingAverage > 0 ? `, rated ${item.ratingAverage} out of 5` : ''
  }`;

  const SaveButton = onToggleSave ? (
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
  ) : null;

  // -- Row ------------------------------------------------------------------
  if (variant === 'row') {
    return (
      <Link href={{ pathname: '/experience/[id]', params: { id: item.id } }} asChild>
        <Pressable accessibilityRole="button" accessibilityLabel={label}>
          <Card padded={false}>
            <View style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.sm }}>
              {hero ? (
                <View style={{ width: 96 }}>
                  <Photo source={hero} ratio={1} radius={radius.md} {...(alt ? { accessibilityLabel: alt } : {})} />
                </View>
              ) : null}
              <View style={{ flex: 1, gap: 3, paddingVertical: 2 }}>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Text
                    style={{ ...typography.bodyStrong, color: semantic.textPrimary, flex: 1 }}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                  {SaveButton}
                </View>
                {item.summary ? (
                  <Text
                    style={{ ...typography.caption, color: semantic.textMuted }}
                    numberOfLines={1}
                  >
                    {item.summary}
                  </Text>
                ) : null}
                <Rating average={item.ratingAverage} count={item.ratingCount} compact />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={{ ...typography.caption, fontWeight: '700', color: semantic.textAccent }}>
                    from {price}
                  </Text>
                  {distanceMetres !== undefined ? (
                    <Text style={{ ...typography.caption, fontSize: 12, color: semantic.textMuted }}>
                      {formatDistance(distanceMetres)}
                    </Text>
                  ) : null}
                </View>
                {item.isDemo ? <DemoLabel compact /> : null}
              </View>
            </View>
          </Card>
        </Pressable>
      </Link>
    );
  }

  // -- Hero -----------------------------------------------------------------
  if (variant === 'hero') {
    return (
      <Link href={{ pathname: '/experience/[id]', params: { id: item.id } }} asChild>
        <Pressable accessibilityRole="button" accessibilityLabel={label}>
          <Card padded={false}>
            {hero ? (
              <View>
                <Photo
                  source={hero}
                  ratio={2}
                  radius={0}
                  {...(alt ? { accessibilityLabel: alt } : {})}
                />
                {credit ? <CreditStrip text={credit} /> : null}
              </View>
            ) : null}
            <View style={{ padding: spacing.md, gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                {distanceMetres !== undefined ? (
                  <Badge label={formatDistance(distanceMetres)} tone="success" />
                ) : null}
                {item.isDemo ? <Badge label="Demo listing" tone="offer" /> : null}
              </View>
              <Text style={{ ...typography.heading, color: semantic.textPrimary }}>
                {item.title}
              </Text>
              {item.summary ? (
                <Text style={{ ...typography.body, color: semantic.textMuted }} numberOfLines={2}>
                  {item.summary}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Rating average={item.ratingAverage} count={item.ratingCount} />
                <Text style={{ ...typography.bodyStrong, color: semantic.textAccent }}>
                  from {price}
                </Text>
              </View>
            </View>
          </Card>
        </Pressable>
      </Link>
    );
  }

  // -- Grid -----------------------------------------------------------------
  return (
    <Link href={{ pathname: '/experience/[id]', params: { id: item.id } }} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1 }}>
        <Card padded={false}>
          {hero ? (
            <View>
              <Photo
                source={hero}
                ratio={4 / 3}
                radius={0}
                {...(alt ? { accessibilityLabel: alt } : {})}
              />
              {credit ? <CreditStrip text={credit} /> : null}
              {SaveButton ? (
                <View
                  style={{
                    position: 'absolute',
                    top: spacing.sm,
                    right: spacing.sm,
                    backgroundColor: 'rgba(255,255,255,0.9)',
                    borderRadius: radius.pill,
                    width: 32,
                    height: 32,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {SaveButton}
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={{ padding: spacing.sm + 2, gap: 3 }}>
            <Text
              style={{ ...typography.bodyStrong, fontSize: 15, color: semantic.textPrimary }}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            <Rating average={item.ratingAverage} count={item.ratingCount} compact />
            <Text style={{ ...typography.caption, fontWeight: '700', color: semantic.textAccent }}>
              from {price}
            </Text>
            {distanceMetres !== undefined ? (
              <Text style={{ ...typography.caption, fontSize: 12, color: semantic.accent }}>
                {formatDistance(distanceMetres)}
              </Text>
            ) : null}
            {item.isDemo ? <DemoLabel compact /> : null}
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}

/**
 * Attribution over the photograph.
 *
 * CC BY and CC BY-SA both require credit wherever the work appears, and a card in a screenshot is
 * exactly where that gets forgotten — so it is burned into the card, not left to the detail page.
 */
function CreditStrip({ text }: { text: string }) {
  return (
    <Text
      numberOfLines={1}
      style={{
        ...typography.caption,
        fontSize: 10,
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
      {text}
    </Text>
  );
}

function DemoLabel({ compact }: { compact?: boolean }) {
  return (
    <Text
      style={{
        ...typography.caption,
        fontSize: compact ? 11 : 14,
        color: semantic.alert,
      }}
    >
      Demo listing — not live pricing
    </Text>
  );
}

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
