'use client';

import { useState, type ReactNode } from 'react';
import { semantic, spacing, radius } from '@cvip/ui';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useVendorSession } from '../lib/session';

/**
 * Sign-in gate for the vendor portal.
 *
 * The portal has no public surface, so unlike the tourist app this really is a gate. It still
 * degrades honestly: with no backend configured it says so rather than showing a login form that
 * cannot work.
 *
 * A signed-in user with no vendor membership sees an explanatory state, not an empty dashboard —
 * that is the normal condition between registering and being approved (V-01, V-02).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session, memberships } = useVendorSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!isSupabaseConfigured) {
    return (
      <Panel title="No backend configured">
        <p style={{ color: semantic.textMuted }}>
          Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{' '}
          in <code>apps/vendor-web/.env</code>. See <code>docs/setup.md</code>.
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
      <Panel title="Vendor sign in">
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

  if (memberships.length === 0) {
    return (
      <Panel title="No vendor organization yet">
        <p style={{ color: semantic.textMuted }}>
          This account is signed in but is not a member of any vendor organization. Create one to
          start onboarding, or ask an owner to invite you.
        </p>
        <p style={{ color: semantic.textMuted, fontSize: 14 }}>
          Onboarding and staff invitations arrive in M4.
        </p>
      </Panel>
    );
  }

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
