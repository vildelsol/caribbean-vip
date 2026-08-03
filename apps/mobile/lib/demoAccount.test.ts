import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNT_PROFILE, DEMO_CREDENTIALS, matchesDemoCredentials } from './demoAccount';

describe('the presentation test account', () => {
  it('accepts the printed credentials', () => {
    expect(matchesDemoCredentials(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)).toBe(true);
  });

  it('is forgiving about how the email is typed, since it gets typed on stage', () => {
    expect(matchesDemoCredentials('  DEMO@CaribbeanVIP.test ', DEMO_CREDENTIALS.password)).toBe(
      true,
    );
  });

  it('is exact about the password', () => {
    expect(matchesDemoCredentials(DEMO_CREDENTIALS.email, 'iriedemo2026')).toBe(false);
    expect(matchesDemoCredentials(DEMO_CREDENTIALS.email, ' IrieDemo2026')).toBe(false);
    expect(matchesDemoCredentials(DEMO_CREDENTIALS.email, '')).toBe(false);
  });

  it('rejects anything else', () => {
    expect(matchesDemoCredentials('someone@example.com', DEMO_CREDENTIALS.password)).toBe(false);
    expect(matchesDemoCredentials('', '')).toBe(false);
  });

  /**
   * The account is a tourist and nothing more. A demonstration credential that quietly carried a
   * vendor or admin role would be a privilege-escalation path dressed as a convenience — and
   * `guard_profile_privileges()` in the database exists precisely because roles are not the
   * client's to choose.
   */
  it('is a tourist, never a vendor or an admin', () => {
    expect(DEMO_ACCOUNT_PROFILE.role).toBe('tourist');
  });

  it('uses a .test domain, which can never be a real mailbox', () => {
    expect(DEMO_CREDENTIALS.email.endsWith('.test')).toBe(true);
  });

  it('is named differently from the anonymous browsing persona', () => {
    // The whole point of showing the login is that the greeting visibly changes.
    expect(DEMO_ACCOUNT_PROFILE.display_name).not.toBe('Demo guest');
  });
});
