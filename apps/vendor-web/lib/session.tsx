'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { UserRole } from '@cvip/types';
import { isSupabaseConfigured, supabase } from './supabase';

/**
 * Vendor-portal session context.
 *
 * The portal's access rule is membership, not role: a user reaches vendor data only through a
 * `vendor_members` row (PRD §4, "Can access only assigned vendor organization"). `memberships`
 * below is read through RLS, so this list is already the authoritative set — the UI cannot show
 * an organization the database would refuse to serve.
 *
 * Unlike the tourist app, there is no guest mode here. The vendor portal has nothing public.
 */

export interface Membership {
  vendor_org_id: string;
  role: UserRole;
  can_manage_listings: boolean;
  can_scan_vouchers: boolean;
  can_view_payouts: boolean;
  vendor_organizations: { trading_name: string; status: string } | null;
}

interface VendorSessionValue {
  loading: boolean;
  configured: boolean;
  session: Session | null;
  memberships: Membership[];
  activeOrgId: string | null;
  setActiveOrgId: (id: string) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<VendorSessionValue | null>(null);

export function VendorSessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

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
      if (!next) {
        setMemberships([]);
        setActiveOrgId(null);
      }
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
        .from('vendor_members')
        .select(
          'vendor_org_id, role, can_manage_listings, can_scan_vouchers, can_view_payouts, vendor_organizations(trading_name, status)',
        )
        .eq('user_id', userId);

      if (!active) return;
      if (error) {
        console.warn('[vendor-session] could not load memberships:', error.message);
        return;
      }
      const rows = (data ?? []) as unknown as Membership[];
      setMemberships(rows);
      setActiveOrgId((current) => current ?? rows[0]?.vendor_org_id ?? null);
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  const value = useMemo<VendorSessionValue>(
    () => ({
      loading,
      configured: isSupabaseConfigured,
      session,
      memberships,
      activeOrgId,
      setActiveOrgId,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [loading, session, memberships, activeOrgId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVendorSession(): VendorSessionValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useVendorSession must be used inside <VendorSessionProvider>');
  return ctx;
}

/** The membership currently in scope, including its permission flags. */
export function useActiveMembership(): Membership | null {
  const { memberships, activeOrgId } = useVendorSession();
  return memberships.find((m) => m.vendor_org_id === activeOrgId) ?? null;
}
