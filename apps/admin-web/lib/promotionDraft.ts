import { CURRENCIES } from '@cvip/types';

/**
 * Turning the admin's create-promotion form into database rows — the rules, with no I/O.
 *
 * Every check here mirrors a constraint in `20260802000005_promotions_and_geofences.sql`, so a
 * mistake is named in the form instead of surfacing as a database error. The database stays the
 * authority: this only fails earlier and in plainer words.
 */

export type PromotionValueKind = 'percentage' | 'fixed' | 'in_kind';

/** Form values, as typed: strings, because that is what inputs hold. */
export interface PromotionDraft {
  vendorId: string;
  title: string;
  description: string;
  terms: string;
  valueKind: PromotionValueKind;
  /** Percentage points, "10" for 10%. */
  percent: string;
  /** Major units, "15.00". */
  amount: string;
  currency: string;
  startsAt: string;
  endsAt: string;
  inventoryLimit: string;
  /** A test offer, stored with `is_demo` so it can be told apart and removed. */
  isTest: boolean;
  centreLat: string;
  centreLng: string;
  radiusMetres: string;
  /** 0 = Sunday .. 6 = Saturday. Empty means every day. */
  days: number[];
  fromTime: string;
  toTime: string;
  cooldownMinutes: string;
}

export interface PromotionRow {
  vendor_org_id: string;
  island_id: string;
  title: string;
  description: string | null;
  terms: string;
  value_kind: PromotionValueKind;
  value_rate: number | null;
  value_amount_minor: number | null;
  currency: string | null;
  starts_at: string;
  ends_at: string;
  inventory_limit: number | null;
  requires_booking: boolean;
  is_demo: boolean;
}

export interface GeofenceRow {
  centre_lat: number;
  centre_lng: number;
  radius_m: number;
  active_days: number[];
  active_from_time: string | null;
  active_to_time: string | null;
  cooldown_minutes: number;
}

export const DEFAULT_COOLDOWN_MINUTES = 1440;

// A radius under ~50 m is inside consumer GPS error; over 20 km is not "nearby".
export const MIN_RADIUS_METRES = 50;
export const MAX_RADIUS_METRES = 20000;

export function emptyDraft(): PromotionDraft {
  return {
    vendorId: '',
    title: '',
    description: '',
    terms: '',
    valueKind: 'in_kind',
    percent: '',
    amount: '',
    currency: 'USD',
    startsAt: '',
    endsAt: '',
    inventoryLimit: '',
    isTest: false,
    centreLat: '',
    centreLng: '',
    radiusMetres: '250',
    days: [],
    fromTime: '',
    toTime: '',
    cooldownMinutes: String(DEFAULT_COOLDOWN_MINUTES),
  };
}

function num(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function wholeNumber(text: string): number | null {
  const n = num(text);
  return n !== null && Number.isInteger(n) ? n : null;
}

function validTime(text: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(text);
  return m !== null && Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

export type DraftResult =
  | { ok: true; promotion: PromotionRow; geofence: GeofenceRow }
  | { ok: false; problems: string[] };

/**
 * `vendorIsland` is the island of the chosen vendor: an offer belongs to the island its vendor
 * trades on, so the admin is not asked to pick one that could disagree.
 */
export function buildPromotion(draft: PromotionDraft, vendorIsland: string | null, now: Date): DraftResult {
  const problems: string[] = [];

  if (draft.vendorId === '' || vendorIsland === null) problems.push('Choose a vendor.');
  const title = draft.title.trim();
  if (title === '') problems.push('Give the offer a title.');
  // Terms are mandatory so an offer cannot ship without them (PRD §9).
  const terms = draft.terms.trim();
  if (terms === '') problems.push('Terms are required: the tourist sees them before claiming.');

  let valueRate: number | null = null;
  let valueAmountMinor: number | null = null;
  let currency: string | null = null;
  if (draft.valueKind === 'percentage') {
    const pct = num(draft.percent);
    if (pct === null || pct <= 0 || pct > 100) problems.push('A percentage offer needs a percentage above 0 and up to 100.');
    else valueRate = Math.round(pct * 100) / 10000;
  } else if (draft.valueKind === 'fixed') {
    const amount = num(draft.amount);
    if (amount === null || amount <= 0) problems.push('A fixed-amount offer needs an amount above 0.');
    else valueAmountMinor = Math.round(amount * 100);
    if (!(CURRENCIES as readonly string[]).includes(draft.currency)) problems.push('Choose a currency for the amount.');
    else currency = draft.currency;
  }

  const starts = Date.parse(draft.startsAt);
  const ends = Date.parse(draft.endsAt);
  if (Number.isNaN(starts) || Number.isNaN(ends)) problems.push('Set both a start and an end date.');
  else if (ends <= starts) problems.push('The end must come after the start.');
  else if (ends <= now.getTime()) problems.push('The end is already in the past, so nobody could ever see this offer.');

  let inventory: number | null = null;
  if (draft.inventoryLimit.trim() !== '') {
    inventory = wholeNumber(draft.inventoryLimit);
    if (inventory === null || inventory < 0) problems.push('The inventory limit must be a whole number, or left blank for no limit.');
  }

  const lat = num(draft.centreLat);
  const lng = num(draft.centreLng);
  if (lat === null || lat < -90 || lat > 90) problems.push('Latitude must be between -90 and 90.');
  if (lng === null || lng < -180 || lng > 180) problems.push('Longitude must be between -180 and 180.');

  const radius = wholeNumber(draft.radiusMetres);
  if (radius === null || radius < MIN_RADIUS_METRES || radius > MAX_RADIUS_METRES) {
    problems.push(`The radius must be a whole number of metres from ${MIN_RADIUS_METRES} to ${MAX_RADIUS_METRES}.`);
  }

  const cooldown = wholeNumber(draft.cooldownMinutes);
  if (cooldown === null || cooldown < 0) problems.push('The cooldown must be a whole number of minutes, 0 or more.');

  if (draft.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) problems.push('Active days must be 0 (Sunday) to 6 (Saturday).');
  const from = draft.fromTime.trim();
  const to = draft.toTime.trim();
  if (from !== '' && !validTime(from)) problems.push('The start time must look like 09:00.');
  if (to !== '' && !validTime(to)) problems.push('The end time must look like 17:00.');
  // Equal times describe a window of no length: the fence would never fire.
  if (from !== '' && from === to) problems.push('The start and end time are the same, so the offer would never be active.');

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    promotion: {
      vendor_org_id: draft.vendorId,
      island_id: vendorIsland!,
      title,
      description: draft.description.trim() === '' ? null : draft.description.trim(),
      terms,
      value_kind: draft.valueKind,
      value_rate: valueRate,
      value_amount_minor: valueAmountMinor,
      currency,
      starts_at: new Date(starts).toISOString(),
      ends_at: new Date(ends).toISOString(),
      inventory_limit: inventory,
      // Standalone saved offers first (OD-07).
      requires_booking: false,
      is_demo: draft.isTest,
    },
    geofence: {
      centre_lat: lat!,
      centre_lng: lng!,
      radius_m: radius!,
      active_days: [...new Set(draft.days)].sort((a, b) => a - b),
      active_from_time: from === '' ? null : from,
      active_to_time: to === '' ? null : to,
      cooldown_minutes: cooldown!,
    },
  };
}
