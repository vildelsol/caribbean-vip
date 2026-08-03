import { Text, View } from 'react-native';
import { semantic, spacing, typography } from '@cvip/ui';
import { isDemoMode, isMisconfigured } from '../lib/mode';

/**
 * Persistent demo-mode banner.
 *
 * Operating rule 9 forbids presenting demo content as live. A label on individual cards is not
 * enough when the entire backend is simulated — someone screenshotting a checkout screen needs to
 * see it there too, so this sits above every screen.
 *
 * It is now a single hairline-separated strip rather than the two-line gold slab it was. That slab
 * was ~100px of the viewport, sat where the mockup's status bar goes, and was the first thing in
 * every screenshot — it dominated the design it was supposed to annotate. The wording is unchanged
 * and it is still on every screen; only its weight is dialled back to match the chrome around it.
 */
export function DemoBanner() {
  if (isMisconfigured) {
    return (
      <View style={{ backgroundColor: semantic.alert, padding: spacing.sm }}>
        <Text style={{ ...typography.caption, color: semantic.textOnDark, textAlign: 'center' }}>
          Not configured — production build with no backend. Set SUPABASE_URL and SUPABASE_ANON_KEY.
        </Text>
      </View>
    );
  }

  if (!isDemoMode) return null;

  return (
    <View
      style={{
        backgroundColor: semantic.surfaceSunken,
        borderBottomWidth: 1,
        borderBottomColor: semantic.border,
        paddingVertical: 5,
        paddingHorizontal: spacing.md,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          ...typography.overline,
          fontSize: 9.5,
          letterSpacing: 0.8,
          color: semantic.textAccent,
          textAlign: 'center',
        }}
      >
        DEMO MODE · SAMPLE DATA · NOTHING IS CHARGED
      </Text>
    </View>
  );
}
