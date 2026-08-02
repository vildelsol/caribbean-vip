import type { SearchFilters } from '@cvip/types';
import { demoBackend, demoMediaCredit, demoOptionsFor } from '@cvip/demo';
import { supabase } from './supabase';
import { isDemoMode } from './mode';

/**
 * Catalogue reads.
 *
 * Dispatches between the demo backend and Supabase. Every Supabase query here relies on RLS for
 * visibility rather than adding `status = 'approved'` itself (AD-10), and the demo path applies
 * the same rule in `isPubliclyVisibleDemo` — so neither path can surface a listing the other
 * would hide.
 */

export interface CatalogueItem {
  id: string;
  vendorOrgId: string;
  islandId: string;
  destinationId: string;
  category: string;
  title: string;
  summary: string | null;
  durationMinutes: number;
  fromAmountMinor: number;
  currency: string;
  isDemo: boolean;
  /**
   * Key into the bundled demo photography, or null.
   *
   * Null in live mode: real listings store media as Supabase Storage paths, and nothing has been
   * uploaded to a hosted project yet, so a card renders its text-only layout rather than a broken
   * image. See `apps/mobile/lib/demoMedia.ts`.
   */
  heroMediaKey: string | null;
}

interface SearchRow {
  id: string;
  vendor_org_id: string;
  island_id: string;
  destination_id: string;
  category: string;
  title: string;
  summary: string | null;
  duration_minutes: number;
  from_amount_minor: number;
  currency: string;
  is_demo: boolean;
}

function toItem(row: SearchRow): CatalogueItem {
  return {
    id: row.id,
    vendorOrgId: row.vendor_org_id,
    islandId: row.island_id,
    destinationId: row.destination_id,
    category: row.category,
    title: row.title,
    summary: row.summary,
    durationMinutes: row.duration_minutes,
    fromAmountMinor: Number(row.from_amount_minor),
    currency: row.currency,
    isDemo: row.is_demo,
    heroMediaKey: null,
  };
}

export interface SearchResult {
  items: CatalogueItem[];
  error: string | null;
}

export async function searchCatalogue(
  filters: SearchFilters,
  limit = 50,
): Promise<SearchResult> {
  if (isDemoMode) {
    const q = filters.query.trim().toLowerCase();

    const items = demoBackend
      .visibleExperiences(filters.islandId)
      .filter((e) => {
        if (q && !`${e.title} ${e.summary}`.toLowerCase().includes(q)) return false;
        if (filters.destinationId) {
          const dest = demoBackend.destinationBySlug(e.destinationSlug);
          if (dest?.id !== filters.destinationId) return false;
        }
        if (filters.categories.length > 0 && !filters.categories.includes(e.category)) return false;
        if (filters.minPriceMinor !== undefined && e.fromAmountMinor < filters.minPriceMinor) {
          return false;
        }
        if (filters.maxPriceMinor !== undefined && e.fromAmountMinor > filters.maxPriceMinor) {
          return false;
        }
        if (
          filters.maxDurationMinutes !== undefined &&
          e.durationMinutes > filters.maxDurationMinutes
        ) {
          return false;
        }
        return true;
      })
      .slice(0, limit)
      .map((e) => {
        const dest = demoBackend.destinationBySlug(e.destinationSlug);
        return {
          id: e.id,
          vendorOrgId: e.vendorId,
          islandId: 'island-jm',
          destinationId: dest?.id ?? '',
          category: e.category,
          title: e.title,
          summary: e.summary,
          durationMinutes: e.durationMinutes,
          fromAmountMinor: e.fromAmountMinor,
          currency: 'USD',
          isDemo: true,
          heroMediaKey: e.media[0] ?? null,
        };
      });

    return { items, error: null };
  }

  const { data, error } = await supabase.rpc('search_experiences', {
    p_query: filters.query || '',
    p_island_id: filters.islandId ?? null,
    p_destination_id: filters.destinationId ?? null,
    p_categories: filters.categories.length > 0 ? filters.categories : null,
    p_min_price_minor: filters.minPriceMinor ?? null,
    p_max_price_minor: filters.maxPriceMinor ?? null,
    p_max_duration_min: filters.maxDurationMinutes ?? null,
    p_limit: limit,
    p_offset: 0,
  });

  if (error) return { items: [], error: error.message };
  return { items: ((data ?? []) as SearchRow[]).map(toItem), error: null };
}

