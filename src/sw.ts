/**
 * The service worker, which is what makes the app load with no network.
 *
 * Before accounts, the app survived bad signal rather than working without it:
 * it loaded once and then made no requests at all, so a dead spot mid-session
 * cost nothing. Sync changed that. There are three network callers now, and the
 * larger half of this file is about making sure none of them is ever answered
 * from a cache.
 *
 * Two things are injected at build time by the `serviceWorker()` plugin in
 * vite.config.ts: the list of files to precache, and the cache name. The list
 * has to come from the build because the script and stylesheet names carry a
 * content hash, and the cache name carries a hash of the list, so a build that
 * changed nothing keeps its cache and re-downloads nothing.
 *
 * This file never calls `skipWaiting()` on install. A new worker installs, then
 * sits and waits until somebody taps Reload on the update line. That is the
 * whole reason a deploy cannot swap the code under a host who is partway
 * through running a session.
 */

const injected = globalThis as {
  __PRECACHE__?: string[];
  __CACHE_NAME__?: string;
};

/**
 * Read off `globalThis` rather than declared as build-time constants, so that
 * importing this file in a test, where the build never ran, gives an empty list
 * instead of a ReferenceError.
 */
const PRECACHE = injected.__PRECACHE__ ?? [];
const CACHE_NAME = injected.__CACHE_NAME__ ?? 'pbrr-dev';

/** Shared by every cache this app owns, so cleanup can never reach past them. */
export const CACHE_PREFIX = 'pbrr-';

/**
 * Cached the first time somebody reaches for them rather than on install.
 *
 * The panel illustrations, and the six alarm tones that are not the default.
 * Together they are the best part of a megabyte, which is a real cost on a
 * phone at a court, and most people never open Donate or change their alarm.
 * Caching on sight means the ones you use are there next time and the ones you
 * do not cost nothing.
 *
 * The audio matters more than the pictures here. A tone is only ever played
 * from the picker, which is where it is chosen, so being fetched is the same
 * event as being wanted — and from then on it rings with no network.
 */
const RUNTIME_ASSETS = /\.(png|jpg|jpeg|webp|svg|mp3)$/;

/**
 * The share banner is 957 KB and no user ever sees it. It exists for the
 * scrapers behind Messages, Slack and iOS share sheets, which fetch it once
 * from a server and never from this device. Cached it would be the largest
 * thing here by a factor of three, for nothing.
 *
 * The two screenshots are here for the same reason. Chrome reads them from the
 * manifest to build its install dialog, which is a thing it draws before this
 * app is installed and never again after. Storing them on the device would be
 * caching a picture of the app for somebody already looking at the app.
 *
 * The blur lab is a diagnostic page rearranged between deploys, so a cached
 * copy would be an old experiment answering a new question. In practice `.html`
 * never matches RUNTIME_ASSETS anyway; the entry is here so the two copies of
 * this list stay reconcilable. See precache.ts.
 */
export const NEVER_CACHE = new Set([
  '/blurtest.html',
  '/og-banner.png',
  '/screenshot-roster.png',
  '/screenshot-schedule.png',
]);

export type Route = 'pass' | 'shell' | 'image';

/**
 * A request for `/` and a request for `/index.html` are the same document, but
 * the cache stores what it was given and matches on the exact address. Without
 * this, precaching `/index.html` and then opening the app offline would miss.
 */
export function cacheKey(pathname: string): string {
  return pathname === '/' ? '/index.html' : pathname;
}

/**
 * What to do with one request.
 *
 * Pure, and exported, so the tests can ask it directly instead of faking a
 * fetch event. Every rule here is a rule about what must *not* be cached; the
 * two that end in a cache are the last two lines.
 */
