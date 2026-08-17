/**
 * Registers the service worker, and notices when a new one is waiting.
 *
 * The worker in `sw.ts` deliberately never calls `skipWaiting()` on install, so
 * a new build downloads itself and then stops. This is the other half: it spots
 * the one that stopped, tells the app, and hands it over when somebody taps
 * Reload.
 *
 * Only when somebody taps Reload. Two releases let a build in on its own — in
 * the background, or just after a return that stood in for a cold start — and
 * between them they took the banner off the screen almost every time, because
 * the ordinary way a host meets a new build is to pick the phone up after the
 * deploy. The swap had already happened by the time they were looking. That is
 * the quietest possible way to ship, and quiet is the wrong goal: a new version
 * is worth knowing about, and the orange line saying so is the only place this
 * app ever says that work is going on. Jeff's call, and the reason the swap is
 * now the Reload button and nothing else.
 *
 * `APP_VERSION` is attached to every bug report, so the same rule keeps those
 * honest twice over: nobody is pinned to an old build without being told, and
 * nobody is moved off one without being asked.
 *
 * What survives from those releases is the looking. A waiting worker takes over
 * when every page it would replace has gone away, and a home-screen app never
 * lets one go; the browser's own check for a new worker rides on navigations,
 * and this app can go weeks without one. So coming back to the foreground is
 * when it asks, which is what puts the banner in front of somebody who has just
 * picked the phone up. See `onVisible`.
 */

/** `ready` means a new build is downloaded and waiting to be let in. */
export type UpdateState = 'none' | 'ready';

let state: UpdateState = 'none';
const listeners = new Set<() => void>();

function setState(next: UpdateState) {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
}

/** Shaped for useSyncExternalStore, like authStore and syncStatusStore. */
export const updateStore = {
  get: (): UpdateState => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};

let registration: ServiceWorkerRegistration | null = null;
let reloading = false;

/**
 * Started once, however many times it is asked. A second call would leave two
 * visibility listeners, and then every return to the app would check twice and
 * could try to swap the build twice. The same fault was found in sync.ts.
 */
let started = false;
let onVisible: (() => void) | null = null;

/**
 * Whether this page is already being run by a worker.
 *
 * The test for "somebody has an update" and the test for "somebody is seeing
 * this app for the first time" are the same event, and this is what separates
 * them. On a first visit the worker installs with no controller, and announcing
 * a new version to somebody who has been here for four seconds would be
 * nonsense.
 */
function alreadyControlled(): boolean {
  return navigator.serviceWorker.controller !== null;
}

function watch(installing: ServiceWorker) {
  installing.addEventListener('statechange', () => {
    if (installing.state !== 'installed' || !alreadyControlled()) return;

    // The banner, and nothing else. A build that arrives while the app is in a
    // pocket waits in the same state as one that arrives while somebody is
    // looking: the first thing either of them does is say so.
    setState('ready');
  });
}

export function startAppUpdates(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (started) return;
  started = true;

  void navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      registration = reg;

      // Already waiting when the page loaded, which is the ordinary case: the
      // update downloaded during the last visit and nobody acted on it.
      if (reg.waiting && alreadyControlled()) setState('ready');
      if (reg.installing) watch(reg.installing);

      reg.addEventListener('updatefound', () => {
        if (reg.installing) watch(reg.installing);
      });

      onVisible = () => {
        if (document.visibilityState !== 'visible') return;

        // Look, because the browser's own check rides on navigations and this
        // app can go weeks without one. This is what finds the deploy that
        // happened while the phone was in a pocket, a few seconds after it
        // comes back out of it.
        //
        // Nothing is re-announced here. Once a build is ready this store says
        // so until the page goes, so there is nothing to say twice; what needs
        // waking on this event is a banner the host waved away, and that is
        // the app's own state rather than this one. See App.tsx.
        void reg.update().catch(() => {});
      };
      document.addEventListener('visibilitychange', onVisible);
    })
    .catch(() => {
      // Ordinary and not worth reporting: private browsing, an unsupported
      // browser, or a page not served over https. The app works without a
      // worker, which is how it worked until today.
    });
}

/**
 * Lets one build in, then reloads onto it.
 *
 * The listener is attached here rather than at startup on purpose. `activate`
 * claims open pages, so a permanently attached `controllerchange` handler would
 * reload the page during the very first install, and then again, and again.
 */
function swapTo(worker: ServiceWorker | null): void {
  if (!worker) return;

  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    },
    { once: true }
  );

  worker.postMessage({ type: 'skip-waiting' });
}

/**
 * Lets the waiting build in. The Reload button on the update line, and the
 * only way in there is.
 */
export function applyUpdate(): void {
  swapTo(registration?.waiting ?? null);
}

/** Test seam, matching the one in sync.ts. */
export const __testing = {
  reset() {
    state = 'none';
    listeners.clear();
    registration = null;
    reloading = false;
    started = false;
    if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    onVisible = null;
  }
};
