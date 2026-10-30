'use client';

import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from './supabase';
import { useActiveMembership } from './session';

/**
 * The active organisation's island timezone, or null in demo mode and until it has loaded.
 *
 * Live screens that show times must wait for this rather than fall back to the browser's zone:
 * a guess puts a departure on the wrong day for anyone not standing on the island.
 */
export function useIslandTimezone(): string | null {
  const islandId = useActiveMembership()?.vendor_organizations?.island_id ?? null;
  const [timeZone, setTimeZone] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !islandId) return;
    let active = true;
    void supabase
      .from('islands')
      .select('timezone')
      .eq('id', islandId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setTimeZone((data?.timezone as string | undefined) ?? null);
      });
    return () => {
      active = false;
    };
  }, [islandId]);

  return timeZone;
}
