'use client';

import { useState, type ReactNode } from 'react';
import { semantic, spacing, radius } from '@cvip/ui';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAdminSession } from '../lib/session';

/**
 * Sign-in gate for the admin console.
 *
 * This check is a convenience, not the security boundary: every admin-only table is protected by
 * an RLS policy calling is_admin(), so a non-admin who got past this component would still read
 * nothing. PRD §4 also makes this "a restricted role with strong authentication" — MFA is an M8
 * hardening item, recorded rather than assumed.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session, isAdmin, role, signOut } = useAdminSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!isSupabaseConfigured) {
    return (
      <Panel title="No backend configured">
        <p style={{ color: semantic.textMuted }}>
          Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{' '}
          in <code>apps/admin-web/.env</code>. See <code>docs/setup.md</code>.
        </p>
      </Panel>
    );
  }

  if (loading) return <Panel title="Loading…">{null}</Panel>;

  if (!session) {
    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setMessage(null);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) setMessage(error.message);
    };

    return (
      <Panel title="Admin sign in">
        <form onSubmit={submit} style={{ display: 'grid', gap: spacing.sm }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 14, color: semantic.textMuted }}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 14, color: semantic.textMuted }}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={inputStyle}
            />
          </label>
          <button type="submit" disabled={busy} style={buttonStyle}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {message ? <p style={{ color: semantic.alert, fontSize: 14 }}>{message}</p> : null}
        </form>
      </Panel>
    );
  }

  // `role === null` means the profile has not loaded yet; only a loaded non-admin role is a
  // refusal. Treating null as "not admin" would flash this screen at every legitimate admin.
  if (role !== null && !isAdmin) {
    return (
      <Panel title="Not an administrator">
        <p style={{ color: semantic.textMuted }}>
          This account does not have platform administrator access. Ask a super administrator to
          grant it — roles cannot be self-assigned.
        </p>
        <button type="button" onClick={() => void signOut()} style={buttonStyle}>
          Sign out
        </button>
      </Panel>
    );
  }

  if (role === null) return <Panel title="Checking access…">{null}</Panel>;

  return <>{children}</>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main style={{ maxWidth: 420, margin: '10vh auto', padding: spacing.xl }}>
      <p style={{ color: semantic.textMuted, margin: 0, fontSize: 14 }}>Caribbean VIP</p>
      <h1 style={{ color: semantic.brand, marginTop: 4 }}>{title}</h1>
      {children}
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: spacing.sm,
  fontSize: 16,
  border: `1px solid ${semantic.border}`,
  borderRadius: radius.sm,
  background: semantic.surface,
  color: semantic.textPrimary,
};

const buttonStyle: React.CSSProperties = {
  padding: spacing.sm,
  fontSize: 16,
  fontWeight: 600,
  color: semantic.textOnDark,
  background: semantic.brandActive,
  border: 'none',
  borderRadius: radius.sm,
  cursor: 'pointer',
};
