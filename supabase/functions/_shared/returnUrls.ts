/**
 * The two URLs Stripe sends the guest back to.
 *
 * These are pure and live in their own file so the gates can reach them. The functions around them
 * cannot be tested from a laptop — `Deno.serve`, `Deno.env`, a live Stripe key — and this is the
 * part that is easy to get wrong and expensive when it is: a wrong success URL means the card is
 * charged and the guest lands somewhere that shows no booking.
 *
 * The tourist app uses `HashRouter` (see `apps/tourist-web/src/main.tsx` for why), so every route
 * lives after a `#`. A URL without one does not 404 — `<Route path="*">` renders Explore — which
 * is worse, because it looks like the payment silently did nothing.
 */

/** Strips trailing slashes so `APP_URL=https://x/` does not produce `https://x//#/`. */
function normalizeBase(appUrl: string): string {
  return appUrl.replace(/\/+$/, '');
}

/**
 * Where Stripe sends a guest who paid. `{CHECKOUT_SESSION_ID}` is Stripe's own placeholder and is
 * substituted by Stripe before the redirect; `BookingReturn` reads it as `session_id`.
 */
export function successUrl(appUrl: string): string {
  return `${normalizeBase(appUrl)}/#/booking-return?session_id={CHECKOUT_SESSION_ID}`;
}

/** Where Stripe sends a guest who backed out — the checkout screen they came from. */
export function cancelUrl(appUrl: string, experienceId: string): string {
  const base = normalizeBase(appUrl);
  return experienceId ? `${base}/#/checkout/${experienceId}` : `${base}/#/`;
}
