import { Text, View } from 'react-native';
import { semantic, spacing, typography } from '@cvip/ui';
import { isDemoMode, isMisconfigured } from '../lib/mode';

/**
 * Persistent demo-mode banner.
 *
 * Operating rule 9 forbids presenting demo content as live. A label on individual cards is not
 * enough when the entire backend is simulated — someone screenshotting a checkout screen needs to
 * see it there too, so this sits above every screen.
 */
export function DemoBanner() {
  if (isMisconfigured) {
    return (
      <View style={{ backgroundColor: semantic.alert, padding: spacing.sm }}>
        <Text style={{ ...typography.caption, color: '#FFFFFF', textAlign: 'center' }}>
          Not configured — production build with no backend. Set SUPABASE_URL and SUPABASE_ANON_KEY.
        </Text>
      </View>
    );
  }

  if (!isDemoMode) return null;

  return (
    <View style={{ backgroundColor: semantic.premium, paddingVertical: 6, paddingHorizontal: spacing.md }}>
      <Text style={{ ...typography.caption, color: semantic.brand, textAlign: 'center' }}>
        DEMO MODE · sample data, no real payments, nothing is charged
      </Text>
    </View>
  );
}
