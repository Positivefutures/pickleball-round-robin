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
 * when every page it would replace has gone away, and a home-screen app hardly
 * ever lets one go on purpose; the browser's own check for a new worker rides on
 * navigations, and this app can go weeks without one. So coming back to the
 * foreground is when it asks, which is what puts the banner in front of somebody
 * who has just picked the phone up. See `onVisible`.
 *
 * "Hardly ever" rather than "never", and the difference is load-bearing. iOS
 * discards a backgrounded app's pages when it wants the memory back, which lets
 * the waiting worker in with nobody having tapped anything — so the app can be
 * found running old code under a new worker, with an empty waiting slot and the
 * banner still up. See `applyUpdate`, which is where that is answered.
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
 * How long the handover gets before this reloads anyway.
 *
 * Both engines this app actually meets were measured doing it: Chromium, and
 * WebKit, which is what an iPhone runs whether the app was opened from Safari
 * or from a home-screen icon. In both, `controllerchange` follows the
 * skip-waiting message within a few milliseconds. Three seconds is far past any
 * plausible slow case and still short enough that a host who has just pressed a
 * button has not yet decided it is broken.
 */
const HANDOVER_GRACE_MS = 3_000;

/** Once, whichever of the three ways into it arrives first. */
function reloadOnce(): void {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

/**
 * Lets the waiting build in. The Reload button on the update line, and the only
 * way in there is.
 *
 * ## Why this does more than post a message
 *
 * It used to be one line: message whatever sits in `registration.waiting`, and
 * reload when the new worker takes over. That is right in the ordinary case and
 * it is what still happens. It had two ways of doing nothing at all, and doing
 * nothing at all is what a host reported after a live session — banner tapped,
 * old build still on screen.
 *
 * The first is an empty waiting slot. A waiting worker activates on its own as
 * soon as the last page it would replace goes away, and iOS discards a
 * backgrounded app's pages whenever it feels the memory pressure. The new
 * worker then claims this page, which goes on running the old JavaScript it
 * already had in memory: an older interface, missing whatever the new build
 * added, and no longer anything in `waiting` to message. The store still says
 * `ready`, because it never goes back to `none`, so the banner is still up and
 * the tap had nowhere to go. A plain reload is the whole fix here — the new
 * worker is already in charge, so the shell it serves is the new one.
 *
 * The second is a handover that never lands. Nothing measured here does that,
 * but the old code's only exit was an event, so if that event never came the
 * button stayed dead for as long as the app was open. Now it reloads regardless
 * once the grace period is up.
 *
 * ## The residual case, stated rather than papered over
 *
 * If the message is delivered and the old worker somehow stays in control, the
 * reload after the grace period is served by that old worker, which answers
 * `/index.html` from its own cache — so the page comes back on the same build
 * it was on. What it will not do is come back silently: `startAppUpdates` runs
 * again on the fresh page, finds the same worker still waiting, and puts the
 * banner straight back up. So the failure is visible and the next tap tries the
 * handover again, rather than the app looking like it ignored a button.
 *
 * The cure for that would be clearing the shell out of the caches before
 * reloading, which does force the network. It is deliberately not done: the
 * caches are shared with the worker that is waiting, and a session played on a
 * court with no signal is worth more than the last few percent of this.
 */
export function applyUpdate(): void {
  const waiting = registration?.waiting ?? null;

  // Nothing to hand over to. Either it already let itself in, or there was
  // never anything there — and both are answered by going and getting the page
  // again rather than by returning.
  if (!waiting) {
    reloadOnce();
    return;
  }

  // Attached here rather than at startup on purpose. `activate` claims open
  // pages, so a permanently attached `controllerchange` handler would reload
  // the page during the very first install, and then again, and again.
  const grace = window.setTimeout(reloadOnce, HANDOVER_GRACE_MS);
  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => {
      window.clearTimeout(grace);
      reloadOnce();
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
    started = false;
    if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    onVisible = null;
  }
};
