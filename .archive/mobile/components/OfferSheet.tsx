import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { palette, radius, semantic, spacing, typography } from '@cvip/ui';
import { GoldButton, Icon, PrimaryButton, TextLink } from './kit';

/**
 * The "Special Offer Unlocked" popup — mockup screen 4, and PRD §8's saved-offer flow.
 *
 * A real modal rather than an inline banner, because the offer is time-limited and the mockups
 * treat it as an interruption worth making. Two ways out, both explicit: save it, or dismiss it.
 * There is no way to accidentally consume the offer by tapping the backdrop.
 *
 * The QR here is the OFFER code, not a voucher token. It carries no booking, no identity and no
 * signature, because an offer code is a public marketing artefact — the thing that must not be
 * forgeable is the booking voucher, which is HMAC-signed and lives on the voucher screen (AD-04).
 * Keeping the two visually similar but cryptographically different is deliberate; conflating them
 * would be the security mistake.
 */
export function OfferSheet({
  visible,
  title,
  terms,
  vendorName,
  experienceTitle,
  saved,
  onSave,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  terms: string;
  vendorName: string | null;
  experienceTitle: string;
  saved: boolean;
  onSave: () => void;
  onDismiss: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(12,43,37,0.62)',
          justifyContent: 'center',
          padding: spacing.lg,
          // react-native-web renders a Modal into the same stacking context as the page, so the
          // detail screen's absolutely-positioned action bar paints over the popup without this.
          zIndex: 100,
        }}
      >
        <View
          style={{
            backgroundColor: palette.ivory,
            borderRadius: radius.xl,
            maxHeight: '88%',
            overflow: 'hidden',
          }}
        >
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={onDismiss}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close this offer"
              >
                <Icon name="x" size={20} color={semantic.textMuted} />
              </Pressable>
            </View>

            {/* The mockup's masthead: a gold-ringed disc, then "TODAY ONLY!" in small gold caps,
                then the offer itself set large in the display serif. The serif is the point — it
                is the only place in the app where a headline is allowed to be this loud. */}
            <View style={{ alignItems: 'center', gap: spacing.sm, marginTop: -spacing.sm }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: radius.pill,
                  borderWidth: 2,
                  borderColor: palette.gold,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="gift" size={30} color={palette.gold} />
              </View>
              <Text
                style={{
                  ...typography.overline,
                  fontSize: 12,
                  color: palette.goldDeep,
                  textAlign: 'center',
                }}
              >
                TODAY ONLY!
              </Text>
              <Text
                style={{
                  ...typography.display,
                  fontSize: 27,
                  lineHeight: 34,
                  color: palette.green950,
                  textAlign: 'center',
                }}
              >
                {title}
              </Text>
              <Text
                style={{ ...typography.caption, color: semantic.textMuted, textAlign: 'center' }}
              >
                with any {experienceTitle} booking
                {vendorName ? ` · ${vendorName}` : ''}
              </Text>
            </View>

            <View
              style={{
                alignItems: 'center',
                gap: spacing.sm,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: semantic.border,
                borderRadius: radius.md,
                padding: spacing.lg,
              }}
            >
              <Text style={{ ...typography.caption, fontSize: 13, color: palette.inkMuted }}>
                Show this code at check-in
              </Text>
              <QRCode value="cvip-offer:rum-punch" size={104} color={palette.ink} backgroundColor="#FFFFFF" />
              <Text
                style={{ ...typography.bodyStrong, color: palette.ink, letterSpacing: 2 }}
                selectable
              >
                RUM2024
              </Text>
              <Text style={{ ...typography.caption, fontSize: 12, color: palette.inkMuted }}>
                Valid today only · one per booking
              </Text>
            </View>

            {/* The terms are not optional — this is a real offer with real conditions — but they
                are set small and last, as the mockup does. */}
            <Text
              style={{
                ...typography.caption,
                fontSize: 11,
                lineHeight: 16,
                color: semantic.textMuted,
              }}
            >
              {terms}
            </Text>

            {/* The mockup's action is the gold pill, with an underlined "Maybe Later" beneath. */}
            {saved ? (
              <PrimaryButton label="Saved to My Vouchers" onPress={onSave} disabled />
            ) : (
              <GoldButton label="Save Voucher" onPress={onSave} />
            )}
            <TextLink label="Maybe Later" onPress={onDismiss} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
