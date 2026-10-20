import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `apps/tourist-web/src` is included for the *pure* modules only — the CSS/TS token parity
    // check. Anything that renders a component belongs in a screen, not in a unit test here.
    include: [
      'packages/**/*.test.ts',
      'supabase/functions/**/*.test.ts',
      'apps/tourist-web/src/**/*.test.ts',
      // Same rule for the vendor portal: pure modules only. `lib/permissions.ts` is the client
      // mirror of an RLS helper, so it is worth a test that fails if the two drift apart.
      'apps/vendor-web/lib/**/*.test.ts',
      // And for the admin console: `lib/vendorReview.ts` decides what becomes publicly visible.
      'apps/admin-web/lib/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.expo/**'],
  },
});
