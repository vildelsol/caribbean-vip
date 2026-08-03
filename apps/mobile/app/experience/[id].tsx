import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import { hasCatalogue } from '../../lib/mode';
import { useIsland } from '../../lib/island';
import { useSaved } from '../../lib/saved';
import { loadExperience, type ExperienceDetail } from '../../lib/catalogue';
import { approxLocalPerUsd } from '../../lib/localCurrency';
import { demoImage, demoImageCredit } from '../../lib/demoMedia';
import { formatDuration } from '../../components/ExperienceCard';
import { Notice } from '../../components/Notice';
import { OfferSheet } from '../../components/OfferSheet';
import {
  Badge,
  Card,
  Divider,
  Icon,
  IncludedRow,
  Photo,
  PrimaryButton,
  Rating,
  RoundIconButton,
  StatRow,
  StatTile,
  formatLocalApprox,
  formatUsd,
} from '../../components/kit';
import { categoryLabel } from '../(tabs)/index';

/**
 * Experience detail — PRD §5, laid out to the "Experience Detail" mockup.
 *
 * Photo first with the controls floating on it, then title, location, rating and verification, a
 * row of three facts, the offer, the overview, what's included, availability, and a sticky price
 * bar with the primary action. The mockups' hierarchy note is the point: a guest decides on the
 * photo, the rating and the price, so those come before the prose.
 *
 * Reachable by a guest (T-01): nothing here requires an account. Saving and booking prompt for
 * sign-in at the point they are used, rather than gating the page.
 *
 * A listing that is not publicly visible produces the SAME "not available" state as a non-existent
 * id — distinguishing them would confirm that a hidden listing exists.
 */
