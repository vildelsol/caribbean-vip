import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DestinationRow, IslandRow, ProfileRow } from '@cvip/supabase';
import { APP_BRAND, ISLAND_BRANDS, type IslandCode } from '@cvip/types';
import { isSupabaseConfigured, supabase } from './supabase';
import { useSession } from './session';

/**
 * Island and destination selection — T-02.
 *
 * PRD §3: the app is never renamed per island. `appBrand` is always "Caribbean VIP"; only
 * `islandBrand` localizes to "VIP Jamaica", "VIP Cayman" and so on. Keeping both on the context
 * makes it hard to accidentally render the localized name where the product name belongs.
 *
 * Selection works for guests too (T-01 + T-02 together): it lives in local state, and is
 * persisted to `profiles.selected_island_id` only when there is a profile to persist it to.
 */

interface IslandContextValue {
  appBrand: string;
  islandBrand: string;
  islands: IslandRow[];
  destinations: DestinationRow[];
  island: IslandRow | null;
  destination: DestinationRow | null;
  loading: boolean;
  selectIsland: (islandId: string) => Promise<void>;
  selectDestination: (destinationId: string | null) => Promise<void>;
}

const IslandContext = createContext<IslandContextValue | null>(null);

export function IslandProvider({ children }: { children: ReactNode }) {
  const { profile, refreshProfile } = useSession();
  const [islands, setIslands] = useState<IslandRow[]>([]);
  const [destinations, setDestinations] = useState<DestinationRow[]>([]);
  const [islandId, setIslandId] = useState<string | null>(null);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  // Only active islands come back — the RLS policy enforces that, so an unlaunched market cannot
  // be selected even by a client that asks for it.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      const { data, error } = await supabase.from('islands').select('*').order('name');
      if (!active) return;
      if (error) console.warn('[island] could not load islands:', error.message);
      const rows = data ?? [];
      setIslands(rows);
      // Jamaica is the populated launch market, so it is the default when nothing is chosen.
      setIslandId((current) => current ?? rows.find((i) => i.code === 'JM')?.id ?? rows[0]?.id ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!islandId || !isSupabaseConfigured) {
      setDestinations([]);
      return;
    }
    let active = true;
    void (async () => {
      const { data, error } = await supabase
        .from('destinations')
        .select('*')
        .eq('island_id', islandId)
        .order('sort_order');
      if (!active) return;
      if (error) console.warn('[island] could not load destinations:', error.message);
      setDestinations(data ?? []);
    })();
    return () => {
      active = false;
    };
  }, [islandId]);

  // Adopt the signed-in user's saved selection.
  useEffect(() => {
    if (profile?.selected_island_id) setIslandId(profile.selected_island_id);
    if (profile?.selected_destination_id) setDestinationId(profile.selected_destination_id);
  }, [profile?.selected_island_id, profile?.selected_destination_id]);

  const island = useMemo(
    () => islands.find((i) => i.id === islandId) ?? null,
    [islands, islandId],
  );
  const destination = useMemo(
    () => destinations.find((d) => d.id === destinationId) ?? null,
    [destinations, destinationId],
  );

  const value = useMemo<IslandContextValue>(() => {
    const persist = async (patch: Partial<ProfileRow>) => {
      if (!profile) return; // guest: selection stays local, which is the point of T-01
      const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id);
      if (error) console.warn('[island] could not save selection:', error.message);
      else await refreshProfile();
    };

    return {
      appBrand: APP_BRAND,
      islandBrand: island
        ? (ISLAND_BRANDS[island.code as IslandCode] ?? island.in_app_brand)
        : APP_BRAND,
      islands,
      destinations,
      island,
      destination,
      loading,
      selectIsland: async (id: string) => {
        setIslandId(id);
        // Changing island invalidates the destination — a Jamaican town is not a Cayman one.
        setDestinationId(null);
        await persist({ selected_island_id: id, selected_destination_id: null });
      },
      selectDestination: async (id: string | null) => {
        setDestinationId(id);
        await persist({ selected_destination_id: id });
      },
    };
  }, [islands, destinations, island, destination, loading, profile, refreshProfile]);

  return <IslandContext.Provider value={value}>{children}</IslandContext.Provider>;
}

export function useIsland(): IslandContextValue {
  const ctx = useContext(IslandContext);
  if (!ctx) throw new Error('useIsland must be used inside <IslandProvider>');
  return ctx;
}
