/**
 * @vitest-environment happy-dom
 *
 * What gets reported, and much more importantly what does not.
 *
 * Three properties are worth pinning above the rest.
 *
 * A report must never carry a player's name. That is the only personal data
 * this app holds, the whole reason it can be used without an account, and a
 * crash reporter is the one thing here that sends anything to a third party at
 * all. So the scrubbing is tested against the names actually in storage, not
 * against a pattern.
 *
 * A crash loop must not empty the month's allowance. Sentry's free plan stops
 * accepting events after 5,000 and drops the rest silently, so a component
 * throwing on every render could spend the month in a second and take the one
 * report that mattered with it.
 *
 * With no DSN, nothing is sent. That is not a broken build, it is every build
 * before this one, and it is the state these tests run in unless one of them
 * says otherwise.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  scrub,
  scrubEvent,
  describeCrash,
  reportCrash,
  resetMonitoring,
  lastCrash,
  isMonitoringConfigured,
  startMonitoring,
  crashTestRequested,
} from './monitoring';
import { APP_VERSION } from './appInfo';

/**
 * Sentry stood in for, the way sync.test.ts stands in for Supabase. What is
 * being tested is which calls get made and how the client was built, and a real
 * SDK would only make that harder to see.
 *
 * The shape mirrors the tree-shaken path the app actually takes: a
 * BrowserClient constructed by hand and a Scope of its own, rather than the
 * global init() that drags every integration into the chunk.
 */
const captureException = vi.fn();
const clientInit = vi.fn();
let clientOptions: Record<string, unknown> = {};
/** Tags set on the scope each crash was sent on. */
let sentTags: Record<string, string>[] = [];

vi.mock('@sentry/browser', () => {
  class FakeScope {
    tags: Record<string, string> = {};
    setClient() {}
    setTag(key: string, value: string) {
      this.tags[key] = value;
    }
    clone() {
      const copy = new FakeScope();
      copy.tags = { ...this.tags };
      return copy;
    }
    captureException(...args: unknown[]) {
      sentTags.push(this.tags);
      captureException(...args);
    }
  }
  return {
    BrowserClient: class {
      constructor(options: Record<string, unknown>) {
        clientOptions = options;
      }
      init = clientInit;
    },
    Scope: FakeScope,
    defaultStackParser: () => [],
    makeFetchTransport: () => ({}),
  };
});

const DSN = 'https://examplekey@o0.ingest.sentry.io/1';

/** Puts real names in storage, which is where scrub() looks for them. */
function seedNames(players: string[], groups: string[]) {
  window.localStorage.setItem(
    'pb-roster',
    JSON.stringify(players.map((name, i) => ({ id: `p${i}`, name, rating: 4, rosterIds: ['g1'] })))
  );
  window.localStorage.setItem(
    'pb-rosters',
    JSON.stringify(groups.map((name, i) => ({ id: `g${i}`, name })))
  );
}

/**
 * One fault, thrown from one line, however many times it is called.
 *
 * It matters that this is a helper rather than two `new Error` calls side by
 * side. What groups a fault is where it was thrown, so two errors written on
 * two lines of a test are two faults and would be right to report twice. This
 * is the shape of the case that actually hurts: one component, throwing on
 * every render.
 */
function sameFaultEveryTime(): Error {
  return new Error('same fault');
}

