/**
 * @vitest-environment happy-dom
 *
 * Noticing a new build, and letting it in only when asked.
 *
 * Two failures are being guarded against here, and they pull in opposite
 * directions.
 *
 * The first is telling somebody about an update that is not one. A worker
 * installing for the very first time looks identical, at the event level, to a
 * new build arriving behind an old one. Announce the wrong one and a person who
 * has been in the app for four seconds is asked to reload it.
 *
 * The second is the reload loop, which is the classic way to break an app with
 * a service worker. `controllerchange` fires when a worker takes over, and a
 * page that reloads on it unconditionally will reload, be taken over, and
 * reload again, forever, with no way out from inside the app.
 *
 * Underneath both is the reason any of this exists: `APP_VERSION` is attached
 * to every bug report, so a worker that quietly pinned somebody to an old build
 * would make those reports name a version nobody is running.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startAppUpdates, applyUpdate, updateStore, __testing } from './appUpdate';

type WorkerState = 'installing' | 'installed' | 'activated';

class FakeWorker {
  state: WorkerState = 'installing';
  posted: unknown[] = [];
  private watchers: (() => void)[] = [];

  addEventListener(_type: 'statechange', listener: () => void) {
    this.watchers.push(listener);
  }

  postMessage(data: unknown) {
    this.posted.push(data);
  }

  /** Finishes downloading, or activates. */
  reach(state: WorkerState) {
    this.state = state;
    for (const listener of this.watchers) listener();
  }
}

class FakeRegistration {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  checks = 0;
  private watchers: (() => void)[] = [];

  addEventListener(_type: 'updatefound', listener: () => void) {
    this.watchers.push(listener);
  }

  update() {
    this.checks += 1;
    return Promise.resolve();
  }

  /** A new build begins downloading. */
  startInstalling(): FakeWorker {
    this.installing = new FakeWorker();
    for (const listener of this.watchers) listener();
    return this.installing;
  }
}

class FakeContainer {
  controller: object | null = null;
  registration = new FakeRegistration();
  refuseToRegister = false;
  private watchers: (() => void)[] = [];

  register() {
    return this.refuseToRegister
      ? Promise.reject(new Error('not allowed here'))
      : Promise.resolve(this.registration);
  }

  /**
   * Deliberately ignores `{ once: true }`, which a real browser would honour.
   * The thing worth proving is the guard inside applyUpdate, not the browser's
   * half of it, and honouring `once` here would prove the browser instead.
   */
  addEventListener(_type: 'controllerchange', listener: () => void) {
    this.watchers.push(listener);
  }

  /** A worker takes over the page. */
  handOver() {
    for (const listener of this.watchers) listener();
  }
}

let container: FakeContainer;
let reload: ReturnType<typeof vi.fn>;

/** Registration is a promise, so everything here needs a turn of the loop. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  __testing.reset();
  container = new FakeContainer();
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
  reload = vi.fn();
  Object.defineProperty(window.location, 'reload', { value: reload, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('spotting a new build', () => {
  it('says nothing on a first visit, when no worker is running yet', async () => {
    // No controller means this page is not being run by a worker, so the one
    // installing is the first, not a replacement. Somebody who arrived four
    // seconds ago has nothing to update to.
    container.controller = null;
    startAppUpdates();
    await settle();

    container.registration.startInstalling().reach('installed');

    expect(updateStore.get()).toBe('none');
  });

  it('announces a build that finished downloading behind the one in use', async () => {
    container.controller = {};
    startAppUpdates();
    await settle();

    container.registration.startInstalling().reach('installed');

    expect(updateStore.get()).toBe('ready');
  });

  it('announces one that was already waiting when the app opened', async () => {
    // The ordinary case. It downloaded during the last visit and nobody acted
    // on it, so there is no event left to hear and it has to be looked for.
    container.controller = {};
    container.registration.waiting = new FakeWorker();

    startAppUpdates();
    await settle();

    expect(updateStore.get()).toBe('ready');
  });

  it('tells anything watching, so the banner appears without a reload', async () => {
    const seen: string[] = [];
    updateStore.subscribe(() => seen.push(updateStore.get()));

    container.controller = {};
    startAppUpdates();
    await settle();
    container.registration.startInstalling().reach('installed');

    expect(seen).toEqual(['ready']);
  });

  it('checks again when somebody comes back to the app', async () => {
    // A home-screen icon can sit open for weeks without a navigation, and the
    // browser's own check for a new worker rides on navigations.
    startAppUpdates();
    await settle();

    const before = container.registration.checks;
    document.dispatchEvent(new Event('visibilitychange'));

    expect(container.registration.checks).toBe(before + 1);
  });
});

describe('letting it in', () => {
  async function withOneWaiting(): Promise<FakeWorker> {
    container.controller = {};
    const waiting = new FakeWorker();
    container.registration.waiting = waiting;
    startAppUpdates();
    await settle();
    return waiting;
  }

  it('asks the waiting build to take over when somebody taps Reload', async () => {
    const waiting = await withOneWaiting();

    applyUpdate();

    expect(waiting.posted).toEqual([{ type: 'skip-waiting' }]);
  });

  it('does not reload until somebody has asked for it', async () => {
    await withOneWaiting();

    // A worker claiming its pages, with nobody having tapped anything. If the
    // handler were attached at startup this would reload the app underneath
    // someone partway through a session.
    container.handOver();

    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads when the new build takes over, and only once', async () => {
    await withOneWaiting();

    applyUpdate();
    container.handOver();
    container.handOver();
    container.handOver();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing on Reload when no build is waiting', async () => {
    startAppUpdates();
    await settle();

    expect(() => applyUpdate()).not.toThrow();
    expect(reload).not.toHaveBeenCalled();
  });
});

/**
 * The failure this exists for: a dismissed banner used to be the end of it.
 *
 * A waiting worker takes over when every page it would replace has gone away,
 * and a home-screen app never lets one go. So somebody could dismiss the banner
 * once and read the same version number off the footer a fortnight and two
 * deploys later, with nothing at all going wrong.
 */
