/**
 * Shared domain enums and identifiers.
 *
 * These mirror the Postgres enums created in M1. Keeping them here means the three apps and the
 * Edge Functions agree on the vocabulary without importing generated database types.
 */

import { z } from 'zod';

// --- Roles (PRD §4) --------------------------------------------------------

export const USER_ROLES = [
  'tourist',
  'vendor_owner',
  'vendor_staff',
  'admin',
  'super_admin',
] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES);

export function isPlatformAdmin(role: UserRole): boolean {
  return role === 'admin' || role === 'super_admin';
}

// --- Vendor & listing lifecycle (V-02) -------------------------------------

export const VENDOR_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'changes_requested',
  'rejected',
  'suspended',
] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];
export const vendorStatusSchema = z.enum(VENDOR_STATUSES);

export const LISTING_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'unpublished',
  'rejected',
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export const listingStatusSchema = z.enum(LISTING_STATUSES);

/**
 * The public-visibility rule, in one place.
 *
 * The authoritative enforcement is the RLS policy (AD-10) — this function exists so the same rule
 * can be asserted in unit tests and used for client-side affordances, never as the only gate.
 */
export function isPubliclyVisible(listing: ListingStatus, vendor: VendorStatus): boolean {
  return listing === 'approved' && vendor === 'approved';
}

// --- Categories (PRD §16 demo content list) --------------------------------

export const EXPERIENCE_CATEGORIES = [
  'waterfalls',
  'beaches',
  'adventure',
  'food',
  'culture',
  'nightlife',
  'wellness',
  'transportation',
  'shopping',
  'family',
  'day_trips',
  'water_sports',
] as const;
export type ExperienceCategory = (typeof EXPERIENCE_CATEGORIES)[number];
export const experienceCategorySchema = z.enum(EXPERIENCE_CATEGORIES);

// --- Islands (PRD §3) ------------------------------------------------------

export const ISLAND_CODES = ['JM', 'KY', 'BB'] as const;
export type IslandCode = (typeof ISLAND_CODES)[number];
export const islandCodeSchema = z.enum(ISLAND_CODES);

/**
 * In-app localized identity. PRD §3: the app is never renamed per island — only the in-app
 * destination experience localizes. The app-store brand is always "Caribbean VIP".
 */
export const ISLAND_BRANDS: Record<IslandCode, string> = {
  JM: 'VIP Jamaica',
  KY: 'VIP Cayman',
  BB: 'VIP Barbados',
};

export const APP_BRAND = 'Caribbean VIP';

// --- Promotions (PRD §9) ---------------------------------------------------

export const PROMOTION_VALUE_KINDS = ['percentage', 'fixed', 'in_kind'] as const;
export type PromotionValueKind = (typeof PROMOTION_VALUE_KINDS)[number];

export const APPROVAL_STATES = ['pending', 'approved', 'rejected', 'disabled'] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

// --- Consent (T-07, PRD §14) ----------------------------------------------

/**
 * T-07: "No location-triggered notification without permission and opt-in."
 *
 * Two independent flags. The OS permission alone is not consent to marketing; the in-app opt-in
 * alone cannot access location. Both must be true before any coordinate leaves the device.
 */
export interface OfferConsent {
  readonly osLocationGranted: boolean;
  readonly offerOptIn: boolean;
}

export function mayTriggerGeofencedOffer(consent: OfferConsent): boolean {
  return consent.osLocationGranted && consent.offerOptIn;
}
