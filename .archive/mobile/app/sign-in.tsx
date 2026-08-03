import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isDemoMode } from '../lib/mode';
import { DEMO_CREDENTIALS } from '../lib/demoAccount';
import { useSession } from '../lib/session';
import { Icon, PrimaryButton, ScreenTitle, TextLink } from '../components/kit';

/**
 * Sign in / register.
 *
 * Reached only when a requirement needs an account — never as a wall in front of browsing (T-01).
 * "Keep browsing as a guest" is therefore always present and never styled as the lesser option.
 *
 * In demo mode the screen also offers the presentation test account (see `lib/demoAccount.ts`).
 * It is labelled as a demonstration login rather than dressed up as a real one: no hosted Supabase
 * project exists yet, so there is nothing to authenticate against, and a login screen that appears
 * to work against a backend that does not exist is the kind of thing a room remembers wrongly.
 */
export default function SignIn() {
  const { signInWithDemoAccount } = useSession();

  /**
   * Leaving the screen, whichever way you arrived.
   *
   * Welcome reaches sign-in with `router.replace`, so there is no history entry behind it and a
   * bare `router.back()` does nothing at all — signing in from the splash screen stranded you on
   * the sign-in form with no way out. Falling through to Explore is the correct destination in
   * both cases anyway.
   */
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const [mode, setMode] = useState<'sign_in' | 'register'>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setMessage(null);

    // The demo account is checked first, so typing the printed credentials into the real form
    // works exactly as a presenter would expect it to.
    if (isDemoMode && signInWithDemoAccount(email, password)) {
      leave();
      return;
    }

    if (!isSupabaseConfigured) {
      setMessage(
        isDemoMode
          ? 'That is not the demo account. Use the button below, or browse as a guest.'
          : 'This build has no backend configured yet. Browsing still works.',
      );
      return;
    }

    setBusy(true);
    const { error } =
      mode === 'sign_in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }
    if (mode === 'register') {
      setMessage('Check your email to confirm your account, then sign in.');
      return;
    }
    leave();
  }

  const useDemoAccount = () => {
    setEmail(DEMO_CREDENTIALS.email);
    setPassword(DEMO_CREDENTIALS.password);
    if (signInWithDemoAccount(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)) leave();
  };

  return (
    <View
      style={{ flex: 1, backgroundColor: semantic.background, padding: spacing.lg, gap: spacing.md }}
    >
      <ScreenTitle
        title={mode === 'sign_in' ? 'Welcome back' : 'Create your account'}
        subtitle="One account works across every island — your trips, vouchers and saved items travel with you."
      />

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={semantic.textMuted}
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        accessibilityLabel="Email"
        style={inputStyle}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={semantic.textMuted}
        secureTextEntry
        textContentType={mode === 'sign_in' ? 'password' : 'newPassword'}
        accessibilityLabel="Password"
        style={inputStyle}
      />

      {busy ? (
        <View style={{ paddingVertical: spacing.md, alignItems: 'center' }}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      ) : (
        <PrimaryButton
          label={mode === 'sign_in' ? 'Sign in' : 'Create account'}
          onPress={() => void submit()}
        />
      )}

      <TextLink
        label={mode === 'sign_in' ? 'Create an account' : 'I already have an account'}
        onPress={() => setMode(mode === 'sign_in' ? 'register' : 'sign_in')}
      />

      {message ? (
        <Text style={{ ...typography.caption, color: semantic.alert }}>{message}</Text>
      ) : null}

      {/* The presentation account. Only ever rendered in demo mode. */}
      {isDemoMode ? (
        <View
          style={{
            marginTop: spacing.sm,
            gap: spacing.sm,
            backgroundColor: semantic.surfaceSunken,
            borderWidth: 1,
            borderColor: semantic.border,
            borderRadius: radius.lg,
            padding: spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Icon name="key" size={16} color={semantic.textAccent} />
            <Text style={{ ...typography.overline, fontSize: 11, color: semantic.textAccent }}>
              PRESENTATION TEST ACCOUNT
            </Text>
          </View>

          <Text style={{ ...typography.caption, fontSize: 13, color: semantic.textMuted }}>
            Signs in a sample tourist so the signed-in screens can be shown. There is no backend
            behind it and no real account is created.
          </Text>

          <View style={{ gap: 2 }}>
            <Text selectable style={{ ...typography.captionStrong, color: semantic.textPrimary }}>
              {DEMO_CREDENTIALS.email}
            </Text>
            <Text selectable style={{ ...typography.captionStrong, color: semantic.textPrimary }}>
              {DEMO_CREDENTIALS.password}
            </Text>
          </View>

          <Pressable
            onPress={useDemoAccount}
            accessibilityRole="button"
            accessibilityLabel="Sign in with the presentation test account"
            style={({ pressed }) => ({
              borderWidth: 1.5,
              borderColor: semantic.accent,
              borderRadius: radius.pill,
              paddingVertical: spacing.sm + 2,
              alignItems: 'center',
              backgroundColor: pressed ? semantic.surface : 'transparent',
            })}
          >
            <Text style={{ ...typography.captionStrong, color: semantic.accent }}>
              Sign in as demo tourist
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* T-01: browsing never requires an account, so leaving is always an equal option. */}
      <Pressable onPress={leave} style={{ marginTop: 'auto', padding: spacing.md }}>
        <Text style={{ ...typography.body, color: semantic.textMuted, textAlign: 'center' }}>
          Keep browsing as a guest
        </Text>
      </Pressable>
    </View>
  );
}

const inputStyle = {
  backgroundColor: semantic.surface,
  borderWidth: 1,
  borderColor: semantic.border,
  borderRadius: radius.md,
  padding: spacing.md,
  fontSize: typography.body.fontSize,
  fontFamily: typography.body.fontFamily,
  color: semantic.textPrimary,
} as const;
