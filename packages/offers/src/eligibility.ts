import { distanceMetres, mayTriggerGeofencedOffer, type ApprovalState, type Coordinates, type VendorStatus } from '@cvip/types';
import { GEOFENCE_RADIUS_METRES, cooldownElapsed, isScheduleActiveInZone, type FenceSchedule } from './geofence.ts';

/**
 * Which offer, if any, a guest at a position is eligible for.
 *
 * Pure over plain data, so the eligibility Edge Function and its tests run the same code. The
 * function that calls this fetches broadly (approved offers on the island, with their fences) and
 * this decides, so every rule from PRD §9 is in one tested place instead of split between a query
 * and the code around it:
 *   - never without both consents (T-07), and never from a fix too coarse to prove presence
 *   - never an offer that is expired, not started, disabled, sold out or already claimed
 *   - never from a vendor that is not approved, or on another island
 *   - never outside the fence's schedule (on the island's clock) or inside its cooldown
 *   - test offers (`is_demo`) only for an administrator, who is the one testing them
 * The database stays the authority on what is publicly readable; this is the second gate, not the
 * only one.
 */

export interface OfferFence {
  geofenceId: string;
  centre: Coordinates;
  radiusMetres: number;
  isActive: boolean;
  schedule: FenceSchedule;
  cooldownMinutes: number;
}

export interface OfferPromotion {
  promotionId: string;
  islandId: string;
  /** `islands.timezone`: the clock a schedule is read against. */
  timeZone: string;
  vendorStatus: VendorStatus;
  approvalState: ApprovalState;
  isDemo: boolean;
  title: string;
  description: string | null;
  terms: string;
  valueKind: 'percentage' | 'fixed' | 'in_kind';
  valueRate: number | null;
  valueAmountMinor: number | null;
  currency: string | null;
  startsAt: string;
  endsAt: string;
  inventoryLimit: number | null;
  issuedCount: number;
  fences: OfferFence[];
}

export interface GuestPosition {
  coordinates: Coordinates;
  /** Reported accuracy in metres, when the device gives one. */
  accuracyMetres?: number;
}

export interface EligibilityInput {
  position: GuestPosition;
  islandId: string;
  now: Date;
  consent: { osLocationGranted: boolean; offerOptIn: boolean };
  viewerIsAdmin: boolean;
  promotions: readonly OfferPromotion[];
  /** Promotions this guest already holds a voucher for. */
  claimedPromotionIds: ReadonlySet<string>;
  /** When each promotion was last shown to this guest, in epoch ms. */
  lastShownAtMs: ReadonlyMap<string, number>;
}

export type Blocker =
  | 'wrong-island'
  | 'not-approved'
  | 'vendor-not-approved'
  | 'test-offer'
  | 'not-started'
  | 'ended'
  | 'sold-out'
  | 'already-claimed'
  | 'fence-inactive'
  | 'outside-schedule'
  | 'cooldown'
  | 'coarse-fix'
  | 'too-far';

export type Eligibility =
  | { eligible: true; offer: { promotion: OfferPromotion; fence: OfferFence; distanceMetres: number } }
  | { eligible: false; reason: 'no-consent' | 'no-offer' };

/** Why a fence cannot fire for this guest right now, or null when it can. Order is cheapest first. */
export function fenceBlocker(promotion: OfferPromotion, fence: OfferFence, input: EligibilityInput): Blocker | null {
  const { now } = input;
  if (promotion.islandId !== input.islandId) return 'wrong-island';
  if (promotion.approvalState !== 'approved') return 'not-approved';
  if (promotion.vendorStatus !== 'approved') return 'vendor-not-approved';
  if (promotion.isDemo && !input.viewerIsAdmin) return 'test-offer';
  if (now.getTime() < Date.parse(promotion.startsAt)) return 'not-started';
  if (now.getTime() > Date.parse(promotion.endsAt)) return 'ended';
  if (promotion.inventoryLimit !== null && promotion.issuedCount >= promotion.inventoryLimit) return 'sold-out';
  if (input.claimedPromotionIds.has(promotion.promotionId)) return 'already-claimed';
  if (!fence.isActive) return 'fence-inactive';
  if (!isScheduleActiveInZone(fence.schedule, now, promotion.timeZone)) return 'outside-schedule';
  const last = input.lastShownAtMs.get(promotion.promotionId) ?? null;
  if (!cooldownElapsed(last, now.getTime(), fence.cooldownMinutes)) return 'cooldown';

  const radius = fence.radiusMetres > 0 ? fence.radiusMetres : GEOFENCE_RADIUS_METRES;
  // A fix whose error circle is wider than the fence proves nothing about being inside it.
  if (input.position.accuracyMetres !== undefined && input.position.accuracyMetres > radius) return 'coarse-fix';
  if (distanceMetres(input.position.coordinates, fence.centre) > radius) return 'too-far';
  return null;
}

/** The nearest fence the guest can fire right now, or why there is none. */
export function findEligibleOffer(input: EligibilityInput): Eligibility {
  if (!mayTriggerGeofencedOffer(input.consent)) return { eligible: false, reason: 'no-consent' };

  let best: { promotion: OfferPromotion; fence: OfferFence; distanceMetres: number } | null = null;
  for (const promotion of input.promotions) {
    for (const fence of promotion.fences) {
      if (fenceBlocker(promotion, fence, input) !== null) continue;
      const metres = distanceMetres(input.position.coordinates, fence.centre);
      // Nearest wins; equal distances fall back to ids so the answer does not depend on row order.
      const better =
        best === null ||
        metres < best.distanceMetres ||
        (metres === best.distanceMetres && fence.geofenceId < best.fence.geofenceId);
      if (better) best = { promotion, fence, distanceMetres: metres };
    }
  }
  return best ? { eligible: true, offer: best } : { eligible: false, reason: 'no-offer' };
}
