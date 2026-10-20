import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { startLiveSync } from './liveSync';
import { useStore } from './store';

/**
 * Recovers the guest's bookings from the server — live mode only (see ./liveSync.ts).
 *
 * In demo mode `supabase` is null, so the effect returns at once: no subscription, no fetch, no
 * dispatch, and so no state change and no storage write. The hook is still *called* in demo mode,
 * because hooks cannot be conditional; it is the effect body that is gated.
 *
 * Called from App above the onboarding early return, so the hook order never changes and a guest
 * who signs in from Welcome has their bookings merged before setup finishes.
 */
export function useLiveSync(): void {
  const { dispatch } = useStore();
  useEffect(() => startLiveSync(supabase, dispatch), [dispatch]);
}
