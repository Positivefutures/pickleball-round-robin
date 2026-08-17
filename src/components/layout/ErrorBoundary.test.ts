/**
 * @vitest-environment happy-dom
 *
 * What somebody sees when the app falls over.
 *
 * Before this existed the answer was a white page. No message, no button, and
 * no sign that the groups and players were still there, which for a host
 * halfway through a session is indistinguishable from having lost everything.
 * So the assertions below are about what is on screen and readable, not about
 * whether React caught the error.
 *
 * createElement rather than JSX, and no React Testing Library, because that is
 * how App.walkthrough.test.ts drives the real components.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ErrorBoundary } from './ErrorBoundary';
import { resetMonitoring } from '../../lib/monitoring';
import { APP_VERSION } from '../../lib/appInfo';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLElement;
/** Every href the screen tried to send the browser to. */
let navigations: string[];

function Boom({ error }: { error: unknown }): ReactNode {
  throw error;
}

function Fine(): ReactNode {
  return createElement('p', null, 'the app, working');
}

function mount(child: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(ErrorBoundary, null, child));
  });
}

function text(): string {
  return (container.textContent ?? '').trim();
}

function button(re: RegExp): HTMLElement {
  const found = [...container.querySelectorAll('button')].filter((b) =>
    re.test((b.textContent ?? '').trim())
  );
  if (found.length === 0) {
    throw new Error(
      `no button matching ${re}; saw: ${[...container.querySelectorAll('button')]
        .map((b) => JSON.stringify((b.textContent ?? '').trim()))
        .join(', ')}`
    );
  }
  return found[0] as HTMLElement;
}

beforeEach(() => {
  window.localStorage.clear();
  resetMonitoring();
  navigations = [];
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      set href(value: string) {
        navigations.push(value);
      },
      get href() {
        return 'https://app.pbroundrobin.com/';
      },
      reload: () => {},
    },
  });
  // React reports a caught error through console.error even when a boundary
  // handled it, and so does ErrorBoundary itself. Both are wanted in a real
  // build and neither is wanted in the test output.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('stays out of the way when nothing is wrong', () => {
    mount(createElement(Fine));
    expect(text()).toBe('the app, working');
  });

  it('replaces a white screen with something to read and something to press', () => {
    mount(createElement(Boom, { error: new TypeError('x is not a function') }));

    expect(text()).toContain('Something went wrong');
    // The sentence that matters most. A host mid-session needs to know the
    // groups are still there before anything else.
    expect(text()).toContain('saved on this device');
    expect(button(/^Reload$/)).toBeTruthy();
    expect(button(/Tell Me What Happened/)).toBeTruthy();
  });

  it('shows the fault and the build, because people send a photo of this', () => {
    mount(createElement(Boom, { error: new TypeError('x is not a function') }));
    expect(text()).toContain('TypeError: x is not a function');
    expect(text()).toContain(`Version ${APP_VERSION}`);
  });

  it('says something sensible when what was thrown had no message', () => {
    mount(createElement(Boom, { error: new Error('') }));
    expect(text()).toContain('(no message)');
  });

  it('keeps a player name off the crash screen', () => {
    window.localStorage.setItem(
      'pb-roster',
      JSON.stringify([{ id: 'p1', name: 'Katherine', rating: 4, rosterIds: ['g1'] }])
    );
    mount(createElement(Boom, { error: new Error('no rating for Katherine') }));

    expect(text()).not.toContain('Katherine');
    expect(text()).toContain('[name]');
  });

  it('hands the crash to the bug report, already filled in', () => {
    window.localStorage.setItem('pb-rosters', JSON.stringify([{ id: 'g1', name: 'Tuesday' }]));
    mount(createElement(Boom, { error: new TypeError('x is not a function') }));

    act(() => button(/Tell Me What Happened/).click());

    expect(navigations).toHaveLength(1);
    const sent = decodeURIComponent(navigations[0]);
    expect(sent).toContain('mailto:');
    expect(sent).toContain('[Bug] TypeError: x is not a function');
    // The diagnostics the Report a Bug panel sends, so both arrive alike.
    expect(sent).toContain(`Version: ${APP_VERSION}`);
    // No Screen line on any report now: the subject already says this one
    // came from a crash.
    expect(sent).not.toContain('Screen:');
    expect(sent).toContain('Groups: 1');
  });

  it('reads its numbers from storage, not from the app that just died', () => {
    // The boundary sits outside App, so there is no component state left to
    // ask. Anything it reports has to come from somewhere that survived.
    window.localStorage.setItem(
      'pb-roster',
      JSON.stringify([
        { id: 'p1', name: 'Ravi', rating: 4, rosterIds: ['g1'] },
        { id: 'p2', name: 'Nadia', rating: 4, rosterIds: ['g1'] },
      ])
    );
    mount(createElement(Boom, { error: new Error('boom') }));

    act(() => button(/Tell Me What Happened/).click());
    expect(decodeURIComponent(navigations[0])).toContain('Players: 2');
  });
});
