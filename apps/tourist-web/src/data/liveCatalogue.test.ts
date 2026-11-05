import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadLiveCatalogue, publicMediaBase } from './liveCatalogue';
import { demoSnapshot } from './catalogueSource';

const client = {} as never;

describe('loadLiveCatalogue', () => {
  it('installs what the fetcher returns', async () => {
    const snap = demoSnapshot();
    const install = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(snap);
    expect(await loadLiveCatalogue(client, 'https://x.supabase.co/', fetcher, install)).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith(client, 'https://x.supabase.co/storage/v1/object/public/experience-media');
    expect(install).toHaveBeenCalledWith(snap);
  });

  it('installs nothing and reports failure when the fetch throws, never falling back to demo', async () => {
    const install = vi.fn();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await loadLiveCatalogue(client, 'https://x.supabase.co', vi.fn().mockRejectedValue(new Error('boom')), install);
    expect(r).toEqual({ ok: false });
    expect(install).not.toHaveBeenCalled();
    quiet.mockRestore();
  });
});

describe('publicMediaBase', () => {
  it('has no doubled slash', () => {
    expect(publicMediaBase('https://x.supabase.co///')).toBe('https://x.supabase.co/storage/v1/object/public/experience-media');
  });
});

describe('the gate', () => {
  const gate = readFileSync(join(__dirname, '../components/CatalogueGate.tsx'), 'utf8');
  const main = readFileSync(join(__dirname, '../main.tsx'), 'utf8');
  it('wraps the whole app, store included, so nothing reads the catalogue before it is installed', () => {
    expect(main.indexOf('<CatalogueGate>')).toBeLessThan(main.indexOf('<StoreProvider>'));
  });
  it('renders children at once in demo mode and loads only when Supabase is configured', () => {
    expect(gate).toMatch(/useState<[^>]*>\(live \? 'loading' : 'ready'\)/);
    expect(gate).toMatch(/if \(live\) void load\(\)/);
  });
  it('shows an error with retry on failure, not demo listings', () => {
    expect(gate).toContain("result.ok ? 'ready' : 'error'");
    expect(gate).toContain('Try again');
  });
});
