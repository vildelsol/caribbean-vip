import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSnapshot, type CatalogueRows } from './catalogueMapping';
import type { CatalogueSnapshot } from './catalogueSource';

/**
 * Fetch the public catalogue in one round of parallel reads. Every table here has a public-read RLS
 * policy, so the database already hides draft listings and unapproved vendors; the mapper and
 * `catalogue.ts` apply the same rule again so a policy mistake cannot expose a hidden listing.
 * Throws on any error: the caller decides what to show, and a half-loaded catalogue is never used.
 */
export async function fetchCatalogue(client: SupabaseClient, publicMediaBase: string): Promise<CatalogueSnapshot> {
  const read = async <T,>(table: string, columns: string): Promise<T[]> => {
    const { data, error } = await client.from(table).select(columns);
    if (error) throw new Error(`catalogue: ${table}: ${error.message}`);
    return (data ?? []) as T[];
  };
  const [islands, destinations, vendors, locations, experiences, media, options] = await Promise.all([
    read<CatalogueRows['islands'][number]>('islands', 'id, code, name, in_app_brand, greeting, currency, timezone, hero_media_path, is_active'),
    read<CatalogueRows['destinations'][number]>('destinations', 'id, island_id, name, slug, centre_lat, centre_lng, editorial_content, sort_order, is_active'),
    read<CatalogueRows['vendors'][number]>('vendor_organizations', 'id, island_id, trading_name, status, description'),
    read<CatalogueRows['locations'][number]>('vendor_locations', 'vendor_org_id, destination_id, name, lat, lng, is_primary'),
    read<CatalogueRows['experiences'][number]>('experiences', 'id, vendor_org_id, island_id, destination_id, category, title, summary, description, duration_minutes, inclusions, pickup_info, cancellation_policy, from_amount_minor, status'),
    read<CatalogueRows['media'][number]>('experience_media', 'experience_id, storage_path, sort_order'),
    read<CatalogueRows['options'][number]>('experience_options', 'id, experience_id, kind, label, unit_amount_minor, occupies_capacity, sort_order, is_active'),
  ]);
  return buildSnapshot({ islands, destinations, vendors, locations, experiences, media, options }, publicMediaBase);
}
