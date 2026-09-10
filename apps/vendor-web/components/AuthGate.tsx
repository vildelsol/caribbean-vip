'use client';

import { useState, type ReactNode } from 'react';
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

  // Demo mode. With no backend there is no account to sign into, and refusing to render anything
  // made the portal undemonstrable — which is a problem, because the vendor half of Journey A (a
  // guest's QR being scanned) is the single most important thing to be able to show.
  //
  // Nothing is unlocked by this: there is no vendor data to protect when there is no backend, and
  // `redeem.ts` routes to the in-memory demo backend rather than to anyone's real vouchers. Once
  // credentials exist, `isSupabaseConfigured` is true and the real gate below applies as before.
  if (!isSupabaseConfigured) {
    return (
      <div className="shell">
        {/* A hairline strip rather than a slab. The tourist app made the same change on 2026-08-03:
            the first thing anyone sees should be the product, and the notice still says the whole
            truth at 11px. */}
        <div className="demo-strip">
          Demo mode · sample data · no real vendor account · nothing is charged
        </div>
        {children}
      </div>
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
        <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--s-md)' }}>
          <label className="field">
            <span className="field__label">Email</span>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span className="field__label">Password</span>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          <button type="submit" disabled={busy} className="btn btn--primary">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {message ? <p className="transport__title">{message}</p> : null}
        </form>
      </Panel>
    );
  }

  if (memberships.length === 0) {
    return (
      <Panel title="No vendor organization yet">
        <p className="card__note">
          This account is signed in but is not a member of any vendor organization. Create one to
          start onboarding, or ask an owner to invite you.
        </p>
        <p className="card__note">Onboarding and staff invitations arrive in M4.</p>
      </Panel>
    );
  }

  return <>{children}</>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="panel">
      <div className="panel__brand">
        <span className="crest" aria-hidden="true">
          <span className="crest__vip">VIP</span>
          <span className="crest__role">VENDOR</span>
        </span>
      </div>
      <h1 className="panel__title">{title}</h1>
      <div className="card">{children}</div>
    </main>
  );
}
