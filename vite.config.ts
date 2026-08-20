import { execSync } from 'node:child_process'
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
          // Nothing reads this one. It is here so the worker's own bytes differ
          // between deploys, because a byte-identical script is not an update
          // and the browser will not raise one. The cache name below is a hash
          // of the file *list*, so a deploy that changed only index.html — a
          // meta tag, an og: image, the analytics snippet — would otherwise
          // produce exactly the same worker, no updatefound, no banner, and no
          // way to reach the change until something moved an asset hash.
          `globalThis.__BUILD_ID__ = ${JSON.stringify(buildId())};\n` +
          `globalThis.__PRECACHE__ = ${JSON.stringify(precache)};\n` +
          `globalThis.__CACHE_NAME__ = ${JSON.stringify(`pbrr-${hash}`)};\n` +
          code,
      })
    },
  }
}

/**
 * Serves the style guide at `/style-guide` rather than `/style-guide.html`.
 *
 * `apply: 'serve'` is the whole safety story. The guide is a second HTML entry
 * at the repo root, and `vite build` takes only `index.html`, so nothing in
 * `src/styleguide/` is ever emitted to `dist/`. This middleware exists purely so
 * the address is the one worth typing on a phone.
 *
 * Deliberately not in `public/`: that folder is copied verbatim into the build,
 * and `precache.test.ts` fails on any file in it that is named in none of the
 * three service-worker lists.
 */
function styleGuideRoute(): Plugin {
  return {
    name: 'pbrr-style-guide-route',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        // Trailing slash tolerated; a query string is left alone.
        if (req.url === '/style-guide' || req.url === '/style-guide/') {
          req.url = '/style-guide.html'
        }
        next()
      })
    },
  }
}

/**
 * Which commit this build came from, for the line in the settings drawer.
 *
 * `APP_VERSION` is typed by hand and so can be forgotten, and a deploy that
 * forgets it leaves two different builds both calling themselves 3.63 — which
 * is exactly the question "is this phone stale?" needs answered. This one is
 * derived, so it cannot disagree with the code it was built from.
 *
 * Vercel puts the sha in the environment. The local fallback is git itself, and
 * the last resort is a word rather than a throw: a build is not worth failing
 * over a missing label.
 */
function buildId(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (fromVercel) return fromVercel.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'local'
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker(), styleGuideRoute()],

  /**
   * Reaching this server by name from another machine on the network.
   *
   * `--host` on its own is not enough. Vite guards against DNS rebinding by
   * checking the Host header, and out of the box it allows only `localhost`,
   * `*.localhost` and bare IP addresses. So with `--host` alone
   * `http://10.0.0.230:5180/style-guide` answers and
   * `http://mac-mini-2.local:5180/style-guide` gets a 403 pointing at this
   * setting. The Bonjour name is the whole point: an IP address is something to
   * look up again every time the router hands out a new one, and the style guide
   * is meant to be a bookmark on somebody else's laptop.
   *
   * The leading dot is Vite's wildcard. `.local` covers `mac-mini-2.local` and
   * every other machine name on the network, so this needs no edit when the
   * machine is renamed or the guide is served from a laptop instead.
   *
   * `host` is deliberately not set here. Plain `npm run dev` stays on localhost,
   * where a working copy belongs. Putting it on the network is opt-in: `--host`,
   * or the `style-guide` script that the launch agent runs.
   */
  server: { allowedHosts: ['.local'] },

  // Two flags Sentry checks at build time and expects a bundler to replace.
  // Left alone they ship the SDK's own debug logging and its tracing code into
  // the crash-reporting chunk, which is downloaded at the one moment the
  // connection is least likely to be good. Setting them here takes that chunk
  // from 19.4 KB gzipped to 18.2 KB, and stops the SDK writing to the console
  // in production. Neither is used anywhere else in this app.
  define: {
    __SENTRY_DEBUG__: false,
    __SENTRY_TRACING__: false,
    // Read back in appInfo.ts, which tolerates it being absent so the test
    // suite — which never runs this config — still imports cleanly.
    __BUILD_ID__: JSON.stringify(buildId()),
  },
})
