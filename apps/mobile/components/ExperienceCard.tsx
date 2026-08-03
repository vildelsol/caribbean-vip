import { Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { elevation, palette, radius, semantic, spacing, typography } from '@cvip/ui';
import { formatDistance } from '@cvip/types';
import type { CatalogueItem } from '../lib/catalogue';
import { demoImage, demoImageCredit, demoMediaCredit } from '../lib/demoMedia';
import { Card, Icon, Photo, PhotoScrim, Rating, formatUsd } from './kit';

/**
 * One listing, in the three shapes the mockups use.
 *
 * - `row`    — **the default.** Thumbnail left, detail right, one per line. Every list of
 *              experiences in the app uses this: Explore, Search, Nearby, Saved.
 * - `hero`   — the wide "Nearby Discoveries" card with the photo behind the text. One per screen.
 * - `grid`   — photo on top, kept only for the Irie AI answer carousel, where three small cards
 *              scrolling sideways is the point rather than an accident of layout.
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
  variant = 'row',
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
      {/* The mockup saves with a heart, not a star — the star is the rating mark, and using it
          for two different meanings on the same card is the sort of thing that reads as "nearly
          right" without anyone being able to say why. */}
      <Icon name="heart" size={18} color={saved ? palette.gold : semantic.textMuted} />
    </Pressable>
  ) : null;

  // -- Row ------------------------------------------------------------------
  //
  // The mockup's search-result card, and now the default everywhere an experience is listed.
  //
  // A square thumbnail on the left, then title, one line of summary, the rating and the price
  // stacked in the remaining width, with the save heart in the top-right corner. Single column by
  // design: two 48%-wide cards side by side is a desktop grid habit that leaves a phone with two
  // columns of clipped titles and unreadable thumbnails.
  if (variant === 'row') {
    return (
      <Link href={{ pathname: '/experience/[id]', params: { id: item.id } }} asChild>
        <Pressable accessibilityRole="button" accessibilityLabel={label}>
          {({ pressed }: { pressed: boolean }) => (
            <View style={{ opacity: pressed ? 0.85 : 1 }}>
              <Card padded={false}>
                <View style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.sm + 2 }}>
                  {hero ? (
                    <View style={{ width: 92 }}>
                      <Photo
                        source={hero}
                        ratio={1}
                        radius={radius.md}
                        {...(alt ? { accessibilityLabel: alt } : {})}
                      />
                    </View>
                  ) : null}

                  {/* Sized to sit level with the 92pt thumbnail. Four tight lines — title,
                      summary, rating, price — is what the mockup's row holds, and every one of
                      them earns its height. */}
                  <View style={{ flex: 1, gap: 2, paddingVertical: 1 }}>
                    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
                      <Text
                        style={{
                          ...typography.bodyStrong,
                          fontSize: 15,
                          lineHeight: 19,
                          color: semantic.textPrimary,
                          flex: 1,
                        }}
                        numberOfLines={2}
                      >
                        {item.title}
                      </Text>
                      {SaveButton}
                    </View>

                    {item.summary ? (
                      <Text
                        style={{
                          ...typography.caption,
                          fontSize: 12.5,
                          lineHeight: 16,
                          color: semantic.textMuted,
                        }}
                        numberOfLines={1}
                      >
                        {item.summary}
                      </Text>
                    ) : null}

                    <Rating average={item.ratingAverage} count={item.ratingCount} compact />

                    <View
                      style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 1 }}
                    >
                      {/* Green, as the mockup sets it. The price is the figure a guest scans a
                          card for; in ink it is indistinguishable from the title above it. */}
                      <Text
                        style={{ ...typography.bodyStrong, fontSize: 15, color: semantic.price }}
                      >
                        {price}
                      </Text>
                      <Text
                        style={{ ...typography.caption, fontSize: 12, color: semantic.textMuted }}
                      >
                        per person
                      </Text>
                      {distanceMetres !== undefined ? (
                        <Text
                          style={{ ...typography.caption, fontSize: 12, color: semantic.textMuted }}
                        >
                          · {formatDistance(distanceMetres)}
                        </Text>
                      ) : null}
                      {/* Operating rule 9 still applies, but as a two-letter mark on the price
                          line rather than a full sentence. The sentence added a fifth line to
                          every card in the app and made each row half again as tall as the
                          mockup's. The detail page states it in full. */}
                      {item.isDemo ? (
                        <Text
                          style={{
                            ...typography.overline,
                            fontSize: 9.5,
                            letterSpacing: 0.6,
                            color: semantic.alert,
                          }}
                        >
                          DEMO
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              </Card>
            </View>
          )}
        </Pressable>
      </Link>
    );
  }

  // -- Hero -----------------------------------------------------------------
  //
  // The mockup's "Nearby Discoveries" card is a photograph with the title and distance sitting
  // *on* it under a gradient — not a photograph stacked above a block of text, which is what this
  // was. The photo is the card.
  if (variant === 'hero') {
    return (
      <Link href={{ pathname: '/experience/[id]', params: { id: item.id } }} asChild>
        <Pressable accessibilityRole="button" accessibilityLabel={label}>
          <View style={{ borderRadius: radius.lg, overflow: 'hidden', ...elevation.card }}>
            {hero ? (
              <Photo
                source={hero}
                ratio={2.4}
                radius={0}
                {...(alt ? { accessibilityLabel: alt } : {})}
              />
            ) : (
              <View style={{ height: 150, backgroundColor: semantic.brand }} />
            )}
            <PhotoScrim />
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                paddingHorizontal: spacing.md,
                paddingTop: spacing.md,
                // Clears the attribution strip pinned to the card's foot. Without this the
                // subtitle sits underneath the credit and both become unreadable.
                paddingBottom: credit ? spacing.lg + 2 : spacing.md,
                gap: 5,
              }}
            >
              <Text
                numberOfLines={1}
                style={{ ...typography.heading, fontSize: 20, color: semantic.textOnDark }}
              >
                {item.title}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name="map-pin" size={13} color={palette.goldLight} />
                <Text
                  numberOfLines={1}
                  style={{ ...typography.caption, fontSize: 13, flex: 1, color: semantic.textOnDark }}
                >
                  {distanceMetres !== undefined
                    ? `${formatDistance(distanceMetres)} away`
                    : (item.summary ?? `from ${price}`)}
                </Text>
              </View>
            </View>
            {/* Attribution still has to be visible over the photograph — CC BY requires it
                wherever the work appears, and a hero card is exactly where it gets forgotten. */}
            {credit ? <CreditStrip text={credit} /> : null}
          </View>
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
                ratio={3 / 2}
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
          {/* The card foot, sized for the 180pt carousel it now lives in: title, rating, then the
              price on one line with "per person" beside it rather than stacked beneath. */}
          <View style={{ padding: spacing.sm + 2, gap: 3 }}>
            <Text
              style={{
                ...typography.bodyStrong,
                fontSize: 14,
                lineHeight: 18,
                color: semantic.textPrimary,
              }}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            <Rating average={item.ratingAverage} count={item.ratingCount} compact />
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
              <Text style={{ ...typography.bodyStrong, fontSize: 15, color: semantic.price }}>
                {price}
              </Text>
              <Text style={{ ...typography.caption, fontSize: 11, color: semantic.textMuted }}>
                per person
              </Text>
              {/* Operating rule 9 as a mark, not a sentence — see the row variant. */}
              {item.isDemo ? (
                <Text
                  style={{
                    ...typography.overline,
                    fontSize: 9.5,
                    letterSpacing: 0.6,
                    color: semantic.alert,
                  }}
                >
                  DEMO
                </Text>
              ) : null}
            </View>
            {distanceMetres !== undefined ? (
              <Text style={{ ...typography.caption, fontSize: 11, color: semantic.textMuted }}>
                {formatDistance(distanceMetres)} away
              </Text>
            ) : null}
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
