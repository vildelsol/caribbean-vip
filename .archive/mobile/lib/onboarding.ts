/**
 * Whether the welcome screen has been shown this session.
 *
 * Deliberately in memory rather than AsyncStorage. Two reasons, and they point the same way:
 *
 *   - A demonstration needs the welcome screen back on every reload. Persisting it would mean the
 *     first person to open the app burns the one chance anyone else has of seeing screen one.
 *   - It is presentation state, not a preference. A real "don't show onboarding again" belongs on
 *     the profile once there are accounts to hang it off (M4), not in device storage where it
 *     silently survives a sign-out.
 */
let seen = false;

export function hasSeenOnboarding(): boolean {
  return seen;
}

export function markOnboardingSeen(): void {
  seen = true;
}
