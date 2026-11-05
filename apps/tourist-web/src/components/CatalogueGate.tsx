import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { loadLiveCatalogue } from '../data/liveCatalogue';
import { supabase } from '../lib/supabase';

/**
 * Holds the app back until the live catalogue is installed. In demo mode (no Supabase configured)
 * it renders its children at once and loads nothing, so the investor demo is untouched.
 */
export function CatalogueGate({ children }: { children: ReactNode }) {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const live = supabase !== null && !!url;
  const [state, setState] = useState<'loading' | 'error' | 'ready'>(live ? 'loading' : 'ready');

  const load = useCallback(async () => {
    if (!supabase || !url) return;
    setState('loading');
    const result = await loadLiveCatalogue(supabase, url);
    setState(result.ok ? 'ready' : 'error');
  }, [url]);

  useEffect(() => {
    if (live) void load();
  }, [live, load]);

  if (state === 'ready') return <>{children}</>;
  return (
    <main role={state === 'error' ? 'alert' : 'status'} style={{ minHeight: '100dvh', display: 'grid', placeContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
      {state === 'loading' ? (
        <p>Loading experiences…</p>
      ) : (
        <>
          <p>We could not load experiences right now. Check your connection and try again.</p>
          <button type="button" onClick={() => void load()}>Try again</button>
        </>
      )}
    </main>
  );
}
