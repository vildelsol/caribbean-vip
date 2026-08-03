import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `apps/tourist-web/src` is included for the *pure* modules only — the CSS/TS token parity
    // check. Anything that renders a component belongs in a screen, not in a unit test here.
    include: [
      'packages/**/*.test.ts',
      'supabase/functions/**/*.test.ts',
      'apps/tourist-web/src/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.expo/**'],
  },
});
