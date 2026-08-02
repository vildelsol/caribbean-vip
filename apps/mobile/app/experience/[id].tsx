import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import { hasCatalogue } from '../../lib/mode';
import { useSaved } from '../../lib/saved';
import { loadExperience, type ExperienceDetail } from '../../lib/catalogue';
import { demoImage, demoImageCredit } from '../../lib/demoMedia';
import { formatDuration, formatFrom } from '../../components/ExperienceCard';
import { Notice } from '../../components/Notice';
import { categoryLabel } from '../(tabs)/index';

/**
 * Experience detail — PRD §5.
 *
 * Shows media, price, duration, inclusions, pickup information, cancellation terms, reviews and
 * availability. Reachable by a guest (T-01): nothing here requires an account. Saving and booking
 * prompt for sign-in at the point they are used, rather than gating the page.
 *
 * A listing that is not publicly visible produces the SAME "not available" state as a
 * non-existent id — distinguishing them would confirm that a hidden listing exists.
 */
export default function ExperienceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isSaved, toggle, requiresSignIn } = useSaved();

  const [detail, setDetail] = useState<ExperienceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const cancellation = describeCancellation(detail.cancellationPolicy);
  const rating = averageRating(detail.reviews);
  // Every published departure is full, or none are published. Either way there is nothing to book,
  // and a live "Check availability" button leading to an empty picker is worse than saying so.
  const soldOut = detail.upcomingSlots.every((s) => s.capacity - s.bookedCount <= 0);

  return (
    <>
      <Stack.Screen options={{ title: detail.title }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: semantic.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <View style={{ gap: spacing.xs }}>
          <Text style={{ ...typography.caption, color: semantic.accent }}>
            {categoryLabel(detail.category)}
            {detail.destinationName ? ` · ${detail.destinationName}` : ''}
          </Text>
          <Text style={{ ...typography.display, color: semantic.textPrimary }}>{detail.title}</Text>
          {detail.vendorName ? (
            <Text style={{ ...typography.caption, color: semantic.textMuted }}>
              Operated by {detail.vendorName}
            </Text>
          ) : null}
        </View>

        {/* Operating rule 9: never present seeded content as live. */}
        {detail.isDemo ? (
          <Notice
            tone="alert"
            title="Demo listing"
            body="This is seeded demonstration content. Prices, availability, reviews and vendor verification are not live."
          />
        ) : null}

        <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' }}>
          <Fact label="From" value={formatFrom(detail.fromAmountMinor, detail.currency)} />
          <Fact label="Duration" value={formatDuration(detail.durationMinutes)} />
          {rating ? (
            <Fact label="Rating" value={`${rating.toFixed(1)} (${detail.reviews.length})`} />
          ) : null}
        </View>

        <Gallery media={detail.media} />

        {detail.description ? (
          <Section title="About">
            <Text style={{ ...typography.body, color: semantic.textPrimary }}>
              {detail.description}
            </Text>
          </Section>
        ) : null}

        {detail.inclusions.length > 0 ? (
          <Section title="What's included">
            {detail.inclusions.map((line) => (
              <Text key={line} style={{ ...typography.body, color: semantic.textPrimary }}>
                ✓ {line}
              </Text>
            ))}
          </Section>
        ) : null}

        {detail.exclusions.length > 0 ? (
          <Section title="Not included">
            {detail.exclusions.map((line) => (
              <Text key={line} style={{ ...typography.body, color: semantic.textMuted }}>
                · {line}
              </Text>
            ))}
          </Section>
        ) : null}

        {detail.pickupInfo || detail.meetingPoint ? (
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
        ) : null}

        <Section title="Price options">
          {detail.options.length === 0 ? (
            <Text style={{ ...typography.caption, color: semantic.textMuted }}>
              Pricing is not published for this experience yet.
            </Text>
          ) : (
            detail.options.map((o) => (
              <View
                key={o.id}
                style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}
              >
                <Text style={{ ...typography.body, color: semantic.textPrimary, flex: 1 }}>
                  {o.label}
                  {o.occupiesCapacity ? '' : ' (add-on)'}
                </Text>
                <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                  {formatFrom(o.unitAmountMinor, o.currency)}
                </Text>
              </View>
            ))
          )}
        </Section>

        <Section title="Availability">
          {detail.upcomingSlots.length === 0 ? (
            <Text style={{ ...typography.caption, color: semantic.textMuted }}>
              No upcoming departures published.
            </Text>
          ) : (
            <>
              {detail.upcomingSlots.slice(0, 6).map((s) => {
                const remaining = s.capacity - s.bookedCount;
                return (
                  <View
                    key={s.id}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      gap: spacing.md,
                    }}
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
                Availability is confirmed at checkout.
              </Text>
            </>
          )}
        </Section>

        <Section title="Cancellation">
          <Text style={{ ...typography.body, color: semantic.textPrimary }}>{cancellation}</Text>
        </Section>

        {detail.reviews.length > 0 ? (
          <Section title={`Reviews (${detail.reviews.length})`}>
            {detail.reviews.slice(0, 5).map((r) => (
              <View key={r.id} style={{ gap: 2 }}>
                <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                  {'★'.repeat(r.rating)}
                  {'☆'.repeat(5 - r.rating)}
                </Text>
                {r.body ? (
                  <Text style={{ ...typography.body, color: semantic.textMuted }}>{r.body}</Text>
                ) : null}
              </View>
            ))}
            <Text style={{ ...typography.caption, color: semantic.textMuted }}>
              Only guests who completed a booking can leave a review.
            </Text>
          </Section>
        ) : (
          <Section title="Reviews">
            <Text style={{ ...typography.caption, color: semantic.textMuted }}>
              No reviews yet. Reviews come only from guests who completed a booking.
            </Text>
          </Section>
        )}

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable
            onPress={() =>
              requiresSignIn ? router.push('/sign-in') : void toggle(detail.id)
            }
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Remove from saved' : 'Save this experience'}
            style={{
              flex: 1,
              backgroundColor: semantic.surface,
              borderWidth: 1,
              borderColor: semantic.border,
              borderRadius: radius.md,
              padding: spacing.md,
              alignItems: 'center',
            }}
          >
            <Text style={{ ...typography.bodyStrong, color: semantic.accent }}>
              {requiresSignIn ? 'Sign in to save' : saved ? '★ Saved' : '☆ Save'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              router.push({ pathname: '/book/[id]', params: { id: detail.id } })
            }
            disabled={soldOut}
            accessibilityRole="button"
            accessibilityLabel={soldOut ? 'No departures available' : `Book ${detail.title}`}
            style={{
              flex: 1,
              backgroundColor: soldOut ? semantic.surfaceSunken : semantic.brand,
              borderRadius: radius.md,
              padding: spacing.md,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                ...typography.bodyStrong,
                color: soldOut ? semantic.textMuted : semantic.textOnDark,
              }}
            >
              {soldOut ? 'No departures' : 'Check availability'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}

/**
 * Horizontal photo gallery.
 *
 * Renders nothing when no image resolves, which is the live-mode case: real listings store Supabase
 * Storage paths and no hosted project exists yet, so there is nothing to fetch. Silence beats a row
 * of broken image icons.
 */
function Gallery({ media }: { media: ExperienceDetail['media'] }) {
  const images = media
    .map((m) => ({ ...m, source: demoImage(m.storagePath), credit: demoImageCredit(m.storagePath) }))
    .filter((m): m is typeof m & { source: NonNullable<typeof m.source> } => m.source !== null);

  if (images.length === 0) return null;

  return (
    <View style={{ gap: spacing.xs }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {images.map((m) => (
          // The frame carries the ratio and the Image fills it: a bundled asset's intrinsic
          // dimensions are written onto the element by react-native-web and beat `aspectRatio`.
          <View
            key={m.id}
            style={{
              width: images.length === 1 ? 320 : 280,
              aspectRatio: 4 / 3,
              borderRadius: radius.md,
              overflow: 'hidden',
              backgroundColor: semantic.surfaceSunken,
            }}
          >
            <Image
              source={m.source}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
              accessible
              accessibilityRole="image"
              {...(m.altText ? { accessibilityLabel: m.altText } : {})}
            />
          </View>
        ))}
      </ScrollView>
      {/* Attribution for every photograph on screen — CC BY and CC BY-SA both require it. */}
      {images.map((m) =>
        m.credit ? (
          <Text key={`${m.id}-credit`} style={{ ...typography.caption, fontSize: 12, color: semantic.textMuted }}>
            {m.credit}
          </Text>
        ) : null,
      )}
    </View>
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        backgroundColor: semantic.surface,
        borderWidth: 1,
        borderColor: semantic.border,
        borderRadius: radius.md,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        minWidth: 96,
      }}
    >
      <Text style={{ ...typography.caption, color: semantic.textMuted }}>{label}</Text>
      <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{value}</Text>
    </View>
  );
}

function averageRating(reviews: { rating: number }[]): number | null {
  if (reviews.length === 0) return null;
  return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
}

/**
 * Cancellation terms are stored as JSON so the vendor portal can offer structured options in M4.
 * Until then the shape may be empty — say so plainly rather than rendering "{}" or implying terms
 * that do not exist.
 */
function describeCancellation(policy: Record<string, unknown>): string {
  const hours = policy.free_cancellation_hours;
  if (typeof hours === 'number') {
    return `Free cancellation up to ${hours} hours before the experience starts. After that the booking is non-refundable.`;
  }
  if (typeof policy.summary === 'string' && policy.summary.length > 0) return policy.summary;
  return 'Cancellation terms have not been published for this experience yet. They will be shown in full before you pay.';
}

function formatSlot(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