export interface ExperienceDetail extends CatalogueItem {
  description: string | null;
  inclusions: string[];
  exclusions: string[];
  pickupInfo: string | null;
  meetingPoint: string | null;
  cancellationPolicy: Record<string, unknown>;
  vendorName: string | null;
  destinationName: string | null;
  media: { id: string; storagePath: string; altText: string | null }[];
  options: {
    id: string;
    kind: string;
    label: string;
    unitAmountMinor: number;
    currency: string;
    occupiesCapacity: boolean;
  }[];
  upcomingSlots: { id: string; startsAt: string; capacity: number; bookedCount: number }[];
  reviews: { id: string; rating: number; body: string | null; createdAt: string }[];
  /** The offer attached to this listing, if any. */
  promotion: { id: string; title: string; terms: string } | null;
}

/**
 * Load one experience with everything the detail page needs (PRD §5).
 *
 * Returns null when the listing is not publicly visible — the same answer RLS gives for a draft,
 * a suspended vendor's listing, or an id that does not exist. The UI must not distinguish those
 * cases, because doing so would confirm that a hidden listing exists.
 */
export async function loadExperience(id: string): Promise<{
  detail: ExperienceDetail | null;
  error: string | null;
}> {
  if (isDemoMode) {
    const exp = demoBackend.experience(id);
    if (!exp) return { detail: null, error: null };

    const vendor = demoBackend.vendor(exp.vendorId);
    const dest = demoBackend.destinationBySlug(exp.destinationSlug);
    const promo = demoBackend.promotionFor(exp.id);

    return {
      detail: {
        id: exp.id,
        vendorOrgId: exp.vendorId,
        islandId: 'island-jm',
        destinationId: dest?.id ?? '',
        category: exp.category,
        title: exp.title,
        summary: exp.summary,
        description: exp.description,
        durationMinutes: exp.durationMinutes,
        fromAmountMinor: exp.fromAmountMinor,
        currency: 'USD',
        isDemo: true,
        heroMediaKey: exp.media[0] ?? null,
        inclusions: exp.inclusions,
        exclusions: [],
        pickupInfo: exp.pickupInfo,
        meetingPoint: vendor?.location.name ?? null,
        cancellationPolicy: { free_cancellation_hours: exp.cancellationHours },
        vendorName: vendor?.tradingName ?? null,
        destinationName: dest?.name ?? null,
        // In demo mode `storagePath` carries the media KEY rather than a Storage path — the UI
        // resolves it through `demoImage()`. `altText` is the photograph's true subject, which is
        // both the accessible description and half of the required attribution.
        media: exp.media.map((key) => ({
          id: key,
          storagePath: key,
          altText: demoMediaCredit(key)?.subject ?? null,
        })),
        options: demoOptionsFor(exp).map((o) => ({
          id: o.id,
          kind: o.kind,
          label: o.label,
          unitAmountMinor: o.unitAmountMinor,
          currency: 'USD',
          occupiesCapacity: o.occupiesCapacity,
        })),
        upcomingSlots: demoBackend.upcomingSlots(exp.id).map((s) => ({
          id: s.id,
          startsAt: s.startsAt,
          capacity: s.capacity,
          bookedCount: s.bookedCount,
        })),
        reviews: [],
        promotion: promo ? { id: promo.id, title: promo.title, terms: promo.terms } : null,
      },
      error: null,
    };
  }

  const { data, error } = await supabase
    .from('experiences')
    .select(
      `id, vendor_org_id, island_id, destination_id, category, title, summary, description,
       duration_minutes, inclusions, exclusions, pickup_info, meeting_point, cancellation_policy,
       from_amount_minor, currency, is_demo,
       vendor_organizations ( trading_name ),
       destinations ( name ),
       experience_media ( id, storage_path, alt_text, sort_order ),
       experience_options ( id, kind, label, unit_amount_minor, currency, occupies_capacity, sort_order, is_active ),
       availability_slots ( id, starts_at, capacity, booked_count, status ),
       reviews ( id, rating, body, created_at, moderation_state )`,
    )
    .eq('id', id)
    .maybeSingle();

  if (error) return { detail: null, error: error.message };
  if (!data) return { detail: null, error: null };

  const r = data as unknown as Record<string, unknown>;

  const media = ((r.experience_media as Record<string, unknown>[]) ?? [])
    .slice()
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map((m) => ({
      id: String(m.id),
      storagePath: String(m.storage_path),
      altText: (m.alt_text as string | null) ?? null,
    }));

  const options = ((r.experience_options as Record<string, unknown>[]) ?? [])
    .filter((o) => o.is_active !== false)
    .slice()
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map((o) => ({
      id: String(o.id),
      kind: String(o.kind),
      label: String(o.label),
      unitAmountMinor: Number(o.unit_amount_minor),
      currency: String(o.currency),
      occupiesCapacity: o.occupies_capacity !== false,
    }));

  const now = Date.now();
  const upcomingSlots = ((r.availability_slots as Record<string, unknown>[]) ?? [])
    .filter((s) => s.status === 'open' && new Date(String(s.starts_at)).getTime() > now)
    .sort(
      (a, b) => new Date(String(a.starts_at)).getTime() - new Date(String(b.starts_at)).getTime(),
    )
    .slice(0, 12)
    .map((s) => ({
      id: String(s.id),
      startsAt: String(s.starts_at),
      capacity: Number(s.capacity),
      bookedCount: Number(s.booked_count),
    }));

  const reviews = ((r.reviews as Record<string, unknown>[]) ?? [])
    .filter((v) => v.moderation_state === 'published')
    .map((v) => ({
      id: String(v.id),
      rating: Number(v.rating),
      body: (v.body as string | null) ?? null,
      createdAt: String(v.created_at),
    }));

  const vendor = r.vendor_organizations as { trading_name?: string } | null;
  const destination = r.destinations as { name?: string } | null;

  return {
    detail: {
      id: String(r.id),
      vendorOrgId: String(r.vendor_org_id),
      islandId: String(r.island_id),
      destinationId: String(r.destination_id),
      category: String(r.category),
      title: String(r.title),
      summary: (r.summary as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      durationMinutes: Number(r.duration_minutes),
      fromAmountMinor: Number(r.from_amount_minor),
      currency: String(r.currency),
      isDemo: Boolean(r.is_demo),
      heroMediaKey: null,
      inclusions: (r.inclusions as string[]) ?? [],
      exclusions: (r.exclusions as string[]) ?? [],
      pickupInfo: (r.pickup_info as string | null) ?? null,
      meetingPoint: (r.meeting_point as string | null) ?? null,
      cancellationPolicy: (r.cancellation_policy as Record<string, unknown>) ?? {},
      vendorName: vendor?.trading_name ?? null,
      destinationName: destination?.name ?? null,
      media,
      options,
      upcomingSlots,
      reviews,
      promotion: null,
    },
    error: null,
  };
}

export async function loadVendorLocations(islandId: string): Promise<
  { vendorOrgId: string; name: string; lat: number; lng: number; destinationId: string | null }[]
> {
  if (isDemoMode) {
    return demoBackend
      .visibleExperiences(islandId)
      .map((e) => demoBackend.vendor(e.vendorId))
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i)
      .map((v) => ({
        vendorOrgId: v.id,
        name: v.location.name,
        lat: v.location.lat,
        lng: v.location.lng,
        destinationId: demoBackend.destinationBySlug(v.location.destinationSlug)?.id ?? null,
      }));
  }

  const { data, error } = await supabase
    .from('vendor_locations')
    .select('vendor_org_id, name, lat, lng, destination_id, vendor_organizations!inner(island_id)')
    .eq('vendor_organizations.island_id', islandId);

  if (error) {
    console.warn('[catalogue] could not load vendor locations:', error.message);
    return [];
  }

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    vendorOrgId: String(r.vendor_org_id),
    name: String(r.name),
    lat: Number(r.lat),
    lng: Number(r.lng),
    destinationId: (r.destination_id as string | null) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Saved items
// ---------------------------------------------------------------------------

export async function loadSavedExperienceIds(userId: string): Promise<Set<string>> {
  if (isDemoMode) return new Set(demoBackend.savedExperienceIds);

  const { data, error } = await supabase
    .from('saved_items')
    .select('item_id')
    .eq('user_id', userId)
    .eq('item_type', 'experience');

  if (error) {
    console.warn('[catalogue] could not load saved items:', error.message);
    return new Set();
  }
  return new Set(((data ?? []) as { item_id: string }[]).map((r) => r.item_id));
}

export async function toggleSavedExperience(
  userId: string,
  experienceId: string,
  currentlySaved: boolean,
): Promise<{ saved: boolean; error: string | null }> {
  if (isDemoMode) {
    return { saved: demoBackend.toggleSaved(experienceId), error: null };
  }

  if (currentlySaved) {
    const { error } = await supabase
      .from('saved_items')
      .delete()
      .eq('user_id', userId)
      .eq('item_type', 'experience')
      .eq('item_id', experienceId);
    return { saved: error ? true : false, error: error?.message ?? null };
  }

  const { error } = await supabase
    .from('saved_items')
    .insert({ user_id: userId, item_type: 'experience', item_id: experienceId });
  return { saved: error ? false : true, error: error?.message ?? null };
}