beforeEach(() => {
  window.localStorage.clear();
  resetMonitoring();
  captureException.mockClear();
  clientInit.mockClear();
  clientOptions = {};
  sentTags = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ------------------------------------------------------------- what is sent --

describe('scrub', () => {
  it('removes the names people typed into the app', () => {
    seedNames(['Katherine', 'Ravi'], ['Tuesday Social']);
    const out = scrub('Cannot read rating of Katherine in Tuesday Social, near Ravi');
    expect(out).not.toContain('Katherine');
    expect(out).not.toContain('Ravi');
    expect(out).not.toContain('Tuesday Social');
    expect(out).toContain('[name]');
  });

  it('matches a name however it was capitalised', () => {
    seedNames(['Katherine'], []);
    expect(scrub('failed for KATHERINE and katherine')).not.toMatch(/katherine/i);
  });

  it('takes the longest name first, so a group is not left half redacted', () => {
    // "Tuesday" on its own would otherwise cut "Tuesday Social" in two and
    // leave the word "Social" standing in the message.
    seedNames(['Tuesday'], ['Tuesday Social']);
    expect(scrub('no courts in Tuesday Social')).toBe('no courts in [name]');
  });

  it('leaves one and two letter names alone', () => {
    // Redacting every "jo" would turn "join" into "[name]in" and protect
    // nobody. Two letters are not identifying on their own.
    seedNames(['Jo'], []);
    expect(scrub('failed to join the round')).toBe('failed to join the round');
  });

  it('removes email addresses, whether or not anyone typed them here', () => {
    expect(scrub('sign-in failed for someone@example.com')).toBe(
      'sign-in failed for [email]'
    );
  });

  it('removes what a link carries, because the sign-in code rides there', () => {
    expect(scrub('failed at https://app.roundrobinator.com/?code=abc123def')).toBe(
      'failed at https://app.roundrobinator.com/?[removed]'
    );
  });

  it('removes long runs of digits', () => {
    expect(scrub('code 483920 rejected')).toBe('code [number] rejected');
  });

  it('leaves an ordinary error message readable', () => {
    seedNames(['Katherine'], ['Tuesday Social']);
    expect(scrub("undefined is not a function (evaluating 'x.map')")).toBe(
      "undefined is not a function (evaluating 'x.map')"
    );
  });

  it('over-redacts rather than leaking, when a name is also a word', () => {
    // A player called "Type" damages the message. That is the right way round:
    // a worse message is recoverable, a leaked name is not.
    seedNames(['Type'], []);
    expect(scrub('TypeError: bad')).toBe('[name]Error: bad');
  });
});

describe('describeCrash', () => {
  it('keeps the name, message and stack of a real error', () => {
    const error = new TypeError('x is not a function');
    const report = describeCrash(error, 'render');
    expect(report).toMatchObject({
      source: 'render',
      name: 'TypeError',
      message: 'x is not a function',
      version: APP_VERSION,
    });
    expect(report.stack).toContain('TypeError');
  });

  it('handles the things people throw that are not errors', () => {
    expect(describeCrash('just a string', 'promise').message).toBe('just a string');
    expect(describeCrash({ code: 42 }, 'promise').message).toBe('{"code":42}');
    expect(describeCrash(undefined, 'promise').message).toBe('undefined');
  });

  it('survives something that cannot be serialised', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => describeCrash(circular, 'promise')).not.toThrow();
  });

  it('scrubs the stack, not only the message', () => {
    seedNames(['Katherine'], []);
    const error = new Error('boom');
    error.stack = 'Error: boom\n  at renderPlayer (Katherine.tsx:3:1)';
    expect(describeCrash(error, 'render').stack).not.toContain('Katherine');
  });

  it('truncates a runaway message rather than sending all of it', () => {
    const error = new Error('x'.repeat(10_000));
    expect(describeCrash(error, 'window').message).toHaveLength(500);
  });
});

// ----------------------------------------------------------- what is refused --

describe('reportCrash', () => {
  it('accepts a fault once and refuses the repeat', () => {
    const first = reportCrash(sameFaultEveryTime(), 'render');
    const second = reportCrash(sameFaultEveryTime(), 'render');
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('does not confuse two faults that happen to share a message', () => {
    // Same words, different place in the code, so both are worth hearing.
    expect(reportCrash(new Error('boom'), 'render')).not.toBeNull();
    expect(reportCrash(new Error('boom'), 'render')).not.toBeNull();
  });

  it('tells two different faults apart', () => {
    expect(reportCrash(new Error('one'), 'render')).not.toBeNull();
    expect(reportCrash(new Error('two'), 'render')).not.toBeNull();
  });

  it('stops after five in a session', () => {
    const accepted = Array.from({ length: 9 }, (_, i) =>
      reportCrash(new Error(`fault ${i}`), 'render')
    ).filter(Boolean);
    expect(accepted).toHaveLength(5);
  });

  it('drops the noise that would eat the allowance', () => {
    expect(
      reportCrash(new Error('ResizeObserver loop completed with undelivered notifications'), 'window')
    ).toBeNull();
    expect(reportCrash(new Error('Script error.'), 'window')).toBeNull();
  });

  it('drops a fault thrown by a browser extension', () => {
    const error = new Error('cannot read x');
    error.stack = 'Error\n  at inject (chrome-extension://abcd/content.js:1:1)';
    expect(reportCrash(error, 'window')).toBeNull();
  });

  it('still remembers a repeat, so a bug report sent later carries it', () => {
    reportCrash(sameFaultEveryTime(), 'render');
    reportCrash(sameFaultEveryTime(), 'render');
    expect(lastCrash()?.message).toBe('same fault');
  });
});

// ------------------------------------------------------------ where it goes --

describe('sending', () => {
  it('is off, and sends nothing, when no DSN is configured', async () => {
    expect(isMonitoringConfigured()).toBe(false);
    reportCrash(new Error('unheard'), 'render');
    // Long enough for a load that should never have started.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(clientInit).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('sends the crash when a DSN is configured', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    expect(isMonitoringConfigured()).toBe(true);

    const error = new Error('heard');
    reportCrash(error, 'render');

    await vi.waitFor(() => expect(captureException).toHaveBeenCalled());
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it('tags how the crash was found, on the scope where it counts', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    reportCrash(new Error('a rejected promise'), 'promise');
    await vi.waitFor(() => expect(sentTags).toHaveLength(1));
    expect(sentTags[0]).toEqual({ source: 'promise' });
  });

  it('reports to the committed project when nothing is configured', async () => {
    // The whole point of committing the DSN is that reporting survives a
    // dashboard nobody has touched in a year. Deleting the constant would
    // otherwise fail silently: the app would work perfectly and tell no one.
    vi.stubEnv('VITE_SENTRY_DSN', undefined);
    expect(isMonitoringConfigured()).toBe(true);

    reportCrash(new Error('heard without any setup'), 'render');
    await vi.waitFor(() => expect(clientInit).toHaveBeenCalled());
    expect(clientOptions.dsn).toMatch(/^https:\/\/\w+@o\d+\.ingest\.[\w.]+\/\d+$/);
  });

  it('does not let one crash tag the next', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    reportCrash(new Error('first'), 'promise');
    reportCrash(new Error('second'), 'render');
    await vi.waitFor(() => expect(sentTags).toHaveLength(2));
    expect(sentTags.map((t) => t.source)).toEqual(['promise', 'render']);
  });

  it('names the build, so a stack trace and a bug report agree', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    reportCrash(new Error('to build a client'), 'render');
    await vi.waitFor(() => expect(clientInit).toHaveBeenCalled());

    expect(clientOptions.release).toBe(APP_VERSION);
    expect(clientOptions.dsn).toBe(DSN);
  });

  it('takes no integrations, so nothing reports the same fault twice', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    reportCrash(new Error('to build a client'), 'render');
    await vi.waitFor(() => expect(clientInit).toHaveBeenCalled());

    // The default set installs its own window.onerror and unhandledrejection
    // handlers, which startMonitoring() already has, and attaches page URLs
    // and breadcrumbs this app has no business sending.
    expect(clientOptions.integrations).toEqual([]);
    expect(clientOptions.sendDefaultPii).toBe(false);
    expect(clientOptions.beforeSend).toBe(scrubEvent);
  });

  it('builds one client however many crashes arrive', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    reportCrash(new Error('first'), 'render');
    reportCrash(new Error('second'), 'render');
    await vi.waitFor(() => expect(captureException).toHaveBeenCalledTimes(2));
    expect(clientInit).toHaveBeenCalledTimes(1);
  });
});

