import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocationFix, LocationPermission } from '@cvip/types';
import { browserLocation } from '../data/browserLocation';
import { destinationBySlug, destinationsFor } from '../data/catalogue';
import { resolvePosition, type ResolvedPosition } from '../data/position';
import { useStore } from './store';

/**
 * The position every distance in the app is measured from.
 *
 * One hook, so no screen decides for itself whether to trust a fix. It combines three things the
 * app must never confuse: what the guest has consented to, what the device actually reported, and
 * whether that report is plausible for the island being browsed. `resolvePosition` holds the
 * judgement and is unit tested; this holds the effects.
 *
 * **Nothing here prompts on mount.** On load it reads the permission state — which cannot raise a
 * dialogue — and fetches a fix only if permission was already granted *and* consent is recorded.
 * The browser prompt appears exactly once, from `enable()`, behind a press.
 */
export interface GuestPosition {
  position: ResolvedPosition;
  permission: LocationPermission;
  /** True while a fix is being fetched, so a control can show it is working. */
  locating: boolean;
  /** Whether this browser can do geolocation at all — false on an insecure origin. */
  available: boolean;
  /** Ask for permission and start using the real position. Only ever call from a user action. */
  enable: () => Promise<void>;
  /** Withdraw consent and go back to the simulated position immediately. */
  disable: () => void;
}

export function useGuestPosition(): GuestPosition {
  const { state, dispatch } = useStore();
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [permission, setPermission] = useState<LocationPermission>('undetermined');
  const [locating, setLocating] = useState(false);

  const destination = destinationBySlug(state.destinationSlug);
  const islandDestinations = destinationsFor(state.islandId);
  const consented = state.locationConsent;

  // Guards against setting state after the screen has gone, which a 10-second geolocation timeout
  // makes a real possibility rather than a theoretical one.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  /**
   * Resume a previously granted permission without asking again.
   *
   * Reading the permission state is prompt-free, so this is safe on mount — and it is what makes
   * consent persist across visits instead of the guest being asked every time they open the app.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await browserLocation.getPermission();
      if (cancelled || !live.current) return;
      setPermission(current);
      if (!consented || current !== 'granted') return;
      setLocating(true);
      const next = await browserLocation.getCurrentPosition();
      if (cancelled || !live.current) return;
      setFix(next);
      setLocating(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [consented]);

  const enable = useCallback(async () => {
    setLocating(true);
    const granted = await browserLocation.requestPermission();
    if (!live.current) return;
    setPermission(granted);
    if (granted !== 'granted') {
      // A refusal is recorded so the app stops offering, and stops holding any earlier fix.
      dispatch({ type: 'setLocationConsent', granted: false });
      setFix(null);
      setLocating(false);
      return;
    }
    dispatch({ type: 'setLocationConsent', granted: true });
    const next = await browserLocation.getCurrentPosition();
    if (!live.current) return;
    setFix(next);
    setLocating(false);
  }, [dispatch]);

  const disable = useCallback(() => {
    dispatch({ type: 'setLocationConsent', granted: false });
    // Dropped here as well as gated in `resolvePosition`, so a withdrawn consent leaves no fix in
    // memory rather than merely an unused one.
    setFix(null);
  }, [dispatch]);

  const position: ResolvedPosition = destination
    ? resolvePosition({ fix, consented, destination, islandDestinations })
    : { kind: 'simulated', coordinates: { lat: 0, lng: 0 }, reason: 'no-consent' };

  return {
    position,
    permission,
    locating,
    available: browserLocation.available,
    enable,
    disable,
  };
}
