import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `apps/mobile/lib` is included for the *pure* modules only — interest ranking and the Irie
    // intent matcher. Both are plain TypeScript with no React and no React Native imports, which
    // is what keeps them runnable here; anything that reaches for a component belongs in a screen,
    // not in lib.
    include: [
      'packages/**/*.test.ts',
      'supabase/functions/**/*.test.ts',
      'apps/mobile/lib/**/*.test.ts',
      'apps/tourist-web/src/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.expo/**'],
  },
});
