import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite, not Next.
 *
 * This app is a pure client-side demonstration: mock catalogue, LocalStorage state, simulated
 * payment. There is no server half to render, so a static SPA is the honest shape — it also means
 * `vite build` produces a folder any static host will serve, which is what "deploys cleanly to
 * Vercel or Netlify" actually requires (see `vercel.json` and `netlify.toml` beside this file for
 * the SPA rewrite both need).
 *
 * `base: './'` keeps the bundle path-relative so the same build also works from a sub-path or
 * opened over file:// for a quick look, rather than only from a domain root.
 */
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    // The demo photography is the bulk of the payload; the JS itself is small. Raising the warning
    // limit stops a routine build printing a warning that has nothing to do with the code.
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
