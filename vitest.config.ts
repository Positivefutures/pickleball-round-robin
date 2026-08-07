import { defineConfig } from 'vitest/config';

// Unit tests for the pure logic (pairing algorithm, storage migrations, helpers),
// plus App.walkthrough.test.ts, which mounts the real App in happy-dom and clicks
// through the session flow. There is no browser-based suite.
export default defineConfig({
  test: {
    environment: 'node', // migrations.test.ts opts into happy-dom via a file docblock
    include: ['src/**/*.test.ts'],
  },
});
