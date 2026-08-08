import { defineConfig } from 'vitest/config';

// Unit tests for the pure logic (pairing algorithm, storage migrations, helpers),
// plus App.walkthrough.test.ts, which mounts the real App in happy-dom and clicks
// through the session flow. There is no browser-based suite.
export default defineConfig({
  test: {
    environment: 'node', // migrations.test.ts opts into happy-dom via a file docblock
    include: ['src/**/*.test.ts'],
    // Blank the Supabase vars for the whole suite. Vitest otherwise loads
    // .env.local, which made the tests behave one way on a machine with real
    // keys and another way on a machine without them — and quietly stopped them
    // covering the no-accounts path, which is the one that has to keep working
    // for everybody who never signs in. Tests that want the configured path
    // stub it themselves with vi.stubEnv.
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
});
