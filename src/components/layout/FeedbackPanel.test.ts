/**
 * @vitest-environment happy-dom
 *
 * Suggest a Feature and Report a Bug, now that Send sends.
 *
 * These two panels used to hand the message to whatever mail app the device
 * had, which on a phone opened something, on a desktop often opened nothing,
 * and either way left the person to press send in a second app. Now the panel
 * posts it and says what happened.
 *
 * The auth module is stubbed rather than driven: all this needs from it is who
 * is signed in, and importing the real one drags the Supabase client in behind
 * it for no gain.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { FeedbackContext, FeedbackKind } from '../../lib/feedback';

/**
 * The stubbed store, one object at a time.
 *
 * useSyncExternalStore compares snapshots by identity, so a get() that built a
 * fresh object each call would loop forever. The real store holds one and
 * replaces it on a change, and so does this.
 */
let authState: { status: string; email?: string | null; userId?: string } = {
  status: 'signed-out',
};

function signedInAs(email: string | null) {
  authState = email ? { status: 'signed-in', email, userId: 'u1' } : { status: 'signed-out' };
}

vi.mock('../../lib/auth', () => ({
  authStore: {
    subscribe: () => () => {},
    get: () => authState,
  },
}));

const { FeedbackPanel } = await import('./FeedbackPanel');

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXT: FeedbackContext = {
  version: '2.00',
  step: '3. Schedule',
  groups: 2,
  players: 12,
  sessionActive: true,
  courts: 3,
  rounds: 8,
  largeText: false,
  userAgent: 'Mozilla/5.0 (iPhone) Safari/605.1',
  screen: '390x844',
  language: 'en-GB',
};

let root: Root;
let container: HTMLElement;
let fetchMock: ReturnType<typeof vi.fn>;
const onClose = vi.fn();

function render(kind: FeedbackKind = 'feature'): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(FeedbackPanel, { kind, context: CONTEXT, onClose }));
  });
  return container;
}

beforeEach(() => {
  signedInAs(null);
  onClose.mockClear();
  fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const text = () => (container.textContent ?? '').trim();

const faces = () => [...container.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());

function button(name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === name
  );
  if (!found) throw new Error(`no button reading "${name}" among ${JSON.stringify(faces())}`);
  return found as HTMLButtonElement;
}

function typeInto(selector: string, value: string) {
  const el = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
  const proto =
    el instanceof window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Presses Send and lets the post settle. */
async function send() {
  await act(async () => {
    button('Send').click();
  });
}

/** The body of the last post, as the endpoint would read it. */
const posted = () =>
  JSON.parse((fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body as string);

describe('what the panel says now', () => {
  it('offers one way to send, and no clipboard', () => {
    render();
    expect(faces()).toContain('Send');
    expect(faces()).not.toContain('Copy');
  });

  it('never mentions an email app, because it does not use one', () => {
    for (const kind of ['feature', 'bug'] as FeedbackKind[]) {
      render(kind);
      const said = text().toLowerCase();
      expect(said).not.toContain('email app');
      expect(said).not.toContain('clipboard');
      act(() => root.unmount());
      container.remove();
    }
    render();
  });

  it('still shows what is attached, and still promises no player details', () => {
    render('bug');
    expect(text()).toContain('Version: 2.00');
    expect(text()).toContain('No names, ratings or player details are included.');
  });
});

describe('the reply address', () => {
  it('asks for one, and says why', () => {
    render();
    expect(text()).toContain('Your email (if you’d like a reply)');
  });

  it('starts on the address they signed in with', () => {
    signedInAs('host@example.com');
    render();
    expect((container.querySelector('#fb-email') as HTMLInputElement).value).toBe(
      'host@example.com'
    );
  });

  it('starts empty for somebody who never signed in', () => {
    render();
    expect((container.querySelector('#fb-email') as HTMLInputElement).value).toBe('');
  });

  it('sends without one, since it is optional', async () => {
    render();
    typeInto('#fb-summary', 'A shot clock');
    await send();
    expect(posted().replyTo).toBe('');
    expect(text()).toContain('Sent.');
  });

  it('mentions the reply only when there is an address to reply to', async () => {
    render();
    typeInto('#fb-summary', 'A shot clock');
    await send();
    expect(text()).not.toContain('write back');

    act(() => root.unmount());
    container.remove();
    render();
    typeInto('#fb-summary', 'A shot clock');
    typeInto('#fb-email', 'host@example.com');
    await send();
    expect(text()).toContain('write back');
  });
});

describe('sending', () => {
  it('posts what was typed', async () => {
    render('bug');
    typeInto('#fb-summary', 'Wrong sit-outs');
    typeInto('#fb-details', 'Round 3 sat the same two out twice.');
    typeInto('#fb-email', 'host@example.com');
    await send();

    expect(posted()).toMatchObject({
      kind: 'bug',
      summary: 'Wrong sit-outs',
      details: 'Round 3 sat the same two out twice.',
      replyTo: 'host@example.com',
    });
    expect(posted().context.version).toBe('2.00');
  });

  it('says it has gone, rather than that something should have opened', async () => {
    render();
    typeInto('#fb-summary', 'A shot clock');
    await send();
    expect(text()).toContain('Sent. It has come straight to me.');
    expect(faces()).toContain('Done');
  });

  it('will not send an empty report, and points at the field', async () => {
    render();
    await send();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('#fb-summary')!.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('when the send fails', () => {
  it('says so, and keeps what they wrote so it can go again', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 502 }));
    render();
    typeInto('#fb-summary', 'A shot clock');
    await send();

    expect(text()).toContain('did not send');
    // The whole reason this matters: there is no clipboard button to fall back
    // on any more, so losing the text would lose the report.
    expect((container.querySelector('#fb-summary') as HTMLInputElement).value).toBe('A shot clock');
    expect(faces()).toContain('Send');
  });

  it('reads the failure out, since nothing else announces it', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 502 }));
    render();
    typeInto('#fb-summary', 'A shot clock');
    await send();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('passes on what the server said when it is worth reading', async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: 'Sending is not set up right now.' }), {
          status: 503,
        })
    );
    render();
    typeInto('#fb-summary', 'A shot clock');
    await send();
    expect(text()).toContain('Sending is not set up right now.');
  });

  it('goes again on a second press', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('{}', { status: 502 }));
    render();
    typeInto('#fb-summary', 'A shot clock');
    await send();
    expect(text()).toContain('did not send');

    await send();
    expect(text()).toContain('Sent.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
