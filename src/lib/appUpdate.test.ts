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
 * The banner, and getting it in front of somebody.
 *
 * A waiting worker takes over when every page it would replace has gone away,
 * and a home-screen app never lets one go. So without something asking on its
 * behalf, a host reads the same version number off the footer a fortnight and
 * two deploys later with nothing at all going wrong.
 *
 * Two releases answered that by letting the build in on its own, in the
 * background or just after a return. It worked, and it meant nobody ever saw
 * the orange line: the ordinary way to meet a new build is to pick the phone up
 * after the deploy, and by then the swap had already happened. What asks now is
 * the check on coming back to the foreground, and what answers is the host.
 */
describe('coming back to the app', () => {
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

  it('says a build is ready rather than letting it in', async () => {
    const waiting = await withOneWaiting();

    away(600);

    // The whole point. Ten minutes away used to be enough to be reloaded onto
    // a build nobody had mentioned.
    expect(waiting.posted).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
    expect(updateStore.get()).toBe('ready');
  });

  it('goes looking on every trip back, long or short', async () => {
    await withOneWaiting();
    const before = container.registration.checks;

    away(5);
    away(600);

    // This is what finds the deploy that happened while the phone was in a
    // pocket. Without it the banner has nothing to announce.
    expect(container.registration.checks).toBe(before + 2);
  });

  it('says nothing when there is nothing waiting', async () => {
    container.controller = {};
    startAppUpdates();
    await settle();

    away(600);

    expect(reload).not.toHaveBeenCalled();
    expect(updateStore.get()).toBe('none');
  });

  it('listens once, however many times it is started', async () => {
    // Two listeners would check twice on every return. sync.ts had exactly
    // this, and one event ran the whole recovery twice over.
    await withOneWaiting();
    startAppUpdates();
    startAppUpdates();
    await settle();
    const before = container.registration.checks;

    away(600);

    expect(container.registration.checks).toBe(before + 1);
  });

  /**
   * The build that arrives a moment after the return that went looking for it,
   * which is the ordinary case right after a deploy: nothing was waiting when
   * the host picked the phone up, because the deploy happened while it was in
   * their pocket.
   */
  describe('and the build lands a moment later', () => {
    async function returnFromAbsence(seconds: number) {
      container.controller = {};
      startAppUpdates();
      await settle();
      away(seconds);
    }

    it('raises the banner rather than going straight in', async () => {
      await returnFromAbsence(600);
      expect(container.registration.checks).toBe(1);

      const arriving = container.registration.startInstalling();
      arriving.reach('installed');

      expect(arriving.posted).toEqual([]);
      expect(updateStore.get()).toBe('ready');
      expect(reload).not.toHaveBeenCalled();
    });

    it('does the same after a glance away as after an afternoon', async () => {
      await returnFromAbsence(5);

      container.registration.startInstalling().reach('installed');

      // How long somebody was away used to decide whether they were told or
      // simply moved. It decides nothing now.
      expect(updateStore.get()).toBe('ready');
      expect(reload).not.toHaveBeenCalled();
    });
  });

  describe('and the app is in the background when it lands', () => {
    it('has it waiting with the banner up when they look again', async () => {
      container.controller = {};
      startAppUpdates();
      await settle();

      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      const arriving = container.registration.startInstalling();
      arriving.reach('installed');

      // Nobody is looking, which used to be the licence to swap it in unasked.
      // The state is what greets them instead.
      expect(arriving.posted).toEqual([]);
      expect(updateStore.get()).toBe('ready');
      expect(reload).not.toHaveBeenCalled();
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
