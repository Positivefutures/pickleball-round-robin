import { defineConfig } from 'vitest/config';

// Unit tests for the pure logic (pairing algorithm, storage migrations, helpers).
// Browser/UI flows are covered separately by the Playwright drivers in e2e/.
export default defineConfig({
  test: {
    environment: 'node', // migrations.test.ts opts into happy-dom via a file docblock
    include: ['src/**/*.test.ts'],
  },
});
