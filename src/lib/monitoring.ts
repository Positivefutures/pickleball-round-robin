/**
 * What happens when the app breaks.
 *
 * Until now a crash was invisible twice over. The person holding the phone got
 * a white screen with nothing to read and nothing to press, and nobody was ever
 * told. There is no server here, so there are no logs to go and look at: the
 * only way a bug ever surfaced was somebody bothering to write in about it.
 *
 * Two separate jobs, and they are worth keeping separate because only one of
 * them depends on anything outside this repository.
 *
 * **Telling the person.** ErrorBoundary shows a real screen with an honest
 * sentence and a way to send the details. That works today, on every build,
 * configured or not, and it is the half that matters most to whoever is
 * standing at a court.
 *
 * **Telling Jeff.** The crash is also sent to Sentry, at the DSN committed
 * below. With no DSN nothing is imported and nothing leaves the browser, which
 * is the state the test suite runs in and the state every build was in before
 * 2026-08-09.
 *
 * Three things here are deliberate and would be easy to undo by accident.
 *
 * **Sentry is loaded only once something has already gone wrong.** This app is
 * used outdoors on one bar of signal, so making every visitor download a crash
 * reporter they will never need is a real cost paid by everyone to serve the
 * rare case. All of this costs 1.9 KB gzipped in the eager bundle; the reporter
 * is a separate 18 KB chunk fetched at the moment of the crash. The dynamic
 * import follows getSupabase() for the same reason. The price is that Sentry is
 * not present to watch the moment it happens, which is why the global handlers
 * below are ours rather than its.
 *
 * **Nothing personal goes with it.** No breadcrumbs, no user, no app state. The
 * message and the stack are put through scrub() first, because an error string
 * is the one place a player's name can end up by accident.
 *
 * **A crash loop cannot empty the allowance.** Sentry's free plan takes 5,000
 * events a month and a render loop can produce thousands in a second, so each
 * distinct fault is sent once and a session sends at most five.
 */
import { APP_VERSION } from './appInfo';
import * as stores from './stores';

/** How we found out. Sent as a tag, so a render crash is one click away. */
export type CrashSource = 'render' | 'window' | 'promise';

export interface CrashReport {
  source: CrashSource;
  /** Constructor name, or 'Error' for anything thrown that was not one. */
  name: string;
  /** Already scrubbed. Safe to show on screen and to put in an email. */
  message: string;
  /** Already scrubbed. Empty when whatever was thrown carried no stack. */
  stack: string;
  /** What dedupe compares. Not sent; it never leaves this module. */
  fingerprint: string;
  version: string;
  at: string;
}

/**
 * Sent once each, and at most five per session.
 *
 * Five is enough to see a fault that only shows up as a cascade, and low enough
 * that a component throwing on every render costs five events rather than the
 * month. Both counters reset on reload, which is the natural session boundary
 * for an app with no router.
 */
const MAX_PER_SESSION = 5;

/**
 * Errors that say nothing and arrive in volume. Every one of these has been a
 * documented waste of somebody's Sentry allowance.
 *
 * The ResizeObserver pair is emitted by the browser when a resize callback
 * schedules another layout pass. It is benign by specification, it is not
 * caused by anything in this app, and on a phone that rotates it can fire
 * repeatedly.
 *
 * "Script error." is what a cross-origin script reports when the browser
 * refuses to say more. There is no message, no stack and no file, so it is
 * unactionable by construction.
 *
 * The extension schemes are code injected into the page by whatever the visitor
 * has installed. It is somebody else's bug in somebody else's code, running in
 * a page we happen to own.
 */
const NOISE = [
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
  'Script error.',
  'chrome-extension://',
  'moz-extension://',
  'safari-web-extension://',
];

const seen = new Set<string>();
let sentThisSession = 0;
let started = false;
let latest: CrashReport | null = null;

