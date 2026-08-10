/**
 * Registers the service worker, and notices when a new one is waiting.
 *
 * The worker in `sw.ts` deliberately never calls `skipWaiting()` on install, so
 * a new build downloads itself and then stops. This is the other half: it spots
 * the one that stopped, tells the app, and hands it over only when somebody
 * taps Reload.
 *
 * That order matters more here than in most apps. `APP_VERSION` is attached to
 * every bug report, and a worker that pinned somebody to an old build without
 * saying so would make those reports name a version nobody is running. Waiting
 * silently for every tab to close, which is the default, does exactly that on a
 * home-screen icon that is never really closed.
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
    if (installing.state === 'installed' && alreadyControlled()) setState('ready');
  });
}

export function startAppUpdates(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

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

      // Coming back to the app is the moment worth checking. A home-screen icon
      // can sit open for weeks without a navigation, and the browser's own
      // check for a new worker rides on navigations.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => {});
      });
    })
    .catch(() => {
      // Ordinary and not worth reporting: private browsing, an unsupported
      // browser, or a page not served over https. The app works without a
      // worker, which is how it worked until today.
    });
}

/**
 * Lets the waiting build in, then reloads onto it.
 *
 * The listener is attached here rather than at startup on purpose. `activate`
 * claims open pages, so a permanently attached `controllerchange` handler would
 * reload the page during the very first install, and then again, and again.
 */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting) return;

  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    },
    { once: true }
  );

  waiting.postMessage({ type: 'skip-waiting' });
}

/** Test seam, matching the one in sync.ts. */
export const __testing = {
  reset() {
    state = 'none';
    listeners.clear();
    registration = null;
    reloading = false;
  }
};
