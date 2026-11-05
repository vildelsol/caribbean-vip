import type { ExperienceCategory } from '@cvip/types';
import type {
  DemoDestination,
  DemoExperience,
  DemoIsland,
  DemoOption,
  DemoVendor,
} from '@cvip/demo';
import { demoSnapshot, type CatalogueSnapshot, type LiveSlot } from './catalogueSource';

/**
 * Database rows to a `CatalogueSnapshot`. Pure: the fetcher in `supabaseCatalogue.ts` only gets
 * the rows; every decision about what a row means lives here, where it is tested.
 *
 * What the rows do NOT carry, and what this does instead of inventing it:
 *  - **Ratings.** There is no rating column. A rating comes from the `experience_ratings` view
 *    (published reviews only). A listing with no row, or a row that is not a count above zero and
 *    an average from 1 to 5, gets 0 / 0 and the screens hide it (see `Rating`).
 *  - **Cancellation.** `experiences.cancellation_policy` is free-form jsonb with no defined shape.
 *    This reads `free_until_hours` (a non-negative number) and otherwise 0, which the detail
 *    screen shows as "set by the operator" rather than promising a refund window nobody set.
 *  - **Sub-options, minimum age, featured review, meeting point.** Optional on `DemoExperience`
 *    and left unset.
 */

export interface IslandRow { id: string; code: string; name: string; in_app_brand: string | null; greeting: string | null; currency: string; timezone: string; hero_media_path: string | null; is_active: boolean }
export interface DestinationRow { id: string; island_id: string; name: string; slug: string; centre_lat: number; centre_lng: number; editorial_content: string | null; sort_order: number; is_active: boolean }
export interface VendorRow { id: string; island_id: string; trading_name: string; status: string; description: string | null }
export interface LocationRow { vendor_org_id: string; destination_id: string | null; name: string; lat: number; lng: number; is_primary: boolean }
export interface ExperienceRow {
  id: string; vendor_org_id: string; island_id: string; destination_id: string; category: string;
  title: string; summary: string | null; description: string | null; duration_minutes: number;
  inclusions: string[] | null; pickup_info: string | null; cancellation_policy: unknown;
  from_amount_minor: number | string; status: string;
}
export interface MediaRow { experience_id: string; storage_path: string; sort_order: number }
export interface OptionRow {
  id: string; experience_id: string; kind: string; label: string; unit_amount_minor: number | string;
  occupies_capacity: boolean; sort_order: number; is_active: boolean;
}

/** One row of the `experience_ratings` view: published reviews only. */
export interface RatingRow { experience_id: string; average_rating: number | string; review_count: number | string }

/** One row of `availability_slots`. */
export interface SlotRow { experience_id: string; starts_at: string; capacity: number | string; booked_count: number | string; status: string }

export interface CatalogueRows {
  islands: IslandRow[];
  destinations: DestinationRow[];
  vendors: VendorRow[];
  locations: LocationRow[];
  experiences: ExperienceRow[];
  media: MediaRow[];
  options: OptionRow[];
  ratings: RatingRow[];
  slots: SlotRow[];
}