/**
 * Where crashes are sent. Committed on purpose, on 2026-08-09.
 *
 * A DSN is an address, not a password. It only accepts crashes coming in, it
 * reads nothing back out, and it is meant to be visible in the shipped app,
 * where anybody can read it out of the bundle anyway. The repository being
 * public changes nothing about that.
 *
 * What it buys is that crash reporting cannot be lost. A value living only in a
 * dashboard is one that a new project, a restored account or a forgotten step
 * quietly drops, and the failure is silent: the app carries on perfectly and
 * simply stops telling anybody.
 *
 * To point it somewhere else, set VITE_SENTRY_DSN in Vercel, which wins. To
 * turn reporting off, set that variable to an empty string.
 */
const DEFAULT_DSN =
  'https://84e709e15a8286159b8ee258a4abb162@o4511883102453760.ingest.us.sentry.io/4511883119558656';

// Read per call rather than into a module constant, exactly as supabase.ts
// does. Vite still substitutes it literally at build time, so production is
// unchanged, but a test can stub the environment and exercise both paths.
//
// An unset variable falls back; an empty one does not, which is what makes
// blanking it in Vercel the off switch.
const dsn = () => {
  const configured = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  return configured === undefined ? DEFAULT_DSN : configured;
};

/**
 * Whether crashes are reported anywhere beyond the screen.
 *
 * False is a supported state, not a broken one: the error screen, the prefilled
 * bug report and the scrubbing all work identically without a DSN.
 */
export function isMonitoringConfigured(): boolean {
  return Boolean(dsn());
}

// ------------------------------------------------------------------ scrubbing

