'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isPlatformAdmin, type UserRole } from '@cvip/types';
import { isSupabaseConfigured, supabase } from './supabase';

/**
 * Admin console session.
 *
 * The console's gate is the `profiles.role` column, and the client-side check below is a
 * CONVENIENCE, not the security boundary — every admin-only table is protected by an RLS policy
 * calling is_admin(). A non-admin who bypassed this component would still read nothing.
 *
 * That column cannot be self-assigned: a trigger blocks role changes by anyone but a super admin
 * (see the privilege guard in the M1 functions migration), which is what stops a tourist from
 * promoting themselves into this app.
 */

interface AdminSessionValue {
  loading: boolean;
  configured: boolean;
  session: Session | null;
  role: UserRole | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AdminSessionValue | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, next) => {
      setSession(next);
      if (!next) setRole(null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return;
    let active = true;
    void (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      if (!active) return;
      if (error) console.warn('[admin-session] could not load role:', error.message);
      setRole((data?.role as UserRole | undefined) ?? null);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const value = useMemo<AdminSessionValue>(
    () => ({
      loading,
      configured: isSupabaseConfigured,
      session,
      role,
      isAdmin: role ? isPlatformAdmin(role) : false,
      isSuperAdmin: role === 'super_admin',
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [loading, session, role],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminSession(): AdminSessionValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAdminSession must be used inside <AdminSessionProvider>');
  return ctx;
}
