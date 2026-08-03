import type { ProfileRow } from '@cvip/supabase';

/**
 * The demonstration test account.
 *
 * **This is not a backend account and there is no server to authenticate against.** No hosted
 * Supabase project exists yet (HANDOVER §7), so there is nowhere for a real credential to live. What
 * this provides is a signed-in *persona* for the MVP presentation: it exercises the same
 * `SessionProvider` states, the same `requiresSignIn` gates and the same profile-driven UI that a
 * real account will, so the walkthrough can show the signed-in half of the product — a named guest,
 * Trips, Saved, party size, consent switches — without hand-waving past the sign-in screen.
 *
 * The credentials are printed on the sign-in screen on purpose. There is nothing to protect: they
 * unlock an in-memory object in a build that has no network backend. When Supabase is configured
 * this whole path is inert — `isDemoMode` is false, the button does not render, and the form does a
 * real `signInWithPassword`. That is the switch that has to stay true, and it is asserted in
 * `demoAccount.test.ts`.
 */
export const DEMO_CREDENTIALS = {
  email: 'demo@caribbeanvip.test',
  /** Not a secret. See the note above. */
  password: 'IrieDemo2026',
} as const;

/**
 * The signed-in tourist the presentation uses.
 *
 * Deliberately different from the anonymous browsing persona: a real name in the greeting is the
 * clearest signal on screen that the app is now in its authenticated state, which is the whole
 * point of showing the login at all.
 */
export const DEMO_ACCOUNT_PROFILE: ProfileRow = {
  id: 'demo-tourist',
  role: 'tourist',
  display_name: 'Alex Bennett',
  selected_island_id: 'island-jm',
  selected_destination_id: null,
  interests: [],
  party_size: 2,
  currency: 'USD',
  locale: 'en',
  location_consent: true,
  offer_consent: true,
  notification_consent: true,
};

/** Case- and whitespace-insensitive on the email, exact on the password. */
export function matchesDemoCredentials(email: string, password: string): boolean {
  return (
    email.trim().toLowerCase() === DEMO_CREDENTIALS.email && password === DEMO_CREDENTIALS.password
  );
}
