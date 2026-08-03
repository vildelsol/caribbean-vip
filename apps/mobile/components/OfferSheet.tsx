import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { palette, radius, semantic, spacing, typography } from '@cvip/ui';
import { Badge, PrimaryButton } from './kit';

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
          backgroundColor: 'rgba(18,33,29,0.55)',
          justifyContent: 'center',
          padding: spacing.lg,
        }}
      >
        <View
          style={{
            backgroundColor: semantic.surface,
            borderRadius: radius.lg,
            maxHeight: '88%',
            overflow: 'hidden',
          }}
        >
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Badge label="Special Offer Unlocked" tone="offer" />
              </View>
              <Pressable
                onPress={onDismiss}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close this offer"
              >
                <Text style={{ fontSize: 22, color: semantic.textMuted }}>×</Text>
              </Pressable>
            </View>

            <View style={{ alignItems: 'center', gap: spacing.xs }}>
              <Text style={{ fontSize: 40 }}>🍹</Text>
              <Text
                style={{ ...typography.title, color: semantic.textPrimary, textAlign: 'center' }}
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
              <Text style={{ ...typography.caption, color: palette.inkMuted }}>
                Show this code at check-in
              </Text>
              <QRCode value="cvip-offer:rum-punch" size={132} color={palette.ink} backgroundColor="#FFFFFF" />
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

            <Text style={{ ...typography.caption, fontSize: 12, color: semantic.textMuted }}>
              {terms}
            </Text>

            <PrimaryButton
              label={saved ? 'Saved to My Vouchers' : 'Save to My Vouchers'}
              onPress={onSave}
              disabled={saved}
            />
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              style={{ alignItems: 'center', paddingVertical: spacing.sm }}
            >
              <Text style={{ ...typography.body, color: semantic.textMuted }}>Maybe later</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
