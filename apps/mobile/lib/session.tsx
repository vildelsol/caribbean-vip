import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { ProfileRow } from '@cvip/supabase';
import { isSupabaseConfigured, supabase } from './supabase';
import { isDemoMode } from './mode';

/**
 * Session and profile context for the tourist app.
 *
 * T-01 is the shaping requirement: "User can browse Jamaica content without creating an account."
 * So `guest` is a first-class state, not an error state — there is no redirect-to-login anywhere
 * in this file. A guest has a null session and a null profile and can still reach Explore and
 * open an experience; sign-in is required only at checkout.
 */

export type AuthState = 'loading' | 'guest' | 'authenticated';

interface SessionContextValue {
  state: AuthState;
  session: Session | null;
  profile: ProfileRow | null;
  /** False when no Supabase credentials are configured; the UI says so rather than failing. */
  configured: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * In demo mode there is a standing signed-in tourist, so saving and booking work without an
 * account screen in the middle of a walkthrough. Guest browsing (T-01) is still demonstrable —
 * signing out returns to the guest state rather than to a login wall.
 */
const DEMO_PROFILE: ProfileRow = {
  id: 'demo-tourist',
  role: 'tourist',
  display_name: 'Demo guest',
  selected_island_id: 'island-jm',
  selected_destination_id: null,
  interests: [],
  party_size: 2,
  currency: 'USD',
  locale: 'en',
  location_consent: false,
  offer_consent: false,
  notification_consent: false,
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(
    isDemoMode ? 'authenticated' : isSupabaseConfigured ? 'loading' : 'guest',
  );
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(isDemoMode ? DEMO_PROFILE : null);

  useEffect(() => {
    if (!isSupabaseConfigured || isDemoMode) return;

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setState(data.session ? 'authenticated' : 'guest');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setState(next ? 'authenticated' : 'guest');
      if (!next) setProfile(null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id;

  useEffect(() => {
    if (isDemoMode) return;
    if (!userId || !isSupabaseConfigured) {
      setProfile(null);
      return;
    }
    let active = true;
    void loadProfile(userId).then((p) => {
      if (active) setProfile(p);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      session,
      profile,
      configured: isSupabaseConfigured || isDemoMode,
      signOut: async () => {
        // Signing out returns the user to GUEST, not to a login wall — browsing still works.
        if (isDemoMode) {
          setProfile(null);
          setState('guest');
          return;
        }
        await supabase.auth.signOut();
      },
      refreshProfile: async () => {
        if (isDemoMode) return;
        if (userId) setProfile(await loadProfile(userId));
      },
    }),
    [state, session, profile, userId],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

async function loadProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    // A failed profile read degrades to guest-equivalent browsing rather than blocking the app.
    console.warn('[session] could not load profile:', error.message);
    return null;
  }
  return data;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/** True when the user must sign in to continue — checkout, saved items, Trips. */
export function useRequiresAuth(): boolean {
  return useSession().state !== 'authenticated';
}
