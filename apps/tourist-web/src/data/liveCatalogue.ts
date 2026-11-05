import type { SupabaseClient } from '@supabase/supabase-js';
import { installCatalogue } from './catalogueSource';
import { fetchCatalogue } from './supabaseCatalogue';

/** Public URL prefix of the `experience-media` bucket for a project URL. */
export function publicMediaBase(projectUrl: string): string {
  return `${projectUrl.replace(/\/+$/, '')}/storage/v1/object/public/experience-media`;
}

export type CatalogueLoad = { ok: true } | { ok: false };

/**
 * Live mode only: fetch the catalogue and install it. On any failure nothing is installed and the
 * result says so. The bundled demo listings are never used as a fallback: in live mode they are
 * made-up operators and prices, and showing them because a request failed would put them in front of
 * a guest as if they were real.
 */
export async function loadLiveCatalogue(
  client: SupabaseClient,
  projectUrl: string,
  fetcher: typeof fetchCatalogue = fetchCatalogue,
  install: typeof installCatalogue = installCatalogue,
): Promise<CatalogueLoad> {
  try {
    install(await fetcher(client, publicMediaBase(projectUrl)));
    return { ok: true };
  } catch (e) {
    console.error('catalogue load failed', e instanceof Error ? e.message : e);
    return { ok: false };
  }
}
