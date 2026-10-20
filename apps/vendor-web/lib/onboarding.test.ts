import { beforeEach, describe, expect, it } from 'vitest';
import { LISTING_LIMITS, VENDOR_LIMITS } from '@cvip/types';
import {
  ApplicationInvalid,
  __demoApplications,
  __resetDemoApplications,
  isDemoOnboarding,
  loadIslands,
  parseApplication,
  submitApplication,
  type ApplicationInput,
} from './onboarding';

/**
 * The onboarding write path.
 *
 * The suite has no Supabase credentials, so these run against the demo branch. That is the point
 * rather than a limitation: the demo branch has to refuse what the live branch refuses, and the
 * validation it shares with live is what both of them persist. The live RPC's own behaviour — one
 * transaction, the owner membership, the 'pending_review' status, the EXECUTE grant — is asserted
 * against a real database in `supabase/tests/vendor_onboarding.test.sql`.
 */

const island = '00000000-0000-4000-8000-00000000000a';

function input(over: Partial<ApplicationInput> = {}): ApplicationInput {
  return {
    businessName: 'Blue Lagoon Adventures',
    contactName: 'Marcia Brown',
    phone: '+1 876 555 0101',
    islandId: island,
    businessType: 'tour',
    description: '',
    ...over,
  };
}

beforeEach(__resetDemoApplications);

describe('parseApplication', () => {
  it('persists the trimmed values, not the input', () => {
    // The trap this guards: Zod trims before measuring while the Postgres checks measure what is
    // stored, so a name at exactly the limit plus a trailing space passes the schema and violates
    // `vendor_organizations_trading_name_length`. Only the parsed output may be written.
    const atLimit = 'a'.repeat(VENDOR_LIMITS.businessName);
    const parsed = parseApplication(input({ businessName: `${atLimit}   ` }));
    expect(parsed.businessName).toHaveLength(VENDOR_LIMITS.businessName);
  });

  it('rejects a name one character over the limit', () => {
    expect(() =>
      parseApplication(input({ businessName: 'a'.repeat(VENDOR_LIMITS.businessName + 1) })),
    ).toThrow(ApplicationInvalid);
  });

  it('rejects a whitespace-only business name', () => {
    // `char_length('   ') <= 120` is true, so without the trim-then-min(1) this would be storable
    // and the `not_blank` check constraint would be the only thing standing in the way.
    expect(() => parseApplication(input({ businessName: '   ' }))).toThrow(ApplicationInvalid);
  });

  it('accepts a description at the limit and rejects one past it', () => {
    expect(
      parseApplication(input({ description: 'd'.repeat(LISTING_LIMITS.vendorDescription) }))
        .description,
    ).toHaveLength(LISTING_LIMITS.vendorDescription);
    expect(() =>
      parseApplication(input({ description: 'd'.repeat(LISTING_LIMITS.vendorDescription + 1) })),
    ).toThrow(ApplicationInvalid);
  });

  it('sends a blank description as null, not an empty string', () => {
    // The column is nullable and the portal renders a prompt for null. '' would read as a blurb
    // the vendor wrote and left empty.
    expect(parseApplication(input({ description: '   ' })).description).toBeNull();
  });

  it('refuses an island that is not a uuid', () => {
    // The regression: the page offered slug ids ('jamaica', 'st_lucia') against a not-null FK to
    // `islands`. Six of its ten options named a market with no row, so they could never be stored.
    expect(() => parseApplication(input({ islandId: 'jamaica' }))).toThrow(ApplicationInvalid);
  });

  it('refuses a business type outside the taxonomy', () => {
    // Mirrors `vendor_organizations_business_type`. If one list grows the other must.
    expect(() => parseApplication(input({ businessType: 'mining' }))).toThrow(ApplicationInvalid);
    expect(parseApplication(input({ businessType: 'retail' })).businessType).toBe('retail');
  });

  it('requires a contact name and a phone number', () => {
    expect(() => parseApplication(input({ contactName: '' }))).toThrow(ApplicationInvalid);
    expect(() => parseApplication(input({ phone: ' ' }))).toThrow(ApplicationInvalid);
  });
});

describe('submitApplication', () => {
  it('runs on the demo branch in this suite', () => {
    // Without this the assertions below would be describing whichever branch happened to be live,
    // and a leaked credential in the environment would quietly change what they test.
    expect(isDemoOnboarding).toBe(true);
  });

  it('stores the application rather than discarding it', async () => {
    // The whole point. The old handler slept 800ms and routed on; nothing was written anywhere.
    expect(__demoApplications()).toHaveLength(0);
    const id = await submitApplication(input());
    expect(id).toBeTruthy();
    expect(__demoApplications()).toHaveLength(1);
    expect(__demoApplications()[0]?.businessName).toBe('Blue Lagoon Adventures');
    expect(__demoApplications()[0]?.islandId).toBe(island);
  });

  it('writes nothing when validation fails', async () => {
    await expect(submitApplication(input({ phone: '' }))).rejects.toThrow(ApplicationInvalid);
    expect(__demoApplications()).toHaveLength(0);
  });

  it('refuses a second application, as the live path does', async () => {
    await submitApplication(input());
    await expect(submitApplication(input())).rejects.toThrow(ApplicationInvalid);
    expect(__demoApplications()).toHaveLength(1);
  });
});

describe('loadIslands', () => {
  it('offers only islands the application could actually be filed under', async () => {
    const islands = await loadIslands();
    expect(islands.length).toBeGreaterThan(0);
    // Every option must satisfy the same `islandId` uuid check the live path does — a demo that
    // offers a value production would reject is testing a weaker contract.
    for (const i of islands) {
      expect(() => parseApplication(input({ islandId: i.id }))).not.toThrow();
    }
    // Antigua is seeded `is_active = false` as the negative fixture for island visibility, so the
    // live query would not return it and the demo list must not either.
    expect(islands.map((i) => i.name)).not.toContain('Antigua & Barbuda');
  });
});
