// @vitest-environment happy-dom
/**
 * When the tutorial splash appears, and when it leaves people alone. The rule:
 * it greets a launch on the Players tab, returns there at most once an hour,
 * and stops for good once the tour is completed or its checkbox is ticked.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { runMigrations } from './lib/migrations';
import { __tutorialTesting } from './lib/tutorial';

declare global {
   
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const HOUR = 3_600_000;

let root: Root;
let container: HTMLElement;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(App));
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  __tutorialTesting.reset();
});

function remount(between?: () => void) {
  act(() => root.unmount());
  container.remove();
  between?.();
  mount();
}

function freshInstall() {
  window.localStorage.clear();
  runMigrations();
}

function text(el: Element): string {
  return (el.textContent ?? '').trim();
}

function clickButton(re: RegExp) {
  const found = [...container.querySelectorAll('button')].filter((b) => re.test(text(b)));
  if (found.length === 0) throw new Error(`no button matching ${re}`);
  act(() => found[0].click());
}

/** "Skip Tutorial" only ever appears on the splash. */
const splashShowing = () => container.textContent?.includes('Skip Tutorial') ?? false;

/** Winds the last-shown clock back, as if `ms` had passed. */
function agoMs(ms: number) {
  const at = JSON.parse(window.localStorage.getItem('pb-tutorial-splash-at') ?? '0');
  window.localStorage.setItem('pb-tutorial-splash-at', JSON.stringify(at - ms));
}

describe('the tutorial splash', () => {
  it('greets a fresh install by name, with both doors', () => {
    freshInstall();
    mount();
    expect(splashShowing()).toBe(true);
    expect(container.textContent).toContain('Pickleball Round Robin Generator');
    expect(container.textContent).toContain('Start Tutorial');
    expect(container.textContent).toContain('Don’t show at startup');
  });

  it('skip closes it, and it stays away for an hour but not forever', () => {
    freshInstall();
    mount();
    clickButton(/^Skip Tutorial$/);
    expect(splashShowing()).toBe(false);

    // A relaunch twenty minutes later: still quiet.
    remount(() => agoMs(20 * 60_000));
    expect(splashShowing()).toBe(false);

    // A relaunch an hour on: the offer stands again.
    remount(() => agoMs(HOUR));
    expect(splashShowing()).toBe(true);
  });

  it('the checkbox ends it for good', () => {
    freshInstall();
    mount();
    // The roster's select boxes come first in the DOM; find the splash's own.
    const label = [...container.querySelectorAll('label')].find((l) =>
      text(l).includes('show at startup')
    );
    const box = label?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    act(() => box.click());
    expect(JSON.parse(window.localStorage.getItem('pb-tutorial-dismissed')!)).toBe(true);
    clickButton(/^Skip Tutorial$/);

    remount(() => agoMs(2 * HOUR));
    expect(splashShowing()).toBe(false);
  });

  it('a completed tutorial ends it for good', () => {
    freshInstall();
    window.localStorage.setItem('pb-tutorial-completed', JSON.stringify(true));
    mount();
    expect(splashShowing()).toBe(false);

    remount(() => agoMs(2 * HOUR));
    expect(splashShowing()).toBe(false);
  });

  it('waits for the Players tab rather than interrupting another one', () => {
    freshInstall();
    // The host was last on Setup: a session is being planned.
    window.localStorage.setItem('pb-step', JSON.stringify('setup'));
    window.localStorage.setItem('pb-setup-seen', JSON.stringify(true));
    mount();
    expect(splashShowing()).toBe(false);

    // Landing back on Players is the moment it may speak.
    clickButton(/^1\. Players$/);
    expect(splashShowing()).toBe(true);
  });
});
