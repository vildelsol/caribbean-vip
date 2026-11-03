import { useCallback, useEffect, useRef, useState } from 'react';
import { distanceMetres } from '@cvip/types';
import { islandById } from '../data/catalogue';
import {
  appOffersClient,
  checkEligibleOffer,
  claimOffer,
  clearHeldToken,
  loadHeldToken,
  saveHeldToken,
  shouldCheckOffer,
  type HeldToken,
  type LastCheck,
  type ShownOffer,
} from '../lib/offers';
import { supabase } from '../lib/supabase';
import { useStore } from './store';
import { useGuestPosition } from './useGuestPosition';
import { useOfferConsent } from './useConsent';

/**
 * The live offer: asks the server whether the guest may be shown one here, and claims it. LIVE
 * MODE ONLY. With no Supabase client every effect returns at once, nothing is sent and
 * `offer` stays null.
 *
 * The server decides. This hook only chooses *when to ask*, and asks only when the guest has
 * switched on both consents and the device has reported a position the app trusts on this island
 * (`position.kind === 'real'`). A simulated position is never sent: it is not where the guest is.
 */
export interface LiveOffer {
  offer: ShownOffer | null;
  held: HeldToken | null;
  claiming: boolean;
  failed: boolean;
  claim: () => Promise<void>;
}

export function useLiveOffer(): LiveOffer {
  const { state } = useStore();
  const { position } = useGuestPosition();
  const { offerConsent } = useOfferConsent();
  const [offer, setOffer] = useState<ShownOffer | null>(null);
  const [held, setHeld] = useState<HeldToken | null>(() => (supabase ? loadHeldToken() : null));
  const [claiming, setClaiming] = useState(false);
  const [failed, setFailed] = useState(false);
  const last = useRef<LastCheck | null>(null);

  const allowed = state.locationConsent && offerConsent === true && position.kind === 'real';
  const lat = position.coordinates.lat;
  const lng = position.coordinates.lng;
  const islandCode = islandById(state.islandId)?.code;

  // Withdrawing either consent drops the offer on screen at once. Declining is also forgetting.
  useEffect(() => {
    if (!allowed) {
      setOffer(null);
      last.current = null;
    }
  }, [allowed]);

  useEffect(() => {
    if (!supabase || !allowed || !islandCode) return;
    const now = Date.now();
    if (!shouldCheckOffer(last.current, { lat, lng }, now, distanceMetres)) return;
    last.current = { at: now, lat, lng };
    let active = true;
    void checkEligibleOffer(appOffersClient(), { lat, lng, islandCode }).then((result) => {
      if (!active) return;
      if (result.ok) setOffer(result.offer);
    });
    return () => {
      active = false;
    };
  }, [allowed, lat, lng, islandCode]);

  const claim = useCallback(async () => {
    if (!offer) return;
    setClaiming(true);
    setFailed(false);
    const result = await claimOffer(appOffersClient(), offer.promotionId);
    setClaiming(false);
    if (result.ok) {
      const next = { promotionId: offer.promotionId, token: result.token, validUntil: result.validUntil };
      saveHeldToken(next);
      setHeld(next);
      setOffer(null);
    } else {
      setFailed(true);
    }
  }, [offer]);

  // An expired token is dropped when it is read; this drops it while the screen is open.
  useEffect(() => {
    if (!held) return;
    const ms = Date.parse(held.validUntil) - Date.now();
    if (ms <= 0) {
      clearHeldToken();
      setHeld(null);
      return;
    }
    const id = setTimeout(() => {
      clearHeldToken();
      setHeld(null);
    }, Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [held]);

  return { offer, held, claiming, failed, claim };
}
