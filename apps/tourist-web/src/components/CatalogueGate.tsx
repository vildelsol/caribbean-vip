import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { loadLiveCatalogue, refreshSlots } from '../data/liveCatalogue';
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

  // Keep seat counts fresh while the app is open: every two minutes, and when the tab comes back.
  useEffect(() => {
    if (!live || state !== 'ready' || !supabase) return;
    const client = supabase;
    const tick = () => void refreshSlots(client);
    const id = window.setInterval(tick, 120_000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [live, state]);

  if (state === 'ready') return <>{children}</>;
  // The body ground is dark green and its text colour is dark ink, so this screen, which renders
  // outside the app's own surfaces, must set its own light text: unstyled it was 1.21:1 and unreadable.
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeContent: 'center', gap: 16, padding: 24, textAlign: 'center', color: 'var(--on-dark)' }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>Caribbean VIP</h1>
      {state === 'loading' ? (
        <p role="status">Loading experiences…</p>
      ) : (
        <>
          <p role="alert">We could not load experiences right now. Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => void load()}
            style={{ justifySelf: 'center', minHeight: 44, padding: '0 24px', border: 0, borderRadius: 999, background: 'var(--on-dark)', color: 'var(--green-980)', font: 'inherit', fontWeight: 600 }}
          >
            Try again
          </button>
        </>
      )}
    </main>
  );
}