// No slashes either side, which an address cannot contain and a file path
// almost always does. Without that, a stack frame through node_modules/@sentry
// reads as an address and the frame is redacted into uselessness.
const EMAIL = /[^\s<>()[\]{}/]+@[^\s<>()[\]{}/]+\.[a-z]{2,24}\b/gi;
/** Six or more digits together. Long enough to skip years and round counts. */
const LONG_NUMBER = /\d{6,}/g;
/** Everything after ? or #. The emailed sign-in link puts its code there. */
const QUERY = /https?:\/\/[^\s]*?[?#][^\s]*/gi;

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Names typed into this app, longest first so a group called "Tuesday Night"
 * is redacted before a player called "Tuesday".
 *
 * Two and one character names are skipped. A player called "Jo" is a real
 * possibility and redacting every "jo" would turn "join" into "[name]in",
 * which damages the message without protecting anybody: two letters are not
 * identifying on their own.
 *
 * Reading the stores rather than localStorage directly because a store never
 * throws, and this runs while something is already going wrong.
 */
function typedNames(): string[] {
  const names = [
    ...stores.players.get().map((p) => p.name),
    ...stores.rosters.get().map((r) => r.name),
  ];
  return [...new Set(names)]
    .filter((name) => name.trim().length > 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 300);
}

/**
 * Remove anything identifying from text that is about to leave the browser.
 *
 * Deliberately blunt. A player called "Type" would turn "TypeError" into
 * "[name]Error", which is a worse message but not a leak, and that is the right
 * way round for this to fail.
 *
 * It cannot promise to catch everything, because an error message is arbitrary
 * text. What makes the guarantee hold is above this line rather than in it: no
 * report ever carries app state, so the only personal data that can reach here
 * is a name somebody put into an error string by hand.
 */
export function scrub(text: string): string {
  if (!text) return '';
  let out = text.replace(QUERY, (url) => url.replace(/[?#].*$/, '?[removed]'));
  out = out.replace(EMAIL, '[email]');
  for (const name of typedNames()) {
    out = out.replace(new RegExp(escapeForRegex(name), 'gi'), '[name]');
  }
  return out.replace(LONG_NUMBER, '[number]');
}

// -------------------------------------------------------------- the report --

/** The first line of the stack that names a file, which is what groups a fault. */
function topFrame(stack: string): string {
  const line = stack.split('\n').find((l) => /\.(t|j)sx?|http/.test(l));
  return (line ?? '').trim().slice(0, 200);
}

/**
 * Turn anything at all into a report. Pure, and it never throws: it runs on the
 * path where something has already thrown, so a second failure here would
 * replace a bad screen with a blank one.
 */
export function describeCrash(error: unknown, source: CrashSource): CrashReport {
  let name = 'Error';
  let message = '';
  let stack = '';

  if (error instanceof Error) {
    name = error.name || 'Error';
    message = error.message;
    stack = error.stack ?? '';
  } else if (typeof error === 'string') {
    message = error;
  } else {
    try {
      message = JSON.stringify(error) ?? String(error);
    } catch {
      // Circular, or a Proxy that objects to being read.
      message = String(error);
    }
  }

  const safeMessage = scrub(message).slice(0, 500);
  const safeStack = scrub(stack).slice(0, 4000);

  return {
    source,
    name,
    message: safeMessage,
    stack: safeStack,
    fingerprint: `${name}|${safeMessage}|${topFrame(safeStack)}`,
    version: APP_VERSION,
    at: new Date().toISOString(),
  };
}

function isNoise(report: CrashReport): boolean {
  const haystack = `${report.message}\n${report.stack}`;
  return NOISE.some((phrase) => haystack.includes(phrase));
}

/** The most recent crash, so a bug report sent afterwards still carries it. */
export function lastCrash(): CrashReport | null {
  return latest;
}

/**
 * Put the module back to how a fresh page load finds it: nothing seen, nothing
 * counted, no client loaded. Only the tests call it, and a real session gets
 * the same effect by reloading, which is what the error screen offers.
 *
 * The listeners are deliberately left alone. They belong to the window rather
 * than to a session, and re-arming startMonitoring() would stack a second set
 * on top of the first.
 */
export function resetMonitoring(): void {
  seen.clear();
  sentThisSession = 0;
  latest = null;
  sentry = null;
}

// -------------------------------------------------------------- the sending --

/**
 * The parts of a Sentry event this cares about. Described here rather than
 * imported so that scrubbing can be tested against a plain object, and so this
 * module owns the shape it depends on.
 */
interface SentryEvent {
  message?: string;
  exception?: { values?: { value?: string }[] };
  request?: unknown;
  user?: unknown;
}

/**
 * Strip anything identifying that Sentry added on its way out.
 *
 * Everything reaching here has already been through scrub(), so in practice
 * this catches only what the SDK itself attached. Exported so a test can hold
 * it to that without a network.
 *
 * Generic so it can be handed straight to beforeSend, which is typed against
 * Sentry's own richer event and must get the same object back.
 */
export function scrubEvent<T extends SentryEvent>(event: T): T {
  const fields: SentryEvent = event;
  if (fields.message) fields.message = scrub(fields.message);
  for (const value of fields.exception?.values ?? []) {
    if (value.value) value.value = scrub(value.value);
  }
  delete fields.request;
  delete fields.user;
  return event;
}

interface Sender {
  /** Sends one crash, tagged with how it was found. */
  send(error: unknown, source: CrashSource): void;
}

let sentry: Promise<Sender> | null = null;

/**
 * Build a client by hand rather than calling Sentry.init().
 *
 * This is Sentry's own documented way to keep the bundle down, and the
 * difference is not marginal. init() statically references the whole default
 * integration list, so Replay, tracing, profiling and the feedback widget end
 * up in the chunk whether or not they are switched on, and no amount of
 * defaultIntegrations: false removes them. Measured on this app: 144 KB
 * gzipped through init(), 30 KB through BrowserClient. That is the difference
 * between a report that arrives on one bar of signal and one that does not,
 * which matters because a crash is exactly when the download happens.
 *
 * `integrations: []` is the whole list on purpose. The default set installs its
 * own window.onerror and unhandledrejection handlers, and startMonitoring()
 * already has those, so keeping them would report everything twice. Dedupe and
 * noise filtering are done above, before anything is loaded at all.
 */
function loadSentry(): Promise<Sender> {
  sentry ??= import('@sentry/browser').then(
    ({ BrowserClient, defaultStackParser, makeFetchTransport, Scope }) => {
      const client = new BrowserClient({
        dsn: dsn(),

        // The version in the footer and on every bug report, so a stack trace
        // and an email about the same afternoon name the same build. This is
        // why APP_VERSION has to be bumped in the commit that deploys.
        release: APP_VERSION,

        // The page's own fetch, rather than the one Sentry would find for
        // itself. Left alone, makeFetchTransport pulls an unpatched fetch out
        // of a hidden iframe, which guards against a page that has replaced
        // window.fetch catching Sentry's own requests and looping. Nothing here
        // replaces it: the only other things that make requests are Supabase
        // and Vercel Analytics, and neither patches the global.
        //
        // Handing it fetch directly is also the only reason
        // monitoring.delivery.test.ts can exist, because the iframe trick has
        // nothing to grab outside a real browser. A proven delivery path is
        // worth more than a guard against a patch this app does not have.
        transport: (options) => makeFetchTransport(options, fetch),
        stackParser: defaultStackParser,
        integrations: [],
        sendDefaultPii: false,
        beforeSend: scrubEvent,
      });

      // A scope of our own rather than the global one, so nothing else in the
      // page can attach context to what gets sent.
      const scope = new Scope();
      scope.setClient(client);
      client.init();

      return {
        send(error, source) {
          // On a clone, so one crash's tag cannot follow the next one.
          //
          // Set on a scope rather than passed to captureException, which takes
          // a hint there and quietly drops anything that looks like scope data.
          // That mistake sends a report with no tag on it at all, and it looks
          // completely correct from the calling side: only reading what
          // arrived catches it. See monitoring.delivery.test.ts.
          const tagged = scope.clone();
          tagged.setTag('source', source);
          tagged.captureException(error);
        },
      };
    }
  );
  return sentry;
}

/**
 * Record a crash, and send it if there is anywhere to send it.
 *
 * Returns the report when it was accepted, and null when it was suppressed as
 * noise, a repeat, or over the session cap. That return value is the whole test
 * seam: the suppression rules can be proved without a network or a mock.
 */
export function reportCrash(error: unknown, source: CrashSource): CrashReport | null {
  const report = describeCrash(error, source);
  if (isNoise(report)) return null;

  latest = report;

  if (seen.has(report.fingerprint)) return null;
  seen.add(report.fingerprint);
  if (sentThisSession >= MAX_PER_SESSION) return null;
  sentThisSession += 1;

  if (isMonitoringConfigured()) {
    // Fire and forget. Nothing on screen waits for this, and a reporter that
    // could itself throw would take out the error screen it is reporting.
    void loadSentry()
      .then((sender) => sender.send(error, source))
      .catch(() => {
        // Offline, blocked by an ad blocker, or the chunk is gone after a
        // deploy. All three are ordinary and none is worth a second failure.
      });
  }

  return report;
}

/**
 * Whether this page load is asking to crash on purpose.
 *
 * Reached by adding `?crashtest` to the address, and it exists because there is
 * otherwise no way to find out whether reporting works without waiting for a
 * real bug. It proves the whole chain in one go: the error screen appears, and
 * the report turns up in Sentry naming this build.
 *
 * Deliberately harmless. The worst somebody can do by sending the link to
 * another person is show them a crash screen with a Reload button, and the
 * report it produces is deduplicated like any other. It is documented in
 * docs/error-monitoring.md rather than hidden, because a verification step
 * nobody can find is one nobody runs.
 */
export function crashTestRequested(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('crashtest');
}

/**
 * Listen for the crashes React cannot see: async callbacks, event handlers and
 * rejected promises. ErrorBoundary covers render.
 *
 * Called first thing in main.tsx, before migrations run, so a fault in the
 * storage reshape is caught rather than being the one crash nobody hears about.
 */
export function startMonitoring(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  window.addEventListener('error', (event) => {
    // A failed image or script load fires this same event with no error on it.
    // Those do not bubble to window without capture, so this is a guard rather
    // than a filter, and it costs nothing.
    if (!event.error && !event.message) return;
    reportCrash(event.error ?? event.message, 'window');
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportCrash(event.reason, 'promise');
  });
}