describe('coming back to the app after a while', () => {
  function away(seconds: number) {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    now += seconds * 1000;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  let now = 0;

  beforeEach(() => {
    now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  async function withOneWaiting(): Promise<FakeWorker> {
    container.controller = {};
    const waiting = new FakeWorker();
    container.registration.waiting = waiting;
    startAppUpdates();
    await settle();
    return waiting;
  }

  it('lets a build that has been waiting in, without being asked', async () => {
    const waiting = await withOneWaiting();

    away(__testing.AWAY_BEFORE_SWAP_MS / 1000 + 1);

    expect(waiting.posted).toEqual([{ type: 'skip-waiting' }]);
  });

  it('reloads onto it once the new build has taken over', async () => {
    await withOneWaiting();

    away(120);
    container.handOver();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves the app alone when somebody only glanced away', async () => {
    // Reading a message and coming straight back is not a cold start, and
    // reloading under someone's thumb mid-round would be worse than a stale
    // version number.
    const waiting = await withOneWaiting();

    away(5);

    expect(waiting.posted).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });

  it('still looks for a new build on the short trips', async () => {
    await withOneWaiting();
    const before = container.registration.checks;

    away(5);

    expect(container.registration.checks).toBe(before + 1);
  });

  it('swaps nothing when there is nothing waiting', async () => {
    container.controller = {};
    startAppUpdates();
    await settle();
    const before = container.registration.checks;

    away(600);

    expect(reload).not.toHaveBeenCalled();
    expect(container.registration.checks).toBe(before + 1);
  });

  it('listens once, however many times it is started', async () => {
    // Two listeners would check twice on every return and try to swap the build
    // twice. sync.ts had exactly this, and one event ran the whole recovery
    // twice over.
    const waiting = await withOneWaiting();
    startAppUpdates();
    startAppUpdates();
    await settle();

    away(600);

    expect(waiting.posted).toEqual([{ type: 'skip-waiting' }]);
  });

  it('does not count never having left as having been away', async () => {
    // hiddenAt starts at zero, and zero is a long time ago.
    const waiting = await withOneWaiting();

    document.dispatchEvent(new Event('visibilitychange'));

    expect(waiting.posted).toEqual([]);
  });

  /**
   * The build that arrives a moment after the return that went looking for it.
   *
   * This is the whole reason a deploy used to take two trips away and back.
   * Nothing is waiting when somebody returns, because the deploy happened while
   * the app was in their pocket. The return starts the download instead, and
   * what lands seconds later only raised the banner: no absence had passed
   * since, so the swap sat there waiting for another one.
   */
  describe('and the build lands a moment later', () => {
    async function returnFromAbsence(seconds: number) {
      container.controller = {};
      startAppUpdates();
      await settle();
      away(seconds);
    }

    it('goes straight in, without waiting for another trip away', async () => {
      await returnFromAbsence(__testing.AWAY_BEFORE_SWAP_MS / 1000 + 1);
      // The return found nothing waiting and asked, which is the ordinary case
      // right after a deploy.
      expect(container.registration.checks).toBe(1);

      const arriving = container.registration.startInstalling();
      arriving.reach('installed');

      expect(arriving.posted).toEqual([{ type: 'skip-waiting' }]);
      expect(updateStore.get()).toBe('none');
    });

    it('reloads onto it once it has taken over', async () => {
      await returnFromAbsence(120);
      container.registration.startInstalling().reach('installed');

      container.handOver();

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('waits for the tap once somebody has settled in', async () => {
      await returnFromAbsence(120);
      // Long enough after coming back that this is no longer the cold start
      // the return stood in for. Reloading now would be under their thumb.
      now += __testing.RETURN_GRACE_MS + 1;

      const arriving = container.registration.startInstalling();
      arriving.reach('installed');

      expect(arriving.posted).toEqual([]);
      expect(updateStore.get()).toBe('ready');
    });

    it('waits for the tap when the trip away was only a glance', async () => {
      await returnFromAbsence(5);

      const arriving = container.registration.startInstalling();
      arriving.reach('installed');

      expect(arriving.posted).toEqual([]);
      expect(updateStore.get()).toBe('ready');
    });

    it('forgets the return once the app goes away again', async () => {
      await returnFromAbsence(120);
      // Away and back inside the threshold. That short trip is not a cold
      // start, and it must not inherit one from the trip before it.
      away(5);

      const arriving = container.registration.startInstalling();
      arriving.reach('installed');

      expect(arriving.posted).toEqual([]);
      expect(updateStore.get()).toBe('ready');
    });
  });

  describe('and the app is in the background when it lands', () => {
    it('goes straight in, because there is nobody to reload under', async () => {
      container.controller = {};
      startAppUpdates();
      await settle();

      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      const arriving = container.registration.startInstalling();
      arriving.reach('installed');

      expect(arriving.posted).toEqual([{ type: 'skip-waiting' }]);
      expect(updateStore.get()).toBe('none');
    });
  });
});

describe('when there is no worker to be had', () => {
  it('carries on when the browser refuses to register one', async () => {
    // Private browsing, or a page not served over https. The app worked without
    // a worker until today and still has to.
    container.refuseToRegister = true;

    startAppUpdates();
    await settle();

    expect(updateStore.get()).toBe('none');
  });

  it('carries on in a browser that has no service workers at all', () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');

    expect(() => startAppUpdates()).not.toThrow();
    expect(updateStore.get()).toBe('none');
  });
});
