'use client';

import { useState, type ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useVendorSession } from '../lib/session';

type AuthView = 'signin' | 'signup' | 'verify-signin' | 'verify-signup';

export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session, memberships } = useVendorSession();
  const [view, setView] = useState<AuthView>('signin');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!isSupabaseConfigured) {
    return (
      <div className="shell">{children}</div>
    );
  }

  if (loading) return <Panel title="Loading…">{null}</Panel>;

  if (!session) {
    const sendOtp = async (e: React.FormEvent, forSignup: boolean) => {
      e.preventDefault();
      setBusy(true);
      setMessage(null);
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: forSignup },
      });
      setBusy(false);
      if (error) {
        setMessage(error.message);
      } else {
        setView(forSignup ? 'verify-signup' : 'verify-signin');
      }
    };

    const verifyOtp = async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setMessage(null);
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
      setBusy(false);
      if (error) setMessage(error.message);
    };

    if (view === 'verify-signin' || view === 'verify-signup') {
      return (
        <Panel title="Check your email">
          <p className="card__note">
            We sent a 6-digit code to <strong>{email}</strong>. Enter it below to{' '}
            {view === 'verify-signup' ? 'create your account' : 'sign in'}.
          </p>
          <form onSubmit={verifyOtp} style={{ display: 'grid', gap: 'var(--s-md)' }}>
            <label className="field">
              <span className="field__label">Verification code</span>
              <input
                type="text"
                inputMode="numeric"
                className="input input--code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                required
                autoComplete="one-time-code"
                autoFocus
              />
            </label>
            <button type="submit" disabled={busy || code.length !== 6} className="btn btn--primary btn--full">
              {busy ? 'Verifying…' : 'Confirm'}
            </button>
            {message ? <p className="auth-error">{message}</p> : null}
            <button
              type="button"
              className="btn btn--text"
              onClick={() => { setView('signin'); setCode(''); setMessage(null); }}
            >
              ← Back
            </button>
          </form>
        </Panel>
      );
    }

    if (view === 'signup') {
      return (
        <Panel title="Create your account">
          <p className="card__note">
            Enter your work email and we&rsquo;ll send a one-time code — no password needed.
          </p>
          <form onSubmit={(e) => sendOtp(e, true)} style={{ display: 'grid', gap: 'var(--s-md)' }}>
            <label className="field">
              <span className="field__label">Work email</span>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourbusiness.com"
                required
                autoComplete="email"
                autoFocus
              />
            </label>
            <button type="submit" disabled={busy} className="btn btn--primary btn--full">
              {busy ? 'Sending code…' : 'Send code →'}
            </button>
            {message ? <p className="auth-error">{message}</p> : null}
          </form>
          <div className="auth-switch">
            Already have an account?{' '}
            <button type="button" className="auth-link" onClick={() => { setView('signin'); setMessage(null); }}>
              Sign in
            </button>
          </div>
        </Panel>
      );
    }

    return (
      <Panel title="Welcome back">
        <p className="card__note">
          Enter your email and we&rsquo;ll send a sign-in code — no password required.
        </p>
        <form onSubmit={(e) => sendOtp(e, false)} style={{ display: 'grid', gap: 'var(--s-md)' }}>
          <label className="field">
            <span className="field__label">Email</span>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourbusiness.com"
              required
              autoComplete="email"
              autoFocus
            />
          </label>
          <button type="submit" disabled={busy} className="btn btn--primary btn--full">
            {busy ? 'Sending code…' : 'Send code →'}
          </button>
          {message ? <p className="auth-error">{message}</p> : null}
        </form>
        <div className="auth-switch">
          New vendor?{' '}
          <button type="button" className="auth-link" onClick={() => { setView('signup'); setMessage(null); }}>
            Create an account
          </button>
        </div>
      </Panel>
    );
  }

  if (memberships.length === 0) {
    return (
      <Panel title="Pending approval">
        <p className="card__note">
          Your account is signed in but not yet linked to a vendor organization. Complete
          onboarding or ask an owner to invite you.
        </p>
        <a href="/onboarding" className="btn btn--primary" style={{ textDecoration: 'none', display: 'flex', justifyContent: 'center' }}>
          Complete onboarding →
        </a>
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
