import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { accountStatusOf, type AccountStatus } from '../lib/account';

/**
 * The current user's account state, following auth changes. `null` until the first read — and
 * forever in demo mode, where there is no client and the effect returns at once. LIVE MODE ONLY in
 * practice: every caller is itself mounted behind `isLiveMode`.
 */
export function useAccountStatus(): AccountStatus | null {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setStatus(accountStatusOf(data.session?.user));
    });
    // Only local state is set in here: making a Supabase call inside this callback deadlocks.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setStatus(accountStatusOf(session?.user));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return status;
}
