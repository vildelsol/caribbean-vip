'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { UserRole } from '@cvip/types';
import { isSupabaseConfigured, supabase } from './supabase';
import { isListingManager } from './permissions';

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
  /* `island_id` is here for the listings create form: a new experience needs an island, and the
     vendor's own island is the only correct answer — asking an operator to pick one invites a
     listing filed under an island they do not trade in. */
  vendor_organizations: { trading_name: string; status: string; island_id: string } | null;
}

interface VendorSessionValue {
  loading: boolean;
  configured: boolean;
  session: Session | null;
  memberships: Membership[];
  activeOrgId: string | null;
  setActiveOrgId: (id: string) => void;
  /**
   * May the current member write listings and availability?
   *
   * Derived here rather than read off the row, because an owner counts as a manager whatever
   * `can_manage_listings` says — see `isListingManager` in `lib/permissions.ts`, which mirrors
   * the RLS helper. False with no active membership: nothing is writable until one is in scope.
   */
  canManageListings: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<VendorSessionValue | null>(null);

/**
 * The membership demo mode runs as.
 *
 * Demo mode has no Supabase and so no `vendor_members` row, but the permission gate has to be
 * live there too — a demo that silently grants everything is not demonstrating the product. So
 * the demo supplies a membership and the same `isListingManager` reads it. The demo persona is
 * the owner of the seeded organisation, which is why the write controls are offered; setting
 * `NEXT_PUBLIC_DEMO_VENDOR_SCAN_ONLY=1` runs the demo as ungranted staff instead, which is how
 * the withheld-controls state is viewed without a database.
 */
const DEMO_SCAN_ONLY = process.env.NEXT_PUBLIC_DEMO_VENDOR_SCAN_ONLY === '1';

const DEMO_MEMBERSHIP: Membership = {
  vendor_org_id: 'demo-vendor-org',
  role: DEMO_SCAN_ONLY ? 'vendor_staff' : 'vendor_owner',
  can_manage_listings: false,
  can_scan_vouchers: true,
  can_view_payouts: !DEMO_SCAN_ONLY,
  vendor_organizations: null,
};

export function VendorSessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>(
    isSupabaseConfigured ? [] : [DEMO_MEMBERSHIP],
  );
  const [activeOrgId, setActiveOrgId] = useState<string | null>(
    isSupabaseConfigured ? null : DEMO_MEMBERSHIP.vendor_org_id,
  );

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
          'vendor_org_id, role, can_manage_listings, can_scan_vouchers, can_view_payouts, vendor_organizations(trading_name, status, island_id)',
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
      canManageListings: isListingManager(
        memberships.find((m) => m.vendor_org_id === activeOrgId) ?? null,
      ),
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

/**
 * May the current member write listings and availability?
 *
 * The one gate the listings and availability screens read. It is also enforced inside
 * `lib/listings.ts` and `lib/availability.ts`, so a control that slipped through cannot write.
 */
export function useCanManageListings(): boolean {
  return useVendorSession().canManageListings;
}

/** The membership currently in scope, including its permission flags. */
export function useActiveMembership(): Membership | null {
  const { memberships, activeOrgId } = useVendorSession();
  return memberships.find((m) => m.vendor_org_id === activeOrgId) ?? null;
}
