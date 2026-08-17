/**
 * @vitest-environment happy-dom
 *
 * My Account, Share the App and Donate, in the app's own colours.
 *
 * These three were built before the palette was settled, each in a green of its
 * own: #3D7E34 across the account family, #018D31 on the share buttons, a green
 * gradient on Ko-fi. Nothing else in the app is green, so they read as three
 * panels borrowed from somewhere else. Jeff's call on 2026-08-17.
 *
 * What is held here is the part a repaint loses first — not that any particular
 * button is a particular hex, but that no green is left to creep back in, and
 * that the one piece of decoration on the share panel is the heart he picked.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SharePanel } from './SharePanel';
import { DonatePanel } from './DonatePanel';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Every file that draws one of the three panels, or is drawn inside one. */
const FILES = [
  'src/components/layout/accountStyles.ts',
  'src/components/layout/AccountShell.tsx',
  'src/components/layout/AccountPanel.tsx',
  'src/components/layout/SignInPanel.tsx',
  'src/components/layout/DeleteAccountPanel.tsx',
  'src/components/layout/MergeChoicePanel.tsx',
  'src/components/layout/DownloadMyData.tsx',
  'src/components/layout/SharePanel.tsx',
  'src/components/layout/DonatePanel.tsx',
];

/** Class names and inline styles, with the prose stripped out. */
function code(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// Undefined until a test opens a panel: the two source scans below render
// nothing, and tearing down a root that was never made is an error of its own.
let root: Root | undefined;
let container: HTMLElement | undefined;

function open(panel: typeof SharePanel | typeof DonatePanel) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(panel, { onClose: () => {} }));
  });
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('the three settings panels', () => {
  it('have no green left in them', () => {
    // Tailwind's greens by name, and the four hand-picked ones these panels
    // were built from. A hex is easy to reintroduce by copying a line from a
    // neighbouring panel, which is exactly how the last repaint left five.
    const green = /(?:border|bg|text|from|to|ring)-green-\d|#3D7E34|#018D31|#029130|#B7DBB8/;
    for (const file of FILES) {
      expect({ file, green: green.test(code(file)) }).toEqual({ file, green: false });
    }
  });

  it('paint what they do in teal, which is what teal means everywhere else', () => {
    // Not a hex, so restyling a button does not fail this. The point is only
    // that the panels reach for the brand colour rather than one of their own.
    for (const file of ['src/components/layout/accountStyles.ts', 'src/components/layout/SharePanel.tsx', 'src/components/layout/DonatePanel.tsx']) {
      expect({ file, teal: /brand-teal/.test(code(file)) }).toEqual({ file, teal: true });
    }
  });
});

describe('Share the App', () => {
  it('closes its pitch with a heart, in the orange the artwork uses', () => {
    // `INBOX/like.svg`, which Jeff picked to replace a disc with a heart cut
    // out of it — that one only read on a plain background, because the hole
    // showed whatever was behind it.
    open(SharePanel);
    const line = [...container!.querySelectorAll('span')].find((s) =>
      s.textContent?.startsWith('Thanks for spreading the word!')
    )!;
    expect(line).toBeDefined();
    const heart = line.querySelector('svg')!;
    expect(heart).not.toBeNull();
    expect(heart.getAttribute('viewBox')).toBe('0 0 512 512');
    expect(heart.getAttribute('class')).toContain('text-brand-orange');
  });
});

describe('Donate', () => {
  it('sends people to Ko-fi on a flat teal button, not a green gradient', () => {
    open(DonatePanel);
    const button = [...container!.querySelectorAll('a')].find((a) =>
      a.textContent?.startsWith('Open Ko-fi')
    )!;
    expect(button.className).toContain('bg-brand-teal');
    expect(button.className).not.toContain('gradient');
  });

  it('puts a cup on it that can sit on a colour', () => {
    // The old one was drawn against white. On a teal button an opaque
    // illustration is a white rectangle with a cup in it.
    open(DonatePanel);
    const cup = container!.querySelector('img[src="/donate-cup.png"]')!;
    expect(cup).not.toBeNull();
    expect(cup.closest('a')?.className).toContain('bg-brand-teal');
  });
});
