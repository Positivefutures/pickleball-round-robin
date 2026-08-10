import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig, transformWithEsbuild, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { PRECACHED_PUBLIC } from './src/lib/precache'

/**
 * Builds `dist/sw.js` from `src/sw.ts`.
 *
 * The worker needs two things the source cannot know: the hashed names of the
 * scripts and stylesheets this build produced, and a cache name that changes
 * when any of them change. Both are written in above the transpiled code, on
 * `globalThis`, which is also how `sw.ts` stays importable by its own tests.
 *
 * This is deliberately not `vite-plugin-pwa`. That would have done the same job
 * at the cost of 267 packages and nine high-severity advisories in the build
 * chain, to save the twenty lines below.
 */
function serviceWorker(): Plugin {
  return {
    name: 'pbrr-service-worker',
    // Dev has no worker at all. One caching in the background while the source
    // is being edited is a way to debug the wrong copy of the app for an hour.
    apply: 'build',
    async generateBundle(_options, bundle) {
      const built = Object.keys(bundle)
        .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
        .map((name) => `/${name}`)

      // index.html is added by hand rather than read from the bundle, because
      // Vite's own HTML plugin emits it in this same hook and the order between
      // the two is not something to depend on.
      const precache = ['/index.html', ...built, ...PRECACHED_PUBLIC].sort()

      // The cache name carries a hash of the list. A build that changed nothing
      // keeps its cache and re-downloads nothing; a build that changed one
      // script gets a new one, and `activate` drops the old.
      const hash = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12)

      const source = readFileSync('src/sw.ts', 'utf8')
      const { code } = await transformWithEsbuild(source, 'src/sw.ts', {
        loader: 'ts',
        // IIFE, not ESM, so the worker can be registered as a classic script.
        // Module workers need iOS 15.4, and the people most likely to be
        // running an old iPad are exactly the ones who need this to work.
        format: 'iife',
        target: 'es2020',
      })

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source:
          `globalThis.__PRECACHE__ = ${JSON.stringify(precache)};\n` +
          `globalThis.__CACHE_NAME__ = ${JSON.stringify(`pbrr-${hash}`)};\n` +
          code,
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],

  // Two flags Sentry checks at build time and expects a bundler to replace.
  // Left alone they ship the SDK's own debug logging and its tracing code into
  // the crash-reporting chunk, which is downloaded at the one moment the
  // connection is least likely to be good. Setting them here takes that chunk
  // from 19.4 KB gzipped to 18.2 KB, and stops the SDK writing to the console
  // in production. Neither is used anywhere else in this app.
  define: {
    __SENTRY_DEBUG__: false,
    __SENTRY_TRACING__: false,
  },
})
