import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureLiveUser } from '../lib/api';
import { readOfferConsent, writeConsent } from '../lib/consent';
import { supabase } from '../lib/supabase';
import { useStore } from './store';

/**
 * Keeps the server's record of the guest's consent in step with the app. LIVE MODE ONLY: with no
 * Supabase client every effect returns at once and nothing is read, written or created.
 *
 * `eligible-offer` trusts `profiles.location_consent` and `profiles.offer_consent`, not the app,
 * so a choice the app has not written down does not exist as far as offers are concerned.
 */

/** The signed-in user's id, following auth changes; null with no session. Local state only in the
 *  callback: making a Supabase call inside `onAuthStateChange` deadlocks. */
function useAuthUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user.id ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return userId;
}

/**
 * Mirror the store's `locationConsent` to `profiles.location_consent`.
 *
 * The device keeps the app's answer, so the app's answer is what gets written, on mount and on
 * every change and whenever the signed-in user changes (a different account has its own row).
 * A guest who consents before any session exists is given one, because without a row the answer
 * has nowhere to go; the new session changes the user id, which writes it. A failed write is
 * retried on the next mount or change, not in a loop: until it lands the server reads false, which
 * errs toward showing nothing.
 */
export function useLocationConsentSync(): void {
  const { state } = useStore();
  const consented = state.locationConsent;
  const userId = useAuthUserId();

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void (async () => {
      const result = await writeConsent({ location_consent: consented });
      if (active && !result.ok && result.reason === 'signed-out' && consented) await ensureLiveUser();
    })();
    return () => {
      active = false;
    };
  }, [consented, userId]);
}

export interface OfferConsent {
  /** The recorded opt-in, or null until it has been read (and always null in demo mode). */
  offerConsent: boolean | null;
  /** Record a new answer. Resolves false, and leaves the old answer showing, if it was not saved. */
  setOfferConsent: (next: boolean) => Promise<boolean>;
}

/**
 * The offer opt-in. Held only on the server, so a second device and a reinstall show what the
 * server will actually act on rather than a local copy that can disagree with it.
 */
export function useOfferConsent(): OfferConsent {
  const userId = useAuthUserId();
  const [offerConsent, setValue] = useState<boolean | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void readOfferConsent().then((read) => {
      if (!active) return;
      // No session means nothing is recorded yet, which is the same as not opted in.
      if (read.ok) setValue(read.offerConsent);
      else if (read.reason === 'signed-out') setValue(false);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const setOfferConsent = useCallback(async (next: boolean): Promise<boolean> => {
    if (!supabase) return false;
    let result = await writeConsent({ offer_consent: next });
    if (!result.ok && result.reason === 'signed-out' && next) {
      // Opting in is the first thing this guest has done that needs a row.
      if (await ensureLiveUser()) result = await writeConsent({ offer_consent: next });
    }
    if (result.ok && live.current) setValue(next);
    return result.ok;
  }, []);

  return { offerConsent, setOfferConsent };
}
