import { Pressable, Text, View } from 'react-native';
import { radius, semantic, spacing, typography } from '@cvip/ui';

/**
 * Inline explanatory state.
 *
 * PRD §14 requires graceful states for missing permissions, failed maps, failed AI, pending
 * payment and poor connectivity. Having one component for all of them means a degraded state is
 * cheap to add correctly, rather than being skipped because it was fiddly.
 */
export function Notice({
  tone,
  title,
  body,
  onRetry,
  action,
}: {
  tone: 'alert' | 'muted' | 'info';
  title: string;
  body: string;
  onRetry?: () => void;
  action?: { label: string; onPress: () => void };
}) {
  const titleColor =
    tone === 'alert' ? semantic.alert : tone === 'info' ? semantic.accent : semantic.textMuted;

  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: semantic.surfaceSunken,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <Text style={{ ...typography.bodyStrong, color: titleColor }}>{title}</Text>
      <Text style={{ ...typography.caption, color: semantic.textMuted }}>{body}</Text>

      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" style={buttonStyle}>
          <Text style={{ ...typography.body, color: semantic.accent }}>Try again</Text>
        </Pressable>
      ) : null}

      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" style={buttonStyle}>
          <Text style={{ ...typography.body, color: semantic.accent }}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const buttonStyle = {
  backgroundColor: semantic.surface,
  borderWidth: 1,
  borderColor: semantic.border,
  borderRadius: radius.sm,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  alignSelf: 'flex-start',
} as const;