export function route(input: {
  url: string;
  method: string;
  origin: string;
  precache: string[];
}): Route {
  // Only a GET is ever answered from a cache. Every other method changes
  // something, and replaying one of those out of a cache would be a bug with
  // consequences on somebody's account rather than on their screen.
  if (input.method !== 'GET') return 'pass';

  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return 'pass';
  }

  // Supabase and Sentry both live somewhere else. That traffic is the app
  // talking to a server, and answering it from here would at best serve a stale
  // roster and at worst hide a sync failure behind a cached success.
  if (parsed.origin !== input.origin) return 'pass';

  // Vercel serves analytics from our own origin, so the rule above does not
  // catch it. This is the trap in the whole file: a cached page view would be
  // counted once and then quietly never sent again.
  if (parsed.pathname.startsWith('/_vercel/')) return 'pass';

  const key = cacheKey(parsed.pathname);
  if (input.precache.includes(key)) return 'shell';
  if (!NEVER_CACHE.has(key) && RUNTIME_ASSETS.test(key)) return 'image';

  // Anything else is a real 404 on this host. Vercel serves the filesystem and
  // refuses the rest, and the app has no router, so there is deliberately no
  // fallback to index.html here. One would turn every mistyped address into a
  // copy of the app.
  return 'pass';
}

/**
 * Whether a cache belongs to an older build of this app.
 *
 * The prefix check is the important half. Without it this would delete caches
 * belonging to anything else sharing the origin.
 */
export function isStale(name: string, current: string): boolean {
  return name.startsWith(CACHE_PREFIX) && name !== current;
}

// ------------------------------------------------------------ the worker --

interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEventLike extends ExtendableEventLike {
  request: Request;
  respondWith(response: Response | Promise<Response>): void;
}

/**
 * The worker globals this file uses, written out by hand rather than switching
 * the file to TypeScript's `webworker` lib. That lib redefines `self` and
 * fights the DOM lib the rest of the app is built against, and separating them
 * properly would mean a second tsconfig for one file.
 */
interface WorkerGlobal {
  addEventListener(type: 'install', listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: 'activate', listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  location: { origin: string };
}

/**
 * True in a real service worker, false when a test imports this file for the
 * pure helpers above. `skipWaiting` is the tell: no other global has it.
 */
function isWorker(scope: unknown): scope is WorkerGlobal {
  return typeof (scope as Partial<WorkerGlobal> | null)?.skipWaiting === 'function';
}

/**
 * Answers one request that `route` decided is ours.
 *
 * Cache first, both times. The shell is content-hashed, so a stale hit is
 * impossible: a changed file has a different name and a different cache. That
 * is what lets the fast path stay this simple.
 */
async function serve(request: Request, decision: 'shell' | 'image', key: string): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(key);
  if (hit) return hit;

  try {
    const response = await fetch(request);
    // Only a real answer is worth keeping. A 404 or a 502 stored here would
    // outlive the deploy that caused it and there would be no way to clear it.
    if (decision === 'image' && response.ok) await cache.put(key, response.clone());
    return response;
  } catch (error) {
    // Offline, and not in the cache. For a page that means the shell is missing
    // from a cache that should have had it, which is worth one last look under
    // its own address before showing the browser's error.
    if (request.mode === 'navigate') {
      const shell = await cache.match('/index.html');
      if (shell) return shell;
    }
    throw error;
  }
}

function listen(sw: WorkerGlobal) {
  sw.addEventListener('install', (event) => {
    // Deliberately no skipWaiting. See the note at the top of the file.
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  });

  sw.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(
          names.filter((name) => isStale(name, CACHE_NAME)).map((name) => caches.delete(name))
        );
        // Take over the open pages straight away. Activation only happens after
        // somebody asked for it, so there is nobody left to surprise.
        await sw.clients.claim();
      })()
    );
  });

  sw.addEventListener('fetch', (event) => {
    const decision = route({
      url: event.request.url,
      method: event.request.method,
      origin: sw.location.origin,
      precache: PRECACHE,
    });

    // Returning without calling respondWith is not the same as fetching it here
    // and passing the result back. Left alone, the request keeps the browser's
    // own handling: redirects, range requests, and credentials all behave as
    // they would with no worker installed at all.
    if (decision === 'pass') return;

    event.respondWith(serve(event.request, decision, cacheKey(new URL(event.request.url).pathname)));
  });

  sw.addEventListener('message', (event) => {
    // The only message this worker takes, sent when somebody taps Reload on the
    // update line and from nowhere else.
    const data = event.data as { type?: string } | null;
    if (data?.type === 'skip-waiting') void sw.skipWaiting();
  });
}

// Widened first: `globalThis` is typed as a window here, and a type predicate
// will not narrow between two types that have nothing to do with each other.
if (isWorker(globalThis as unknown)) listen(globalThis as unknown as WorkerGlobal);
