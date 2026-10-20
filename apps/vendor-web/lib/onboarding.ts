'use client';

import {
  LISTING_LIMITS,
  VENDOR_BUSINESS_TYPES,
  VENDOR_LIMITS,
  vendorApplicationSchema,
  type VendorApplication,
} from '@cvip/types';
import { supabase, isSupabaseConfigured } from './supabase';

/**
 * The vendor onboarding write path — V-02.
 *
 * Shaped after `listings.ts` and `availability.ts`: one async surface, the demo/live branch inside
 * this file rather than at the call site, so the page does not know which backend it is talking to.
 *
 * ## What this replaced
 *
 * `app/onboarding/page.tsx` ran `await new Promise(r => setTimeout(r, 800))` and routed to
 * /billing. No `vendor_organizations` row, no `vendor_members` row, every field discarded. Since
 * every public RLS policy gates on `status = 'approved'`, a live deployment would have held no
 * vendors and therefore shown no listings at all.
 *
 * ## Why the live path is a single RPC
 *
 * Not a preference. The two-insert client version cannot work: the only insert-side policy on
 * `vendor_members` is `vendor_members_owner_manage`, whose check is `is_vendor_owner(vendor_org_id)`,
 * and that helper looks for an existing `vendor_owner` row. Before the first membership exists
 * there is no owner, so the policy refuses the row that would create one — and the organisation
 * `vendor_orgs_insert` already allowed is then permanently ownerless and invisible to its own
 * applicant. `create_vendor_organization` does both under one transaction; see
 * `supabase/migrations/20261020000001_vendor_onboarding.sql` for the grant and why the owner comes
 * from `auth.uid()` rather than an argument.
 *
 * ## Islands come from the database
 *
 * The page hardcoded ten islands with slug ids ('jamaica', 'st_lucia'). `island_id` is a not-null
 * FK to `islands` and four islands exist, so six of those ten could never have been stored even
 * once the insert was real. `islands_public_read` exposes exactly the active ones, which is the
 * list an applicant may legitimately choose from.
 */

export const isDemoOnboarding = !isSupabaseConfigured;

export const ONBOARDING_BUSINESS_TYPES = VENDOR_BUSINESS_TYPES;

/** Both the Zod maxima and the inputs' `maxLength` read these, so the two cannot drift. */
export const ONBOARDING_LIMITS = {
  ...VENDOR_LIMITS,
  description: LISTING_LIMITS.vendorDescription,
} as const;

export interface IslandOption {
  id: string;
  name: string;
}

/** The raw form state. Strings throughout, because that is what an input gives back. */
export interface ApplicationInput {
  businessName: string;
  contactName: string;
  phone: string;
  islandId: string;
  businessType: string;
  description: string;
}

/**
 * Thrown for anything the applicant can fix by editing the form.
 *
 * Distinct from a transport failure on purpose, exactly as in `listings.ts`: a dropped connection
 * is not a judgement about the business, and telling someone their phone number is wrong because
 * the network blinked sends them editing a field that was already fine.
 */
export class ApplicationInvalid extends Error {}

// ---------------------------------------------------------------------------
// Demo store
// ---------------------------------------------------------------------------

/**
 * The islands demo mode offers.
 *
 * Mirrors the active rows in `supabase/seed/seed.sql`. Antigua is seeded inactive on purpose — it
 * is the negative fixture the island-visibility RLS test needs — so it is absent here too, which
 * is what makes the demo show the same choice the live query would return.
 *
 * Fixed uuids rather than generated ones: `vendorApplicationSchema` requires `islandId` to be a
 * uuid, so the demo has to satisfy the same validation the live path does or the demo would be
 * passing a weaker check than production.
 */
const DEMO_ISLANDS: IslandOption[] = [
  { id: '00000000-0000-4000-8000-00000000000b', name: 'Barbados' },
  { id: '00000000-0000-4000-8000-00000000000c', name: 'Cayman Islands' },
  { id: '00000000-0000-4000-8000-00000000000a', name: 'Jamaica' },
];

let demoApplications: VendorApplication[] = [];

/** Test seam. The portal never calls this; `onboarding.test.ts` does, to start from no rows. */
export function __resetDemoApplications(): void {
  demoApplications = [];
}

/** What the demo path has stored. Lost on reload, which is correct for a demonstration. */
export function __demoApplications(): readonly VendorApplication[] {
  return demoApplications;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function loadIslands(): Promise<IslandOption[]> {
  if (isDemoOnboarding) return [...DEMO_ISLANDS];

  const { data, error } = await supabase
    .from('islands')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ id: r.id, name: r.name }));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate the form and hand back what should be stored.
 *
 * The parsed output is what both branches persist. The schema trims before measuring while the
 * Postgres checks measure what is stored, so saving the raw input would let a business name of
 * exactly the limit plus a trailing space violate `vendor_organizations_trading_name_length` on
 * the way in.
 *
 * Blank `description` goes to the database as null rather than '', because the column is nullable
 * and "no blurb yet" is a different thing from an empty one.
 */
export function parseApplication(input: ApplicationInput): VendorApplication {
  const description = input.description.trim();
  const parsed = vendorApplicationSchema.safeParse({
    businessName: input.businessName,
    contactName: input.contactName,
    phone: input.phone,
    islandId: input.islandId,
    businessType: input.businessType,
    description: description.length > 0 ? description : null,
  });

  if (!parsed.success) {
    throw new ApplicationInvalid(
      parsed.error.issues[0]?.message ?? 'That application cannot be submitted as it is.',
    );
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Submit the application. Returns the new organisation's id.
 *
 * `legal_name` and `trading_name` both receive the one name the form collects. They are separate
 * columns because a registered entity and the name on the sign are often different, but asking an
 * applicant for both before they have been approved for anything is friction for a distinction
 * only the review step cares about — the admin surface can split them.
 */
export async function submitApplication(input: ApplicationInput): Promise<string> {
  const app = parseApplication(input);

  if (isDemoOnboarding) {
    // The live path refuses a second application from one account, so the demo does too: a demo
    // that silently accepts what production rejects is not demonstrating the product.
    if (demoApplications.length > 0) {
      throw new ApplicationInvalid('This account already belongs to a vendor organisation.');
    }
    demoApplications.push(app);
    return 'demo-vendor-org';
  }

  const { data, error } = await supabase.rpc('create_vendor_organization', {
    p_island_id: app.islandId,
    p_legal_name: app.businessName,
    p_trading_name: app.businessName,
    p_contact_name: app.contactName,
    p_contact_phone: app.phone,
    p_business_type: app.businessType,
    p_description: app.description,
  });

  if (error) {
    // 23505 is the duplicate-application refusal the function raises, and 42501 its sign-in and
    // no-email cases. Those are the applicant's to fix; anything else is reported as a failure
    // rather than as a verdict on the form.
    if (error.code === '23505' || error.code === '42501') {
      throw new ApplicationInvalid(error.message);
    }
    throw new Error(error.message);
  }

  if (typeof data !== 'string' || data.length === 0) {
    throw new Error('The application was submitted but no organisation came back.');
  }
  return data;
}
