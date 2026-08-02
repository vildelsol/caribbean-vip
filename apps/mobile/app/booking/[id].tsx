import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import {
  cancelBooking,
  cancellationDeadline,
  loadBooking,
  type BookingSummary,
} from '../../lib/booking';
import { demoImage } from '../../lib/demoMedia';
import { formatFrom } from '../../components/ExperienceCard';
import { Notice } from '../../components/Notice';

/**
 * Booking confirmation — the screen a guest lands on straight after paying, and returns to from
 * Trips. T-05 (the booking exists), T-06 (the voucher is one tap away), T-09 (cancel).
 *
 * The reference is the largest thing on the page on purpose: it is what a guest reads out on the
 * phone when something goes wrong, and it is the only identifier that means anything to a vendor.
 */
export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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

  const doCancel = async () => {
    setCancelling(true);
    await cancelBooking(booking.id);
    setCancelling(false);
    setConfirmingCancel(false);
    await refresh();
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Your booking' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: semantic.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}
      >
        {confirmed ? (
          <View
            style={{
              backgroundColor: semantic.brand,
              borderRadius: radius.lg,
              padding: spacing.lg,
              gap: spacing.xs,
            }}
          >
            <Text style={{ ...typography.caption, color: semantic.premium }}>CONFIRMED</Text>
            <Text style={{ ...typography.caption, color: semantic.textOnDark }}>
              Booking reference
            </Text>
            <Text
              style={{ ...typography.display, color: semantic.textOnDark, letterSpacing: 1 }}
              accessibilityLabel={`Booking reference ${booking.reference.split('').join(' ')}`}
              selectable
            >
              {booking.reference}
            </Text>
          </View>
        ) : (
          <Notice
            tone="alert"
            title={`Booking ${booking.status.replace(/_/g, ' ')}`}
            body={
              booking.status === 'cancelled'
                ? 'This booking has been cancelled and its voucher is no longer valid.'
                : 'This booking is not confirmed, so no voucher has been issued.'
            }
          />
        )}

        {hero ? (
          <View
            style={{
              width: '100%',
              aspectRatio: 16 / 9,
              borderRadius: radius.md,
              overflow: 'hidden',
              backgroundColor: semantic.surfaceSunken,
            }}
          >
            <Image
              source={hero}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
              accessible={false}
            />
          </View>
        ) : null}

        <View style={{ gap: spacing.xs }}>
          <Text style={{ ...typography.heading, color: semantic.textPrimary }}>
            {booking.experienceTitle}
          </Text>
          {booking.vendorName ? (
            <Text style={{ ...typography.caption, color: semantic.textMuted }}>
              {booking.vendorName}
            </Text>
          ) : null}
          {booking.startsAt ? (
            <Text style={{ ...typography.body, color: semantic.textPrimary }}>
              {formatWhen(booking.startsAt)}
            </Text>
          ) : null}
          <Text style={{ ...typography.caption, color: semantic.textMuted }}>
            {booking.seats} {booking.seats === 1 ? 'guest' : 'guests'}
          </Text>
        </View>

        {confirmed ? (
          <Pressable
            onPress={() => router.push({ pathname: '/voucher/[id]', params: { id: booking.id } })}
            accessibilityRole="button"
            accessibilityLabel="Show your voucher"
            style={{
              backgroundColor: semantic.brand,
              borderRadius: radius.md,
              padding: spacing.md,
              alignItems: 'center',
            }}
          >
            <Text style={{ ...typography.bodyStrong, color: semantic.textOnDark }}>
              Show my voucher
            </Text>
          </Pressable>
        ) : null}

        <Section title="What you paid">
          <Row label="Subtotal" value={formatFrom(booking.subtotalMinor, booking.currency)} />
          {booking.promotionTitle ? (
            <Row
              label={booking.promotionTitle}
              value={booking.discountMinor === 0 ? 'Included' : `−${formatFrom(booking.discountMinor, booking.currency)}`}
              muted
            />
          ) : null}
          <Row label="Tax" value={formatFrom(booking.taxMinor, booking.currency)} muted />
          <Row
            label="Service fee"
            value={formatFrom(booking.serviceFeeMinor, booking.currency)}
            muted
          />
          <View style={{ height: 1, backgroundColor: semantic.border, marginVertical: spacing.xs }} />
          <Row label="Total" value={formatFrom(booking.totalMinor, booking.currency)} strong />
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
                    <Pressable
                      onPress={() => setConfirmingCancel(false)}
                      accessibilityRole="button"
                      accessibilityLabel="Keep this booking"
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: semantic.border,
                        borderRadius: radius.md,
                        padding: spacing.md,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                        Keep it
                      </Text>
                    </Pressable>
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

        <Pressable
          onPress={() => router.replace('/trips')}
          accessibilityRole="button"
          style={{ padding: spacing.md, alignItems: 'center' }}
        >
          <Text style={{ ...typography.body, color: semantic.accent }}>Back to Trips</Text>
        </Pressable>
      </ScrollView>
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