const CURRENCIES = ['USD', 'JMD', 'KYD', 'BBD'] as const;
const CATEGORIES: readonly string[] = [
  'waterfalls', 'beaches', 'adventure', 'food', 'culture', 'nightlife', 'wellness', 'transportation',
];
const finite = (n: unknown): number | null => {
  const v = typeof n === 'string' ? Number(n) : n;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/**
 * Open departures with seats left, grouped by listing and sorted. The start time is read as UTC
 * wall-clock, the convention `slotStartsAt` and `resolve-slot` share, so what the guest picks is
 * exactly what the lookup finds. A closed or cancelled slot, a full one, an unparseable time, or a
 * negative count never reaches the picker.
 */
export function mapSlots(rows: SlotRow[]): Map<string, LiveSlot[]> {
  const out = new Map<string, LiveSlot[]>();
  for (const r of rows) {
    if (r.status !== 'open') continue;
    const capacity = finite(r.capacity);
    const booked = finite(r.booked_count);
    const t = new Date(r.starts_at);
    if (capacity === null || booked === null || Number.isNaN(t.getTime())) continue;
    const remaining = Math.floor(capacity - booked);
    if (remaining < 1) continue;
    const iso = t.toISOString();
    out.set(r.experience_id, [
      ...(out.get(r.experience_id) ?? []),
      { dateISO: iso.slice(0, 10), time: iso.slice(11, 16), capacityRemaining: remaining },
    ]);
  }
  for (const list of out.values()) list.sort((a, b) => (a.dateISO + a.time).localeCompare(b.dateISO + b.time));
  return out;
}

/** Hours of free cancellation the operator set, else 0. Never a default that promises a refund. */
export function cancellationHours(policy: unknown): number {
  const h = finite((policy as { free_until_hours?: unknown } | null)?.free_until_hours);
  return h !== null && h >= 0 ? Math.floor(h) : 0;
}

/**
 * A stored media key as a displayable key. A bare key (`jm-dunns-1`) is a bundled photograph and is
 * kept as is. A path (`<org>/<experience>/<file>`) is a Storage object and becomes its public URL.
 * The path is vendor-supplied, so anything that is not plain path characters, or that contains `..`,
 * is dropped: it could otherwise point the image at another origin or another bucket.
 */
export function mediaKeyFor(storagePath: string, publicBase: string): string | null {
  if (!/^[A-Za-z0-9._\-/]+$/.test(storagePath) || storagePath.includes('..') || storagePath.startsWith('/')) return null;
  if (!storagePath.includes('/')) return storagePath;
  return `${publicBase.replace(/\/$/, '')}/${storagePath}`;
}

export function buildSnapshot(rows: CatalogueRows, publicMediaBase: string): CatalogueSnapshot {
  const islands: DemoIsland[] = rows.islands.map((i) => ({
    id: i.id,
    code: i.code,
    name: i.name,
    in_app_brand: i.in_app_brand ?? i.name,
    greeting: i.greeting ?? '',
    currency: (CURRENCIES as readonly string[]).includes(i.currency) ? (i.currency as DemoIsland['currency']) : 'USD',
    timezone: i.timezone,
    hero_media_path: i.hero_media_path,
    is_active: i.is_active,
  }));
  const destinations: DemoDestination[] = rows.destinations.map((d) => ({ ...d }));
  const slugById = new Map(rows.destinations.map((d) => [d.id, d.slug]));

  const locationFor = (org: string) => {
    const mine = rows.locations.filter((l) => l.vendor_org_id === org);
    return mine.find((l) => l.is_primary) ?? mine[0];
  };
  const vendors: DemoVendor[] = [];
  for (const v of rows.vendors) {
    const loc = locationFor(v.id);
    // A vendor with no location cannot be placed on a map or sorted by distance: leave it out
    // rather than invent coordinates. Its listings then fail the visibility rule and stay hidden.
    if (!loc) continue;
    vendors.push({
      id: v.id,
      islandId: v.island_id,
      tradingName: v.trading_name,
      status: v.status === 'approved' ? 'approved' : 'pending_review',
      description: v.description,
      location: {
        name: loc.name, lat: loc.lat, lng: loc.lng,
        destinationSlug: (loc.destination_id && slugById.get(loc.destination_id)) || '',
      },
    });
  }

  const ratingBy = new Map<string, { avg: number; count: number }>();
  for (const r of rows.ratings) {
    const avg = finite(r.average_rating);
    const count = finite(r.review_count);
    if (avg === null || count === null || count < 1 || avg < 1 || avg > 5) continue;
    ratingBy.set(r.experience_id, { avg: Math.round(avg * 10) / 10, count: Math.floor(count) });
  }

  const mediaBy = new Map<string, MediaRow[]>();
  for (const m of rows.media) mediaBy.set(m.experience_id, [...(mediaBy.get(m.experience_id) ?? []), m]);

  const experiences: DemoExperience[] = [];
  for (const e of rows.experiences) {
    const slug = slugById.get(e.destination_id);
    const price = finite(e.from_amount_minor);
    // A listing the app cannot place or price is dropped, not shown with a made-up value.
    if (!slug || price === null || price < 0 || !CATEGORIES.includes(e.category)) continue;
    const media = (mediaBy.get(e.id) ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => mediaKeyFor(m.storage_path, publicMediaBase))
      .filter((k): k is string => k !== null);
    experiences.push({
      id: e.id,
      vendorId: e.vendor_org_id,
      islandId: e.island_id,
      destinationSlug: slug,
      category: e.category as ExperienceCategory,
      title: e.title,
      summary: e.summary,
      description: e.description,
      durationMinutes: e.duration_minutes,
      inclusions: e.inclusions ?? [],
      pickupInfo: e.pickup_info,
      fromAmountMinor: price,
      status: e.status === 'approved' ? 'approved' : 'draft',
      cancellationHours: cancellationHours(e.cancellation_policy),
      media,
      ratingAverage: ratingBy.get(e.id)?.avg ?? 0,
      ratingCount: ratingBy.get(e.id)?.count ?? 0,
    });
  }

  const optionsBy = new Map<string, DemoOption[]>();
  for (const o of [...rows.options].filter((x) => x.is_active).sort((a, b) => a.sort_order - b.sort_order)) {
    const amount = finite(o.unit_amount_minor);
    if (amount === null || amount < 0) continue;
    // `infant` and `ticket_type` have no counterpart in the booking UI yet; treated as add-ons only
    // when they do not take a seat. A seat-taking infant ticket is dropped rather than mis-priced.
    const kind: DemoOption['kind'] | null =
      o.kind === 'adult' || o.kind === 'child' || o.kind === 'addon' ? o.kind : null;
    if (!kind) continue;
    optionsBy.set(o.experience_id, [
      ...(optionsBy.get(o.experience_id) ?? []),
      { id: o.id, label: o.label, kind, unitAmountMinor: amount, occupiesCapacity: o.occupies_capacity },
    ]);
  }

  return {
    islands, destinations, vendors, experiences,
    optionsFor: (experience) => optionsBy.get(experience.id) ?? [],
    mediaCredits: demoSnapshot().mediaCredits,
    slots: mapSlots(rows.slots),
  };
}
