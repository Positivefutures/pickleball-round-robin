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
 *
 * Which is also why the tap is not the only way in. A dismissed banner used to
 * be the end of it: the waiting build sat there for as long as the app stayed
 * open, and on a phone that is forever. So a build that has been waiting is
 * also let in when somebody comes back to the app after a real absence, which
 * stands in for the cold start a home-screen icon never gets.
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
 * How long the app has to have been away before a waiting build is let in
 * without asking.
 *
 * Long enough that glancing at a message does not reload the app under
 * somebody's thumb, short enough that a phone in a pocket between rounds
 * counts. Nothing is lost either way: the schedule, the completed rounds and
 * the setup are all in storage, so the app comes back where it was.
 */
const AWAY_BEFORE_SWAP_MS = 60_000;

/** 0 means the app has not been away yet this run. */
let hiddenAt = 0;

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
    if (installing.state === 'installed' && alreadyControlled()) setState('ready');
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
        if (document.visibilityState !== 'visible') {
          hiddenAt = Date.now();
          return;
        }

        // Coming back is the only chance a waiting build ever gets.
        //
        // A worker waits for every page it would replace to go away, and an
        // installed app on a phone never lets one go: it is suspended and
        // resumed, so the same page is still open weeks later. That is how
        // somebody ends up reading an old version number off the footer of an
        // app that has been redeployed twice. Returning after a real absence is
        // as close to opening it cold as a home-screen icon ever comes, so the
        // build that downloaded days ago is let in here rather than waiting for
        // a tap that is never going to come.
        if (reg.waiting && hiddenAt > 0 && Date.now() - hiddenAt >= AWAY_BEFORE_SWAP_MS) {
          applyUpdate();
          return;
        }

        // Otherwise just look, because the browser's own check for a new worker
        // rides on navigations and this app can go weeks without one.
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
    hiddenAt = 0;
    started = false;
    if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    onVisible = null;
  },
  AWAY_BEFORE_SWAP_MS
};
