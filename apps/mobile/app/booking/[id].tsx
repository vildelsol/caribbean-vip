import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { palette, radius, semantic, spacing, typography } from '@cvip/ui';
import { useIsland } from '../../lib/island';
import {
  cancelBooking,
  cancellationDeadline,
  loadBooking,
  type BookingSummary,
} from '../../lib/booking';
import { approxLocalPerUsd } from '../../lib/localCurrency';
import { demoImage } from '../../lib/demoMedia';
import { Notice } from '../../components/Notice';
import {
  Badge,
  Card,
  Photo,
  PrimaryButton,
  SecondaryButton,
  formatLocalApprox,
  formatUsd,
} from '../../components/kit';

/**
 * Booking confirmation — mockup 10, and the screen a guest lands on straight after paying.
 * T-05 (the booking exists), T-06 (the voucher is one tap away), T-09 (cancel).
 *
 * Deep green with a single tick, exactly as the mockup has it: the one job of this screen is to
 * make it unmistakable that the booking went through. Everything else — the itemized total, the
 * cancellation terms — sits below that reassurance rather than competing with it.
 */
export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { island } = useIsland();
  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const refresh = async () => {
    if (!id) return;
    setBooking(await loadBooking(id));
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, [id]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: semantic.background, justifyContent: 'center' }}>
        <ActivityIndicator color={semantic.brandActive} />
      </View>
    );
  }

  if (!booking) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: semantic.background }}
        contentContainerStyle={{ padding: spacing.lg }}
      >
        <Notice
          tone="muted"
          title="Booking not found"
          body="Demo bookings live in memory and are cleared when the app reloads."
          action={{ label: 'Back to Trips', onPress: () => router.replace('/trips') }}
        />
      </ScrollView>
    );
  }

  const hero = demoImage(booking.heroMediaKey);
  const { cancellable, deadline } = cancellationDeadline(booking);
  const confirmed = booking.status === 'confirmed';
  const local = island
    ? formatLocalApprox(booking.totalMinor, island.currency, approxLocalPerUsd(island.currency) ?? 0)
    : null;

  const doCancel = async () => {
    setCancelling(true);
    await cancelBooking(booking.id);
    setCancelling(false);
    setConfirmingCancel(false);
    await refresh();
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: semantic.background }}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
      >
        {confirmed ? (
          <View
            style={{
              backgroundColor: semantic.brand,
              paddingTop: spacing.xxl,
              paddingBottom: spacing.xl,
              paddingHorizontal: spacing.lg,
              alignItems: 'center',
              gap: spacing.sm,
            }}
          >
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: radius.pill,
                backgroundColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 34, color: palette.success }}>✓</Text>
            </View>
            <Text style={{ ...typography.title, color: semantic.textOnDark, textAlign: 'center' }}>
              Booking Confirmed!
            </Text>
            <Text
              style={{ ...typography.body, color: semantic.textOnDark, textAlign: 'center', opacity: 0.9 }}
            >
              You&rsquo;re all set for an amazing experience.
            </Text>
          </View>
        ) : (
          <View style={{ padding: spacing.lg }}>
            <Notice
              tone="alert"
              title={`Booking ${booking.status.replace(/_/g, ' ')}`}
              body={
                booking.status === 'cancelled'
                  ? 'This booking has been cancelled and its voucher is no longer valid.'
                  : 'This booking is not confirmed, so no voucher has been issued.'
              }
            />
          </View>
        )}

        <View style={{ padding: spacing.lg, gap: spacing.lg, marginTop: confirmed ? -spacing.lg : 0 }}>
          <Card padded={false}>
            {hero ? <Photo source={hero} ratio={16 / 9} radius={0} /> : null}
            <View style={{ padding: spacing.md, gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ ...typography.heading, color: semantic.textPrimary, flex: 1 }}>
                  {booking.experienceTitle}
                </Text>
                {confirmed ? <Badge label="Confirmed" tone="success" /> : null}
              </View>

              {booking.vendorName ? (
                <Text style={{ ...typography.caption, color: semantic.textMuted }}>
                  {booking.vendorName}
                </Text>
              ) : null}

              <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
                {booking.startsAt ? (
                  <IconRow icon="📅" text={formatWhen(booking.startsAt)} />
                ) : null}
                <IconRow
                  icon="👥"
                  text={`${booking.seats} ${booking.seats === 1 ? 'guest' : 'guests'}`}
                />
                <IconRow icon="🎟" text={`Reference ${booking.reference}`} />
              </View>
            </View>
          </Card>

          {confirmed ? (
            <View style={{ gap: spacing.sm }}>
              <PrimaryButton
                label="View my ticket"
                onPress={() => router.push({ pathname: '/voucher/[id]', params: { id: booking.id } })}
                accessibilityLabel="Show your QR voucher"
              />
              <SecondaryButton label="View in Trips" onPress={() => router.replace('/trips')} />
            </View>
          ) : null}

          <Section title="What you paid">
            <Row label="Subtotal" value={formatUsd(booking.subtotalMinor, false)} />
            {booking.promotionTitle ? (
              <Row
                label={booking.promotionTitle}
                value={
                  booking.discountMinor === 0
                    ? 'Included'
                    : `−${formatUsd(booking.discountMinor, false)}`
                }
                muted
              />
            ) : null}
            <Row label="Tax" value={formatUsd(booking.taxMinor, false)} muted />
            <Row label="Service fee" value={formatUsd(booking.serviceFeeMinor, false)} muted />
            <View style={{ height: 1, backgroundColor: semantic.border, marginVertical: spacing.xs }} />
            <Row label="Total" value={formatUsd(booking.totalMinor)} strong />
            {local ? (
              <Text style={{ ...typography.caption, color: semantic.textMuted, textAlign: 'right' }}>
                {local} · charged in USD
              </Text>
            ) : null}
          </Section>

          <Section title="Cancellation">
            {cancellable && deadline ? (
              <>
                <Text style={{ ...typography.body, color: semantic.textPrimary }}>
                  Free cancellation until {formatWhen(deadline.toISOString())}.
                </Text>
                {confirmingCancel ? (
                  <View style={{ gap: spacing.sm }}>
                    <Text style={{ ...typography.body, color: semantic.textPrimary }}>
                      Cancel this booking? The voucher will stop working and the places go back on
                      sale.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Pressable
                        onPress={() => void doCancel()}
                        disabled={cancelling}
                        accessibilityRole="button"
                        accessibilityLabel="Confirm cancellation"
                        style={{
                          flex: 1,
                          backgroundColor: semantic.alert,
                          borderRadius: radius.md,
                          padding: spacing.md,
                          alignItems: 'center',
                        }}
                      >
                        {cancelling ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text style={{ ...typography.bodyStrong, color: '#FFFFFF' }}>
                            Yes, cancel it
                          </Text>
                        )}
                      </Pressable>
                      <View style={{ flex: 1 }}>
                        <SecondaryButton label="Keep it" onPress={() => setConfirmingCancel(false)} />
                      </View>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setConfirmingCancel(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel this booking"
                    style={{
                      borderWidth: 1,
                      borderColor: semantic.alert,
                      borderRadius: radius.md,
                      padding: spacing.md,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ ...typography.bodyStrong, color: semantic.alert }}>
                      Cancel this booking
                    </Text>
                  </Pressable>
                )}
              </>
            ) : (
              <Text style={{ ...typography.body, color: semantic.textMuted }}>
                {booking.status === 'cancelled'
                  ? 'This booking has been cancelled.'
                  : `The free cancellation window (${booking.cancellationHours} hours before departure) has passed.`}
              </Text>
            )}
          </Section>
        </View>
      </ScrollView>
    </>
  );
}

function IconRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Text style={{ fontSize: 14 }}>{icon}</Text>
      <Text style={{ ...typography.body, color: semantic.textPrimary, flex: 1 }}>{text}</Text>
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

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  const style = strong ? typography.bodyStrong : muted ? typography.caption : typography.body;
  const color = muted ? semantic.textMuted : semantic.textPrimary;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
      <Text style={{ ...style, color, flex: 1 }}>{label}</Text>
      <Text style={{ ...style, color }}>{value}</Text>
    </View>
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
