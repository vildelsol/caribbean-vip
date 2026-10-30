'use client';

import { useEffect, useState } from 'react';
import type { IslandCode } from '@cvip/types';
import { isSupabaseConfigured, supabase } from './supabase';
import { useActiveMembership } from './session';

export interface IslandInfo {
  code: IslandCode | null;
  name: string | null;
  timeZone: string | null;
}

const NONE: IslandInfo = { code: null, name: null, timeZone: null };

/** The active organisation's island, or nulls in demo mode and until it has loaded. */
export function useIsland(): IslandInfo {
  const islandId = useActiveMembership()?.vendor_organizations?.island_id ?? null;
  const [island, setIsland] = useState<IslandInfo>(NONE);

  useEffect(() => {
    if (!isSupabaseConfigured || !islandId) return;
    let active = true;
    void supabase
      .from('islands')
      .select('code, name, timezone')
      .eq('id', islandId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        const code = data.code as string;
        setIsland({
          code: code === 'JM' || code === 'BB' || code === 'KY' ? code : null,
          name: data.name as string,
          timeZone: (data.timezone as string | undefined) ?? null,
        });
      });
    return () => {
      active = false;
    };
  }, [islandId]);

  return island;
}
