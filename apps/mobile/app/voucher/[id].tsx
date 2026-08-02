import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { palette, radius, semantic, spacing, typography } from '@cvip/ui';
import {
  loadBooking,
  loadVoucher,
  type BookingSummary,
  type VoucherSummary,
} from '../../lib/booking';
import { Notice } from '../../components/Notice';

/**
 * The voucher — T-06.
 *
 * Two things a vendor needs and a guest cannot always provide: a QR the scanner can read, and a
 * human-readable reference for when the camera will not cooperate, the screen is cracked, or the
 * phone is dead and the guest has a screenshot on someone else's. Both are on this screen, and the
 * reference is large enough to read out loud.
 *
 * The QR encodes the signed token itself — a version byte and a random 128-bit id, HMAC-signed
 * (AD-04). It carries no booking id, no name and no price, so photographing someone's screen
 * reveals nothing about them.
 */
export default function VoucherScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [voucher, setVoucher] = useState<VoucherSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void (async () => {
      const [b, v] = await Promise.all([loadBooking(id), loadVoucher(id)]);
      if (!active) return;
      setBooking(b);
      setVoucher(v);
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

  if (!booking || !voucher) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: semantic.background }}
        contentContainerStyle={{ padding: spacing.lg }}
      >
        <Notice
          tone="muted"
          title="No voucher for this booking"
          body="A voucher is issued once a booking is confirmed and paid. Demo bookings are cleared when the app reloads."
          action={{ label: 'Back to Trips', onPress: () => router.replace('/trips') }}
        />
      </ScrollView>
    );
  }

  const redeemed = voucher.state === 'redeemed';
  const expired = voucher.state === 'expired' || new Date(voucher.validUntil).getTime() <= Date.now();
  const usable = !redeemed && !expired;

  return (
    <>
      <Stack.Screen options={{ title: 'Your voucher' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: semantic.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}
      >
        <View style={{ gap: spacing.xs }}>
          <Text style={{ ...typography.heading, color: semantic.textPrimary }}>
            {booking.experienceTitle}
          </Text>
          {booking.startsAt ? (
            <Text style={{ ...typography.body, color: semantic.textMuted }}>
              {formatWhen(booking.startsAt)}
            </Text>
          ) : null}
          <Text style={{ ...typography.caption, color: semantic.textMuted }}>
            {booking.seats} {booking.seats === 1 ? 'guest' : 'guests'} ·{' '}
            {booking.vendorName ?? 'Vendor'}
          </Text>
        </View>

        {redeemed ? (
          <Notice
            tone="alert"
            title="Already redeemed"
            body={`This voucher was scanned on ${
              voucher.redeemedAt ? formatWhen(voucher.redeemedAt) : 'an earlier date'
            }${voucher.redeemedBy ? ` by ${voucher.redeemedBy}` : ''}. It cannot be used again.`}
          />
        ) : expired ? (
          <Notice
            tone="alert"
            title="Voucher expired"
            body={`This voucher was valid until ${formatWhen(voucher.validUntil)}.`}
          />
        ) : null}

        {/* White card behind the QR whatever the theme does: scanners need the quiet zone and the
            contrast, and the sand background is not white enough to rely on. */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: radius.lg,
            padding: spacing.lg,
            alignItems: 'center',
            gap: spacing.md,
            opacity: usable ? 1 : 0.35,
            borderWidth: 1,
            borderColor: semantic.border,
          }}
        >
          <QRCode
            value={voucher.token}
            size={240}
            color={palette.ink}
            backgroundColor="#FFFFFF"
            // Level M survives a fingerprint or a bit of glare on a phone screen without making the
            // modules so small that a cheap scanner struggles.
            ecl="M"
          />
          <View style={{ alignItems: 'center', gap: spacing.xs }}>
            <Text style={{ ...typography.caption, color: palette.inkMuted }}>
              Booking reference
            </Text>
            <Text
              style={{ ...typography.title, color: palette.ink, letterSpacing: 2 }}
              accessibilityLabel={`Booking reference ${booking.reference.split('').join(' ')}`}
              selectable
            >
              {booking.reference}
            </Text>
          </View>
        </View>

        {usable ? (
          <Text style={{ ...typography.body, color: semantic.textPrimary, textAlign: 'center' }}>
            Show this to your vendor. Turn your screen brightness up.
          </Text>
        ) : null}

        <Text style={{ ...typography.caption, color: semantic.textMuted, textAlign: 'center' }}>
          Valid until {formatWhen(voucher.validUntil)}
        </Text>

        {/* The paste-a-token fallback is what makes the vendor scanner demonstrable on a laptop
            with no camera — and, on a real trip, what saves a guest whose QR will not scan. */}
        <View style={{ gap: spacing.sm }}>
          <Pressable
            onPress={() => setShowToken((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={showToken ? 'Hide voucher code' : 'Show voucher code'}
            style={{
              borderWidth: 1,
              borderColor: semantic.border,
              borderRadius: radius.md,
              padding: spacing.md,
              alignItems: 'center',
            }}
          >
            <Text style={{ ...typography.body, color: semantic.accent }}>
              {showToken ? 'Hide voucher code' : "QR will not scan? Show the code"}
            </Text>
          </Pressable>

          {showToken ? (
            <View
              style={{
                backgroundColor: semantic.surfaceSunken,
                borderRadius: radius.md,
                padding: spacing.md,
                gap: spacing.xs,
              }}
            >
              <Text
                selectable
                style={{
                  ...typography.caption,
                  color: semantic.textPrimary,
                  fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
                }}
              >
                {voucher.token}
              </Text>
              <Text style={{ ...typography.caption, color: semantic.textMuted }}>
                Your vendor can type or paste this into their scanner.
              </Text>
            </View>
          ) : null}
        </View>

        <Pressable
          onPress={() => router.replace({ pathname: '/booking/[id]', params: { id: booking.id } })}
          accessibilityRole="button"
          style={{ padding: spacing.md, alignItems: 'center' }}
        >
          <Text style={{ ...typography.body, color: semantic.accent }}>Booking details</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
