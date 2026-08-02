import type { ReactNode } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import type { ProfileRow } from '@cvip/supabase';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { isDemoMode } from '../../lib/mode';
import { useSession } from '../../lib/session';
import { useIsland } from '../../lib/island';

/**
 * Bottom padding that clears the floating tab bar.
 *
 * The Irie AI button sits proud of the bar (PRD §16 puts it at the centre of five tabs), so
 * without this the last card is partly underneath it — unreadable and untappable.
 */
const TAB_BAR_CLEARANCE = spacing.xxl * 2;

/**
 * Profile, preferences and privacy controls.
 *
 * PRD §14 requires controls to disable location-based offers and clear Irie AI history, so both
 * live here from M1 rather than arriving with the features they govern — a consent switch that
 * appears only after the feature ships was missing when it mattered.
 *
 * T-07 needs two independent flags, shown as two separate switches on purpose: granting the OS
 * location permission is not agreement to receive marketing, and each must be revocable alone.
 */
export default function Profile() {
  const { state, profile, signOut, refreshProfile } = useSession();
  const { islandBrand, island, destination } = useIsland();

  async function setConsent(patch: Partial<ProfileRow>) {
    if (!profile) return;
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id);
    if (error) console.warn('[profile] could not save consent:', error.message);
    else await refreshProfile();
  }

  async function clearAiHistory() {
    if (!profile) return;
    const { error } = await supabase.from('ai_conversations').delete().eq('user_id', profile.id);
    if (error) console.warn('[profile] could not clear AI history:', error.message);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: semantic.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: TAB_BAR_CLEARANCE }}
    >
      <View style={{ gap: spacing.xs }}>
        <Text style={{ ...typography.caption, color: semantic.textMuted }}>{islandBrand}</Text>
        <Text style={{ ...typography.display, color: semantic.textPrimary }}>
          {state === 'authenticated' ? (profile?.display_name ?? 'Your profile') : 'Guest'}
        </Text>
        <Text style={{ ...typography.body, color: semantic.textMuted }}>
          {island?.name ?? 'No island selected'}
          {destination ? ` · ${destination.name}` : ''}
        </Text>
      </View>

      {state === 'guest' ? (
        <Card>
          <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
            You are browsing as a guest
          </Text>
          <Text style={{ ...typography.caption, color: semantic.textMuted }}>
            Everything you see is available without an account. Sign in when you want to book, save
            an offer, or keep your trips.
          </Text>
          <Link href="/sign-in" asChild>
            <Pressable style={primaryButton}>
              <Text style={{ ...typography.bodyStrong, color: semantic.textOnDark }}>
                Sign in or create an account
              </Text>
            </Pressable>
          </Link>
        </Card>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Text style={{ ...typography.heading, color: semantic.textPrimary }}>Privacy</Text>

        <ConsentRow
          label="Use my location"
          detail="Powers the Nearby tab. Nearby also works without it — you can pick a destination by hand."
          value={profile?.location_consent ?? false}
          disabled={!profile}
          onChange={(v) => void setConsent({ location_consent: v })}
        />

        <ConsentRow
          label="Send me nearby offers"
          detail="Separate from the permission above. Both must be on before any location is used for offers."
          value={profile?.offer_consent ?? false}
          disabled={!profile}
          onChange={(v) => void setConsent({ offer_consent: v })}
        />

        <ConsentRow
          label="Notifications"
          detail="Booking confirmations and voucher reminders."
          value={profile?.notification_consent ?? false}
          disabled={!profile}
          onChange={(v) => void setConsent({ notification_consent: v })}
        />

        {profile ? (
          <Pressable onPress={() => void clearAiHistory()} style={secondaryButton}>
            <Text style={{ ...typography.body, color: semantic.alert }}>Clear Irie AI history</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ ...typography.heading, color: semantic.textPrimary }}>Destination</Text>
        <Link href="/select-destination" asChild>
          <Pressable style={secondaryButton}>
            <Text style={{ ...typography.body, color: semantic.accent }}>
              Change island or destination
            </Text>
          </Pressable>
        </Link>
      </View>

      {state === 'authenticated' ? (
        <Pressable onPress={() => void signOut()} style={secondaryButton}>
          <Text style={{ ...typography.body, color: semantic.alert }}>Sign out</Text>
        </Pressable>
      ) : null}

      {!isSupabaseConfigured ? (
        <Text style={{ ...typography.caption, color: semantic.alert }}>
          {isDemoMode
            ? 'Demo mode — preferences last until you reload.'
            : 'No backend configured — preferences cannot be saved in this build.'}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function ConsentRow({
  label,
  detail,
  value,
  disabled,
  onChange,
}: {
  label: string;
  detail: string;
  value: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary, flex: 1 }}>
          {label}
        </Text>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ true: semantic.brandActive, false: semantic.border }}
        />
      </View>
      <Text style={{ ...typography.caption, color: semantic.textMuted }}>{detail}</Text>
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: semantic.surface,
        borderWidth: 1,
        borderColor: semantic.border,
        borderRadius: radius.lg,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      {children}
    </View>
  );
}

const primaryButton = {
  backgroundColor: semantic.brandActive,
  borderRadius: radius.md,
  padding: spacing.md,
  alignItems: 'center',
} as const;

const secondaryButton = {
  backgroundColor: semantic.surface,
  borderWidth: 1,
  borderColor: semantic.border,
  borderRadius: radius.md,
  padding: spacing.md,
  alignItems: 'center',
} as const;
