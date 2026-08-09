/**
 * @vitest-environment happy-dom
 * @vitest-environment-options { "settings": { "fetch": { "disableSameOriginPolicy": true } } }
 *
 * The one test here that does not stand Sentry in for something else.
 *
 * monitoring.test.ts replaces the SDK with a fake, which proves which calls get
 * made and nothing at all about what ends up on the wire. That gap matters more
 * than usual, because the whole point of this feature is that a crash reaches
 * somebody, and the payload is built by code nobody here wrote. A client
 * configured perfectly that posts an empty body would pass every other test in
 * this project.
 *
 * So this one runs the real @sentry/browser against a DSN pointing at a server
 * on this machine, and reads what actually arrives. What it cannot prove is
 * that Sentry accept it: that needs an account, and it is the one step of item
 * 8 left for Jeff.
 *
 * The same-origin option in the docblock is why it can talk to that server at
 * all. happy-dom enforces CORS, and a browser posting to Sentry is a genuine
 * cross-origin request, which their endpoint permits and a local stub has no
 * way to be asked about.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

let server: Server;
let received: string[];

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        received.push(body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      });
    });
    server.listen(0, '127.0.0.1', resolve);
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  received = [];
  window.localStorage.clear();
  vi.unstubAllEnvs();
  // A fresh module each time, because the client is built once and cached, and
  // this file needs it built against this run's port.
  vi.resetModules();
});

function dsnForLocalServer(): string {
  const { port } = server.address() as AddressInfo;
  return `http://examplekey@127.0.0.1:${port}/42`;
}

/** Everything posted, as one string. The envelope is newline-delimited JSON. */
async function delivered(): Promise<string> {
  await vi.waitFor(() => expect(received.length).toBeGreaterThan(0), { timeout: 5000 });
  return received.join('\n');
}

describe('what actually reaches the server', () => {
  it('posts a crash, naming the build and the fault', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', dsnForLocalServer());
    const { reportCrash } = await import('./monitoring');
    const { APP_VERSION } = await import('./appInfo');

    reportCrash(new TypeError('x is not a function'), 'render');

    const body = await delivered();
    expect(body).toContain('TypeError');
    expect(body).toContain('x is not a function');
    expect(body).toContain(APP_VERSION);
    // The tag is what makes a render crash one click away from an async one.
    expect(body).toContain('render');
    // Without frames a report says a fault happened and not where, which is
    // most of its value gone.
    expect(body).toContain('stacktrace');
  });

  it('does not put a player name on the wire', async () => {
    window.localStorage.setItem(
      'pb-roster',
      JSON.stringify([{ id: 'p1', name: 'Katherine', rating: 4, rosterIds: ['g1'] }])
    );
    window.localStorage.setItem('pb-rosters', JSON.stringify([{ id: 'g1', name: 'Tuesday Social' }]));
    vi.stubEnv('VITE_SENTRY_DSN', dsnForLocalServer());
    const { reportCrash } = await import('./monitoring');

    reportCrash(new Error('no rating for Katherine in Tuesday Social'), 'render');

    const body = await delivered();
    expect(body).not.toContain('Katherine');
    expect(body).not.toContain('Tuesday Social');
    expect(body).toContain('[name]');
  });

  it('sends nothing at all when there is no DSN', async () => {
    const { reportCrash } = await import('./monitoring');
    reportCrash(new Error('unheard'), 'render');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(received).toHaveLength(0);
  });
});