export default function ExperienceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isSaved, toggle, requiresSignIn } = useSaved();
  const { island } = useIsland();

  const [detail, setDetail] = useState<ExperienceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerSaved, setOfferSaved] = useState(false);

  useEffect(() => {
    if (!id || !hasCatalogue) {
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      const { detail: d, error: err } = await loadExperience(id);
      if (!active) return;
      setDetail(d);
      setError(err);
      setLoading(false);
      // The mockups open the voucher popup on arrival when an offer applies — that is the whole
      // point of a limited-time offer, and burying it below the fold defeats it.
      if (d?.promotion) setOfferOpen(true);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: semantic.background, justifyContent: 'center' }}>
        <ActivityIndicator color={semantic.brandActive} />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: semantic.background }}
        contentContainerStyle={{ padding: spacing.lg }}
      >
        <Notice
          tone="muted"
          title="This experience is not available"
          body={
            error ??
            'It may have been unpublished, or the link may be out of date. Browse what is available instead.'
          }
          action={{ label: 'Back to Explore', onPress: () => router.replace('/') }}
        />
      </ScrollView>
    );
  }

  const saved = isSaved(detail.id);
  const hero = demoImage(detail.heroMediaKey);
  const heroCredit = demoImageCredit(detail.heroMediaKey);
  const gallery = detail.media
    .map((m) => ({ ...m, source: demoImage(m.storagePath), credit: demoImageCredit(m.storagePath) }))
    .filter((m): m is typeof m & { source: NonNullable<typeof m.source> } => m.source !== null);
  // Every published departure is full, or none are published. Either way there is nothing to book,
  // and a live "Check availability" button leading to an empty picker is worse than saying so.
  const soldOut = detail.upcomingSlots.every((s) => s.capacity - s.bookedCount <= 0);
  const cancellationHours = describeCancellationHours(detail.cancellationPolicy);
  const maxGroup = Math.max(...detail.upcomingSlots.map((s) => s.capacity), 0);
  const local = island
    ? formatLocalApprox(detail.fromAmountMinor, island.currency, approxLocalPerUsd(island.currency) ?? 0)
    : null;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: semantic.background }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
          {/* Hero with floating controls, as the mockup shows. */}
          <View>
            {hero ? (
              <Photo source={hero} ratio={4 / 3} radius={0} />
            ) : (
              <View style={{ height: 220, backgroundColor: semantic.brand }} />
            )}

            {/* The mockup's floating controls: dark translucent discs with white line icons, not
                white discs with a text arrow. Back on the left, save on the right. */}
            <View
              style={{
                position: 'absolute',
                top: spacing.lg,
                left: spacing.md,
                right: spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <RoundIconButton
                icon="arrow-left"
                accessibilityLabel="Go back"
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              />
              <View style={{ flex: 1 }} />
              <RoundIconButton
                icon="heart"
                active={saved}
                accessibilityLabel={saved ? 'Remove from saved' : 'Save this experience'}
                onPress={() => (requiresSignIn ? router.push('/sign-in') : void toggle(detail.id))}
              />
            </View>

            {heroCredit ? (
              <Text
                numberOfLines={1}
                style={{
                  ...typography.caption,
                  fontSize: 11,
                  color: semantic.textOnDark,
                  backgroundColor: 'rgba(7,58,50,0.62)',
                  paddingHorizontal: spacing.md,
                  paddingVertical: 3,
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

          {/* The content sits on a rounded sheet pulled up over the photograph, which is how the
              mockup joins the two — a butt join between a square photo and a flat background is
              the single tell that gives away a stock layout. */}
          <View
            style={{
              marginTop: -spacing.lg,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              backgroundColor: semantic.background,
              padding: spacing.lg,
              gap: spacing.lg,
            }}
          >
            <View style={{ gap: spacing.sm }}>
              {/* The mockup's badge pair sits above the title. */}
              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                {detail.ratingAverage >= 4.5 ? <Badge label="Top Rated" tone="offer" /> : null}
                {detail.vendorVerified ? <Badge label="Verified Operator" tone="success" /> : null}
                <Badge label={categoryLabel(detail.category)} tone="info" />
              </View>

              {/* Title left, price right — the mockup pairs them on one baseline so the two facts
                  a guest decides on are read together. */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
                <Text style={{ ...typography.title, fontSize: 26, flex: 1, color: semantic.textPrimary }}>
                  {detail.title}
                </Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ ...typography.title, fontSize: 22, color: semantic.price }}>
                    {formatUsd(detail.fromAmountMinor)}
                  </Text>
                  <Text style={{ ...typography.caption, fontSize: 12, color: semantic.textMuted }}>
                    per person
                  </Text>
                  {/* OD-09: display localized, settle in USD. Always approximate, never used in
                      a calculation that leads to a charge. */}
                  {local ? (
                    <Text
                      numberOfLines={1}
                      style={{ ...typography.caption, fontSize: 12, color: semantic.textMuted }}
                    >
                      {local}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  flexWrap: 'wrap',
                }}
              >
                <Rating average={detail.ratingAverage} count={detail.ratingCount} />
                {detail.destinationName ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name="map-pin" size={13} color={semantic.textMuted} />
                    <Text style={{ ...typography.caption, fontSize: 13, color: semantic.textMuted }}>
                      {detail.destinationName}
                    </Text>
                  </View>
                ) : null}
              </View>

              {detail.vendorName ? (
                <Text style={{ ...typography.caption, color: semantic.textMuted }}>
                  Operated by {detail.vendorName}
                </Text>
              ) : null}
            </View>

            <Divider />

            {/* Three facts, the mockup's stat row. */}
            <StatRow>
              <StatTile
                icon="clock"
                label="Duration"
                value={formatDuration(detail.durationMinutes)}
              />
              <StatTile
                icon="calendar"
                label="Departs"
                value={detail.upcomingSlots.length > 3 ? 'Daily' : 'Selected days'}
              />
              <StatTile
                icon="users"
                label="Group Size"
                value={maxGroup > 0 ? `Up to ${maxGroup}` : 'Small group'}
              />
            </StatRow>

            {/* Operating rule 9: never present seeded content as live. */}
            {detail.isDemo ? (
              <Notice
                tone="alert"
                title="Demo listing"
                body="Seeded demonstration content. Prices, availability, reviews and vendor verification are not live."
              />
            ) : null}

            {detail.promotion ? (
              <Pressable onPress={() => setOfferOpen(true)} accessibilityRole="button">
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <Text style={{ fontSize: 26 }}>🍹</Text>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Badge label={offerSaved ? 'Saved to your vouchers' : 'Offer available'} tone="offer" />
                      <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                        {detail.promotion.title}
                      </Text>
                    </View>
                    <Text style={{ color: semantic.accent, fontSize: 20 }}>›</Text>
                  </View>
                </Card>
              </Pressable>
            ) : null}

            {detail.description ? (
              <Section title="Overview">
                <Text style={{ ...typography.body, color: semantic.textPrimary }}>
                  {detail.description}
                </Text>
              </Section>
            ) : null}

            {detail.inclusions.length > 0 ? (
              <Section title="What's Included">
                {detail.inclusions.map((line) => (
                  <IncludedRow key={line} label={line} />
                ))}
                {detail.promotion ? <IncludedRow label={detail.promotion.title} /> : null}
              </Section>
            ) : null}

            {gallery.length > 1 ? (
              <Section title="Photos">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: spacing.sm }}
                >
                  {gallery.map((m) => (
                    <View key={m.id} style={{ width: 240 }}>
                      <Photo
                        source={m.source}
                        ratio={4 / 3}
                        {...(m.altText ? { accessibilityLabel: m.altText } : {})}
                      />
                    </View>
                  ))}
                </ScrollView>
                {/* Attribution for every photograph on screen. */}
                {gallery.map((m) =>
                  m.credit ? (
                    <Text
                      key={`${m.id}-credit`}
                      style={{ ...typography.caption, fontSize: 11, color: semantic.textMuted }}
                    >
                      {m.credit}
                    </Text>
                  ) : null,
                )}
              </Section>
            ) : null}

            <Section title="Getting there">
              {detail.pickupInfo ? (
                <Text style={{ ...typography.body, color: semantic.textPrimary }}>
                  {detail.pickupInfo}
                </Text>
              ) : null}
              {detail.meetingPoint ? (
                <Text style={{ ...typography.caption, color: semantic.textMuted }}>
                  Meet at {detail.meetingPoint}
                </Text>
              ) : null}
            </Section>

            <Section title="Availability">
              {detail.upcomingSlots.length === 0 ? (
                <Text style={{ ...typography.caption, color: semantic.textMuted }}>
                  No upcoming departures published.
                </Text>
              ) : (
                <>
                  {detail.upcomingSlots.slice(0, 4).map((s) => {
                    const remaining = s.capacity - s.bookedCount;
                    return (
                      <View
                        key={s.id}
                        style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}
                      >
                        <Text style={{ ...typography.body, color: semantic.textPrimary, flex: 1 }}>
                          {formatSlot(s.startsAt)}
                        </Text>
                        <Text
                          style={{
                            ...typography.caption,
                            color: remaining <= 2 ? semantic.alert : semantic.textMuted,
                          }}
                        >
                          {remaining <= 0
                            ? 'Sold out'
                            : remaining <= 2
                              ? `${remaining} left`
                              : `${remaining} places`}
                        </Text>
                      </View>
                    );
                  })}
                  <Text style={{ ...typography.caption, color: semantic.textMuted }}>
                    Group size up to {maxGroup}. Availability is confirmed at checkout.
                  </Text>
                </>
              )}
            </Section>

            <Section title="Cancellation">
              <Text style={{ ...typography.body, color: semantic.textPrimary }}>
                Free cancellation up to {cancellationHours} hours before the experience starts. After
                that the booking is non-refundable.
              </Text>
            </Section>

            <Section title="Reviews">
              <Text style={{ ...typography.caption, color: semantic.textMuted }}>
                {detail.ratingCount > 0
                  ? `${detail.ratingAverage.toFixed(1)} out of 5 from ${detail.ratingCount.toLocaleString()} demo reviews. Only guests who completed a booking can leave one.`
                  : 'No reviews yet. Reviews come only from guests who completed a booking.'}
              </Text>
            </Section>
          </View>
        </ScrollView>

        {/* The sticky action. The mockup's is a single full-width button; this carried a second
            copy of the price beside it, which pushed the label onto two lines and repeated a
            figure already set large at the top of the page. The price is stated once.

            Hidden while the offer popup is open: react-native-web renders a Modal into the page's
            own stacking context, so an absolutely-positioned bar paints straight over it. Removing
            the bar is also the honest behaviour — there is nothing to press behind a modal. */}
        {offerOpen ? null : (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: spacing.md,
            paddingBottom: spacing.lg,
            backgroundColor: semantic.background,
            borderTopWidth: 1,
            borderTopColor: semantic.border,
          }}
        >
          <PrimaryButton
            label={soldOut ? 'No departures' : 'Check Availability'}
            disabled={soldOut}
            onPress={() => router.push({ pathname: '/book/[id]', params: { id: detail.id } })}
            accessibilityLabel={
              soldOut
                ? 'No departures available'
                : `Check availability for ${detail.title}, from ${formatUsd(detail.fromAmountMinor)} per person`
            }
          />
        </View>
        )}
      </View>

      {detail.promotion ? (
        <OfferSheet
          visible={offerOpen}
          title={detail.promotion.title}
          terms={detail.promotion.terms}
          vendorName={detail.vendorName}
          experienceTitle={detail.title}
          saved={offerSaved}
          onSave={() => {
            setOfferSaved(true);
            setOfferOpen(false);
          }}
          onDismiss={() => setOfferOpen(false)}
        />
      ) : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ ...typography.heading, color: semantic.textPrimary }}>{title}</Text>
      {children}
    </View>
  );
}

/**
 * Cancellation terms are stored as JSON so the vendor portal can offer structured options in M4.
 * Until then the shape may be empty — default to the platform's 24 hours rather than rendering
 * "{}" or implying terms that do not exist.
 */
function describeCancellationHours(policy: Record<string, unknown>): number {
  const hours = policy.free_cancellation_hours;
  return typeof hours === 'number' ? hours : 24;
}

function formatSlot(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
