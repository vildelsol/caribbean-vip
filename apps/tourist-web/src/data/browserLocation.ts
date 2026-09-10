import type { LocationFix, LocationPermission, LocationProvider } from '@cvip/types';

/**
 * The browser's geolocation, behind the shared `LocationProvider` port (AD-07).
 *
 * There was no real implementation of this port in the web app — only the mock — so every distance
 * the product showed came from a simulated position. This is the half that makes proximity actually
 * work on the ground.
 *
 * Three rules the interface exists to enforce, and this honours:
 *
 *  - **Permission is never requested on mount.** `getPermission()` reads the current state through
 *    the Permissions API and cannot raise a prompt; only `requestPermission()` can, and only a
 *    press calls it (PRD §14, and `providers.test.ts` pins the same rule for the mock).
 *  - **No watching, no background.** The port has no such method on purpose (PRD §9). A single
 *    foreground fix is the only capability the MVP is allowed to depend on.
 *  - **It never throws.** A refused prompt, a timeout, an insecure origin and a browser with no
 *    geolocation at all are all the same answer to the caller: no fix. A screen that has to
 *    `try/catch` a position lookup ends up with a `catch` that renders nothing.
 */
export class BrowserLocationProvider implements LocationProvider {
  readonly name = 'browser';

  /** Geolocation needs a secure context; `localhost` counts, a LAN IP over http does not. */
  get available(): boolean {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }

  async getPermission(): Promise<LocationPermission> {
    if (!this.available) return 'denied';
    // The Permissions API is the only way to read the state without raising a prompt. Where it is
    // missing (older Safari), "undetermined" is the honest answer — the app must ask to find out.
    try {
      const permissions = (navigator as Navigator & { permissions?: Permissions }).permissions;
      if (!permissions?.query) return 'undetermined';
      const status = await permissions.query({ name: 'geolocation' as PermissionName });
      if (status.state === 'granted') return 'granted';
      if (status.state === 'denied') return 'denied';
      return 'undetermined';
    } catch {
      return 'undetermined';
    }
  }

  /**
   * Raise the browser prompt, and report what the guest chose.
   *
   * Only ever call this from a user action. The result is derived from whether a fix comes back,
   * because a granted permission that yields no fix is indistinguishable from a denial as far as
   * what the app can do next.
   */
  async requestPermission(): Promise<LocationPermission> {
    if (!this.available) return 'denied';
    const fix = await this.getCurrentPosition({ prompt: true });
    if (fix) return 'granted';
    return this.getPermission();
  }

  /**
   * One foreground fix, or null.
   *
   * `timeout` is deliberate: a phone that cannot see the sky will otherwise leave the caller waiting
   * indefinitely, and a screen with no distances is worse than one with simulated distances clearly
   * labelled. `maximumAge` accepts a fix up to a minute old — a guest walking a street has not moved
   * far enough in a minute to change which listings are near them, and reusing it avoids a second
   * GPS spin-up.
   */
  async getCurrentPosition(opts: { prompt?: boolean } = {}): Promise<LocationFix | null> {
    if (!this.available) return null;
    // Without this guard, merely reading the position would prompt — which is the thing the port
    // forbids outside an explicit request.
    if (!opts.prompt && (await this.getPermission()) !== 'granted') return null;

    return new Promise<LocationFix | null>((resolve) => {
      let settled = false;
      const done = (value: LocationFix | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      navigator.geolocation.getCurrentPosition(
        (position) =>
          done({
            coordinates: { lat: position.coords.latitude, lng: position.coords.longitude },
            // Some browsers report null accuracy. Claiming 0 would be claiming perfect precision,
            // so an unknown accuracy becomes a large, honest number instead.
            accuracyMetres: Number.isFinite(position.coords.accuracy)
              ? position.coords.accuracy
              : 5000,
            timestamp: position.timestamp,
          }),
        // Denied, unavailable, or timed out — all "no fix", never an exception.
        () => done(null),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      );
    });
  }
}

export const browserLocation = new BrowserLocationProvider();
