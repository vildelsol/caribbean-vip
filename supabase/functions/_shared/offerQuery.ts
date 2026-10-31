import type { OfferFence, OfferPromotion } from '@cvip/offers';
import type { ApprovalState, VendorStatus } from '@cvip/types';

/**
 * The pure edges of `eligible-offer`: what it accepts, how database rows become the plain data
 * `@cvip/offers` decides over, and what it hands back. In its own file for the same reason as the
 * other `_shared` modules: the function around it needs Deno and a live Supabase.
 */

export type OfferRequest =
  | { ok: true; lat: number; lng: number; accuracyMetres: number | undefined; islandCode: string }
  | { ok: false; message: string };

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Validates the body. Nothing here is an identity: the caller comes from Auth, never from this. */
export function parseOfferRequest(body: unknown): OfferRequest {
  if (typeof body !== 'object' || body === null) return { ok: false, message: 'Send a JSON body.' };
  const b = body as Record<string, unknown>;
  if (!finite(b.lat) || b.lat < -90 || b.lat > 90) return { ok: false, message: 'lat must be a number from -90 to 90.' };
  if (!finite(b.lng) || b.lng < -180 || b.lng > 180) return { ok: false, message: 'lng must be a number from -180 to 180.' };
  if (b.accuracyMetres !== undefined && b.accuracyMetres !== null && (!finite(b.accuracyMetres) || b.accuracyMetres < 0)) {
    return { ok: false, message: 'accuracyMetres must be a number, 0 or more.' };
  }
  if (typeof b.islandCode !== 'string' || !/^[A-Za-z]{2}$/.test(b.islandCode)) {
    return { ok: false, message: 'islandCode must be a two-letter island code.' };
  }
  return {
    ok: true,
    lat: b.lat,
    lng: b.lng,
    accuracyMetres: finite(b.accuracyMetres) ? b.accuracyMetres : undefined,
    islandCode: b.islandCode.toUpperCase(),
  };
}

// Vouchers the guest still holds or has used. A cancelled or invalidated one does not stop the
// offer being shown again; an expired one belongs to a window that has closed anyway.
const HELD_VOUCHER_STATES: ReadonlySet<string> = new Set(['issued', 'saved', 'attached_to_booking', 'active', 'redeemed']);

export function claimedPromotionIds(vouchers: ReadonlyArray<{ promotion_id: string | null; state: string }>): Set<string> {
  const ids = new Set<string>();
  for (const v of vouchers) if (v.promotion_id && HELD_VOUCHER_STATES.has(v.state)) ids.add(v.promotion_id);
  return ids;
}

/** The most recent impression per promotion, in epoch ms. */
export function lastShownAtMs(impressions: ReadonlyArray<{ promotion_id: string; shown_at: string }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of impressions) {
    const at = Date.parse(i.shown_at);
    if (Number.isNaN(at)) continue;
    const prior = out.get(i.promotion_id);
    if (prior === undefined || at > prior) out.set(i.promotion_id, at);
  }
  return out;
}

export interface PromotionRow {
  id: string;
  vendor_org_id: string;
  island_id: string;
  title: string;
  description: string | null;
  terms: string;
  value_kind: 'percentage' | 'fixed' | 'in_kind';
  value_rate: number | string | null;
  value_amount_minor: number | string | null;
  currency: string | null;
  starts_at: string;
  ends_at: string;
  inventory_limit: number | null;
  issued_count: number;
  approval_state: ApprovalState;
  is_demo: boolean;
}

export interface GeofenceRow {
  id: string;
  promotion_id: string;
  centre_lat: number;
  centre_lng: number;
  radius_m: number;
  active_days: number[] | null;
  active_from_time: string | null;
  active_to_time: string | null;
  cooldown_minutes: number;
  is_active: boolean;
}

const orNull = (v: number | string | null): number | null => (v === null ? null : Number(v));

/**
 * Joins the three reads into `OfferPromotion`s. A promotion whose vendor row is missing is given
 * a status that no rule accepts, so a dangling reference fails closed instead of being offered.
 */
export function toOfferPromotions(
  promotions: readonly PromotionRow[],
  geofences: readonly GeofenceRow[],
  vendorStatusById: ReadonlyMap<string, VendorStatus>,
  island: { id: string; timeZone: string },
): OfferPromotion[] {
  return promotions.map((p) => {
    const fences: OfferFence[] = geofences
      .filter((g) => g.promotion_id === p.id)
      .map((g) => ({
        geofenceId: g.id,
        centre: { lat: g.centre_lat, lng: g.centre_lng },
        radiusMetres: g.radius_m,
        isActive: g.is_active,
        schedule: {
          activeDays: g.active_days ?? [],
          activeFromTime: g.active_from_time,
          activeToTime: g.active_to_time,
        },
        cooldownMinutes: g.cooldown_minutes,
      }));
    return {
      promotionId: p.id,
      islandId: p.island_id,
      timeZone: island.timeZone,
      vendorStatus: vendorStatusById.get(p.vendor_org_id) ?? 'rejected',
      approvalState: p.approval_state,
      isDemo: p.is_demo,
      title: p.title,
      description: p.description,
      terms: p.terms,
      valueKind: p.value_kind,
      valueRate: orNull(p.value_rate),
      valueAmountMinor: orNull(p.value_amount_minor),
      currency: p.currency,
      startsAt: p.starts_at,
      endsAt: p.ends_at,
      inventoryLimit: p.inventory_limit,
      issuedCount: p.issued_count,
      fences,
    };
  });
}

export interface OfferResponse {
  promotionId: string;
  geofenceId: string;
  title: string;
  description: string | null;
  terms: string;
  valueKind: 'percentage' | 'fixed' | 'in_kind';
  valueRate: number | null;
  valueAmountMinor: number | null;
  currency: string | null;
  endsAt: string;
  distanceMetres: number;
}

/**
 * What the guest is told. The fence centre and radius are left out on purpose: the schema keeps
 * `geofences` unreadable so nobody can map the trigger zones, and a response that echoed them
 * would hand the map out one offer at a time.
 */
export function toOfferResponse(offer: { promotion: OfferPromotion; fence: OfferFence; distanceMetres: number }): OfferResponse {
  const p = offer.promotion;
  return {
    promotionId: p.promotionId,
    geofenceId: offer.fence.geofenceId,
    title: p.title,
    description: p.description,
    terms: p.terms,
    valueKind: p.valueKind,
    valueRate: p.valueRate,
    valueAmountMinor: p.valueAmountMinor,
    currency: p.currency,
    endsAt: p.endsAt,
    distanceMetres: Math.round(offer.distanceMetres),
  };
}
