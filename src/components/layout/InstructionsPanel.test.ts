/**
 * @vitest-environment happy-dom
 *
 * The manual, kept honest.
 *
 * Instructions rot in a particular way: the app moves on and the words stay.
 * This file guards the three ways that happened last time. The pictures are
 * checked against the real files, so a chapter can never name a screenshot
 * that is not shipped. The navigation is walked for real, every topic in and
 * back out. And the claims that went stale once are pinned so they cannot
 * come back: storage is no longer device-only, feedback no longer opens a
 * mail app, and switching groups parks a session rather than clearing it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { InstructionsPanel } from './InstructionsPanel';
import { SHOTS } from './instructionShots';
import { ACCOUNTS_ENABLED } from '../../lib/appInfo';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TOPICS = [
  'Quick start',
  '1. Players & groups',
  '2. Set up the session',
  '3. Run the schedule',
  'Mid-session changes',
  'Share the session live',
  'Your account & sync',
  'The settings menu',
  'Good to know',
];

let root: Root;
let container: HTMLElement;

function mount(onStartTutorial: () => void = () => {}): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(createElement(InstructionsPanel, { onClose: () => {}, onStartTutorial })));
  return container;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function click(label: string) {
  const found = [...container.querySelectorAll('button')].find((el) =>
    (el.textContent ?? '').includes(label)
  );
  if (!found) throw new Error(`no button containing "${label}"`);
  act(() => found.click());
}

/** The panel's text with every chapter opened once, for the copy assertions. */
function allText(): string {
  mount();
  let text = container.textContent ?? '';
  for (const topic of TOPICS) {
    click(topic);
    text += container.textContent ?? '';
    click('All topics');
  }
  return text;
}

describe('the topic list', () => {
  it('puts the tutorial entry above the chapter list, and it fires', () => {
    let started = 0;
    mount(() => {
      started += 1;
    });

    const body = container.textContent ?? '';
    expect(body.indexOf('Take the Tutorial')).toBeGreaterThan(-1);
    expect(body.indexOf('Take the Tutorial')).toBeLessThan(body.indexOf('Quick start'));

    click('Take the Tutorial');
    expect(started).toBe(1);
  });

  it('offers every chapter, and each one opens and comes back', () => {
    mount();
    for (const topic of TOPICS) {
      expect(container.textContent).toContain(topic);
    }

    for (const topic of TOPICS) {
      click(topic);
      // The list is gone: its rows are not on a chapter page.
      const others = TOPICS.filter((t) => t !== topic);
      const shown = others.filter((t) => container.textContent?.includes(t));
      // A chapter may name one other topic in passing (a Next link, a cross
      // reference), never most of them.
      expect(shown.length).toBeLessThan(3);

      click('All topics');
      for (const t of TOPICS) expect(container.textContent).toContain(t);
    }
  });

  it('walks front to back on the Next links', () => {
    mount();
    click(TOPICS[0]);
    for (const topic of TOPICS.slice(1)) {
      click(`Next${topic}`);
      expect(container.querySelector('h3')?.textContent).toContain(topic);
    }
    // The last chapter offers the way back instead.
    click('Back to all topics');
    expect(container.textContent).toContain(TOPICS[0]);
  });
});

describe('the pictures', () => {
  const dir = resolve(__dirname, '../../../public/instructions');

  it('are all really on disk', () => {
    const missing = Object.keys(SHOTS).filter((name) => !existsSync(resolve(dir, `${name}.webp`)));
    expect(missing).toEqual([]);
  });

  it('leave no file in the folder unused', () => {
    const unused = readdirSync(dir)
      .map((file) => file.replace(/\.webp$/, ''))
      .filter((name) => !(name in SHOTS));
    expect(unused).toEqual([]);
  });

  it('every chapter shows only pictures from the list, sized as declared', () => {
    mount();
    for (const topic of TOPICS) {
      click(topic);
      for (const img of container.querySelectorAll('img')) {
        const name = img.getAttribute('src')?.match(/^\/instructions\/(.+)\.webp$/)?.[1];
        expect(name, `unexpected src ${img.getAttribute('src')}`).toBeTruthy();
        const size = SHOTS[name!];
        expect(Number(img.getAttribute('width'))).toBe(size.width);
        expect(Number(img.getAttribute('height'))).toBe(size.height);
        expect(img.getAttribute('loading')).toBe('lazy');
        expect(img.getAttribute('alt')).toBeTruthy();
      }
      click('All topics');
    }
  });
});

describe('claims that went stale once', () => {
  it('no longer says storage is device-only, and owns up to sync', () => {
    const text = allText();
    expect(text).not.toContain('stored on this device only');
    expect(text).not.toContain('No account, no sync');
    if (ACCOUNTS_ENABLED) {
      expect(text).toContain('sync');
      expect(text.toLowerCase()).toContain('sign in');
    }
  });

  it('knows feedback sends from inside the app', () => {
    const text = allText();
    expect(text).not.toContain('opens your email app');
    expect(text).toContain('from inside the app');
  });

  it('knows switching groups parks the session rather than clearing it', () => {
    const text = allText();
    expect(text).not.toContain('clears that session');
    expect(text).toContain('own session');
  });
});
