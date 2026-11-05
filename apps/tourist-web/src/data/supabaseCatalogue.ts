import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSnapshot, mapSlots, type CatalogueRows, type SlotRow } from './catalogueMapping';
import type { CatalogueSnapshot } from './catalogueSource';

/**
 * Fetch the public catalogue in one round of parallel reads. Every table here has a public-read RLS
 * policy, so the database already hides draft listings and unapproved vendors; the mapper and
 * `catalogue.ts` apply the same rule again so a policy mistake cannot expose a hidden listing.
 * Throws on any error: the caller decides what to show, and a half-loaded catalogue is never used.
 */
/** Departures worth fetching: from now to three weeks ahead (the picker shows two). */
const SLOT_WINDOW_DAYS = 21;
const PAGE = 1000;

/**
 * Every open departure in the window. PostgREST returns at most 1000 rows a request, and a busy
 * catalogue exceeds that, so this pages with a stable order. A short read would silently drop
 * departures, so a failed page throws rather than returning what it has.
 */
export async function fetchSlotRows(client: SupabaseClient, now = new Date()): Promise<SlotRow[]> {
  const from = now.toISOString();
  const to = new Date(now.getTime() + SLOT_WINDOW_DAYS * 86_400_000).toISOString();
  const rows: SlotRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client
      .from('availability_slots')
      .select('experience_id, starts_at, capacity, booked_count, status')
      .eq('status', 'open')
      .gte('starts_at', from)
      .lte('starts_at', to)
      .order('starts_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`catalogue: availability_slots: ${error.message}`);
    const page = (data ?? []) as SlotRow[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export async function fetchSlots(client: SupabaseClient, now = new Date()) {
  return mapSlots(await fetchSlotRows(client, now));
}

export async function fetchCatalogue(client: SupabaseClient, publicMediaBase: string): Promise<CatalogueSnapshot> {
  const read = async <T,>(table: string, columns: string): Promise<T[]> => {
    const { data, error } = await client.from(table).select(columns);
    if (error) throw new Error(`catalogue: ${table}: ${error.message}`);
    return (data ?? []) as T[];
  };
  const [islands, destinations, vendors, locations, experiences, media, options, ratings, slots, pricing] = await Promise.all([
    read<CatalogueRows['islands'][number]>('islands', 'id, code, name, in_app_brand, greeting, currency, timezone, hero_media_path, is_active'),
    read<CatalogueRows['destinations'][number]>('destinations', 'id, island_id, name, slug, centre_lat, centre_lng, editorial_content, sort_order, is_active'),
    read<CatalogueRows['vendors'][number]>('vendor_organizations', 'id, island_id, trading_name, status, description'),
    read<CatalogueRows['locations'][number]>('vendor_locations', 'vendor_org_id, destination_id, name, lat, lng, is_primary'),
    read<CatalogueRows['experiences'][number]>('experiences', 'id, vendor_org_id, island_id, destination_id, category, title, summary, description, duration_minutes, inclusions, pickup_info, cancellation_policy, from_amount_minor, status'),
    read<CatalogueRows['media'][number]>('experience_media', 'experience_id, storage_path, sort_order'),
    read<CatalogueRows['options'][number]>('experience_options', 'id, experience_id, kind, label, unit_amount_minor, occupies_capacity, sort_order, is_active'),
    read<CatalogueRows['ratings'][number]>('experience_ratings', 'experience_id, average_rating, review_count'),
    fetchSlotRows(client),
    (async () => {
      const { data, error } = await client.rpc('public_pricing');
      if (error) throw new Error(`catalogue: public_pricing: ${error.message}`);
      return (data ?? null) as CatalogueRows['pricing'];
    })(),
  ]);
  return buildSnapshot({ islands, destinations, vendors, locations, experiences, media, options, ratings, slots, pricing }, publicMediaBase);
}
