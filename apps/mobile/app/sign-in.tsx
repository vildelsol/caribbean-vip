import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Sign in / register.
 *
 * Reached only when a requirement needs an account — never as a wall in front of browsing (T-01).
 * "Keep browsing as a guest" is therefore always present and never styled as the lesser option.
 */
export default function SignIn() {
  const [mode, setMode] = useState<'sign_in' | 'register'>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    if (!isSupabaseConfigured) {
      setMessage('This build has no backend configured yet. Browsing still works.');
      return;
    }
    setBusy(true);
    setMessage(null);

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
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: semantic.background, padding: spacing.lg, gap: spacing.md }}>
      <Text style={{ ...typography.title, color: semantic.textPrimary }}>
        {mode === 'sign_in' ? 'Welcome back' : 'Create your account'}
      </Text>
      <Text style={{ ...typography.body, color: semantic.textMuted }}>
        One account works across every island — your trips, vouchers and saved items travel with
        you.
      </Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={semantic.textMuted}
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        style={inputStyle}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={semantic.textMuted}
        secureTextEntry
        textContentType={mode === 'sign_in' ? 'password' : 'newPassword'}
        style={inputStyle}
      />

      <Pressable
        onPress={submit}
        disabled={busy}
        style={{
          backgroundColor: semantic.brandActive,
          borderRadius: radius.md,
          padding: spacing.md,
          alignItems: 'center',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator color={semantic.textOnDark} />
        ) : (
          <Text style={{ ...typography.bodyStrong, color: semantic.textOnDark }}>
            {mode === 'sign_in' ? 'Sign in' : 'Create account'}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={() => setMode(mode === 'sign_in' ? 'register' : 'sign_in')}>
        <Text style={{ ...typography.body, color: semantic.accent, textAlign: 'center' }}>
          {mode === 'sign_in' ? 'Create an account' : 'I already have an account'}
        </Text>
      </Pressable>

      {message ? (
        <Text style={{ ...typography.caption, color: semantic.alert }}>{message}</Text>
      ) : null}

      {/* T-01: browsing never requires an account, so leaving is always an equal option. */}
      <Pressable onPress={() => router.back()} style={{ marginTop: 'auto', padding: spacing.md }}>
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
  fontSize: typography.body.size,
  color: semantic.textPrimary,
} as const;
