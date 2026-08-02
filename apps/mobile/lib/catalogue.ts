import type { SearchFilters } from '@cvip/types';
import { supabase } from './supabase';

/**
 * Catalogue reads for the tourist app.
 *
 * Every query here relies on RLS for visibility rather than adding `status = 'approved'` itself
 * (AD-10). That is deliberate: the guarantee lives in one place, is covered by negative database
 * tests, and cannot be forgotten at a new call site.
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
  rating?: number | null;
  reviewCount?: number;
  coordinates?: { lat: number; lng: number } | null;
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
  };
}

export interface SearchResult {
  items: CatalogueItem[];
  error: string | null;
}

/**
 * Search the public catalogue.
 *
 * Filters go to the database rather than being applied after fetching, so a filtered search does
 * not silently return only what happened to be in the first page.
 */
export async function searchCatalogue(
  filters: SearchFilters,
  limit = 50,
): Promise<SearchResult> {
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
}

/**
 * Load one experience with everything the detail page needs (PRD §5).
 *
 * Returns null when the listing is not publicly visible — which is the same answer RLS gives for
 * a draft, a suspended vendor's listing, or an id that does not exist. The UI must not
 * distinguish those cases, because doing so would confirm that a hidden listing exists.
 */
export async function loadExperience(id: string): Promise<{
  detail: ExperienceDetail | null;
  error: string | null;
}> {
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

  const row = data as unknown as Record<string, never> & Record<string, unknown>;
  const r = row as Record<string, unknown>;

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
      (a, b) =>
        new Date(String(a.starts_at)).getTime() - new Date(String(b.starts_at)).getTime(),
    )
    .slice(0, 12)
    .map((s) => ({
      id: String(s.id),
      startsAt: String(s.starts_at),
      capacity: Number(s.capacity),
      bookedCount: Number(s.booked_count),
    }));

  // Belt and braces: RLS already restricts reviews to published ones for a tourist, but the
  // filter documents the intent at the point of use.
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
    },
    error: null,
  };
}

/**
 * Vendor locations for the island, used as map markers and to compute distance.
 *
 * Only approved vendors' locations are readable, so the Nearby map cannot plot a pin for a
 * business that is not live.
 */
export async function loadVendorLocations(islandId: string): Promise<
  { vendorOrgId: string; name: string; lat: number; lng: number; destinationId: string | null }[]
> {
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
// Saved items — requires an account
// ---------------------------------------------------------------------------

export async function loadSavedExperienceIds(userId: string): Promise<Set<string>> {
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
