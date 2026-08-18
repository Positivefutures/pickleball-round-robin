import { defineConfig } from 'vitest/config';

// The admin app's own suite, entirely separate from the main app's. The root
// vitest.config.ts includes 'src/**/*.test.ts' relative to the repo root, which
// does not reach admin/src, so the two never collide and `npm test` in either
// place means only that place.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
  },
});