describe('scrubEvent', () => {
  it('strips what the SDK attached, not only what we passed it', () => {
    seedNames(['Katherine'], []);
    const event = scrubEvent({
      message: 'trouble for Katherine',
      exception: { values: [{ value: 'also Katherine' }] },
      request: { url: 'https://app.roundrobinator.com/?code=secret' },
      user: { id: 'abc' },
    });

    expect(event.message).not.toContain('Katherine');
    expect(event.exception?.values?.[0].value).not.toContain('Katherine');
    expect(event.request).toBeUndefined();
    expect(event.user).toBeUndefined();
  });

  it('copes with an event carrying none of those', () => {
    expect(() => scrubEvent({})).not.toThrow();
  });
});

// ------------------------------------------------- the crashes React misses --

describe('startMonitoring', () => {
  // First in this block on purpose: it is the only place startMonitoring() is
  // called in this file, so this is the one chance to watch it arm itself.
  // Counting listeners rather than reports, because a doubled listener is
  // invisible in the output. The second copy reports the very same error
  // object, which fingerprints identically and is refused as a repeat, so the
  // damage would be a window quietly accumulating handlers on every call.
  it('attaches one listener of each kind, however often it is called', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    startMonitoring();
    startMonitoring();
    startMonitoring();
    const kinds = spy.mock.calls.map((call) => String(call[0]));
    spy.mockRestore();

    expect(kinds.filter((k) => k === 'error')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'unhandledrejection')).toHaveLength(1);
  });

  it('hears an error that never reached a render', () => {
    startMonitoring();
    window.dispatchEvent(
      new ErrorEvent('error', { error: new Error('from a click handler'), message: 'x' })
    );
    expect(lastCrash()?.message).toBe('from a click handler');
    expect(lastCrash()?.source).toBe('window');
  });

  it('hears a promise nobody caught', () => {
    startMonitoring();
    const event = new Event('unhandledrejection') as Event & { reason: unknown };
    event.reason = new Error('a sync that failed');
    window.dispatchEvent(event);
    expect(lastCrash()?.message).toBe('a sync that failed');
    expect(lastCrash()?.source).toBe('promise');
  });

  it('ignores an event carrying neither an error nor a message', () => {
    window.dispatchEvent(new ErrorEvent('error', { message: '' }));
    expect(lastCrash()).toBeNull();
  });
});

describe('crashTestRequested', () => {
  function at(search: string) {
    window.history.replaceState({}, '', `/${search}`);
  }

  it('is off for an ordinary visit', () => {
    at('');
    expect(crashTestRequested()).toBe(false);
    at('?code=abc123');
    expect(crashTestRequested()).toBe(false);
  });

  it('is on when the address asks for it', () => {
    at('?crashtest');
    expect(crashTestRequested()).toBe(true);
    at('?crashtest=1');
    expect(crashTestRequested()).toBe(true);
  });
});
