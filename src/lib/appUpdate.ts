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
 *
 * And a build is let in the moment it lands, if nobody is looking when it
 * does. That closes a gap that made the paragraph above take two trips rather
 * than one. A return after an absence finds nothing waiting yet, because the
 * deploy happened while the app was away; it starts the download instead, and
 * the build that arrives seconds later only raised the banner. Nothing
 * reconsidered it, so the swap waited on another absence and another return.
 * See `unattended` for what counts as nobody looking. A host actually using
 * the app is still never reloaded from under.
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

/**
 * How long a return keeps counting as the cold start it stood in for.
 *
 * A return after a real absence is what sends the app looking for a new build,
 * and the answer takes as long as the network takes. Inside this window that
 * build is still the one the return went for, and goes in without asking.
 * Outside it, somebody has settled in and gets the banner instead.
 */
const RETURN_GRACE_MS = 30_000;

/** 0 means the app has not been away yet this run. */
let hiddenAt = 0;

/** When the app last came back from an absence long enough to count. 0 once it
 *  goes away again, so this only ever describes the run now in the foreground. */
let returnedAt = 0;

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

/**
 * Whether a build that has just finished downloading can be let straight in.
 *
 * Two ways to be sure nobody is mid-anything. The app is in the background,
 * where a reload is not observable at all. Or it came back a moment ago from an
 * absence long enough to count as a cold start, and this is the build that
 * return went looking for, arriving a few seconds later than it would have if
 * the network were instant.
 *
 * Anything else is somebody using the app, and they get the banner instead.
 * Nothing is lost by reloading in either case here: the schedule, the completed
 * rounds and the round timer's deadline are all in storage, so the app comes
 * back where it was. What is protected is a host mid-tap, not the data.
 */
function unattended(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState !== 'visible') return true;
  return returnedAt > 0 && Date.now() - returnedAt < RETURN_GRACE_MS;
}

function watch(installing: ServiceWorker) {
  installing.addEventListener('statechange', () => {
    if (installing.state !== 'installed' || !alreadyControlled()) return;

    // Straight in, rather than only raising the banner and leaving the swap to
    // a second trip away and back. `installing` rather than
    // `registration.waiting`, which is not reliably set at the instant this
    // fires and is the same worker either way.
    if (unattended()) {
      swapTo(installing);
      return;
    }

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
        if (document.visibilityState !== 'visible') {
          hiddenAt = Date.now();
          returnedAt = 0;
          return;
        }

        const backFromAbsence = hiddenAt > 0 && Date.now() - hiddenAt >= AWAY_BEFORE_SWAP_MS;
        // Remembered before the check below, because the build this return is
        // about to go looking for may take seconds to arrive, and `unattended`
        // is what still recognises it as this return's when it does.
        if (backFromAbsence) returnedAt = Date.now();

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
        if (reg.waiting && backFromAbsence) {
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
 * return-from-absence path that finds one already downloaded.
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
    hiddenAt = 0;
    returnedAt = 0;
    started = false;
    if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    onVisible = null;
  },
  AWAY_BEFORE_SWAP_MS,
  RETURN_GRACE_MS
};
