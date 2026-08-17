/**
 * @vitest-environment happy-dom
 *
 * The scroll architecture, held in place.
 *
 * The document never scrolls in this app: index.css pins html, body and #root
 * to the viewport, and everything scrolls inside the `[data-app-scroll]` pane
 * instead. That is the whole defence against iOS 26's scroll edge effect,
 * which blurs the top rows of any installed web app whose document can scroll
 * and paints the smear up under the clock — with the root held still it never
 * engages. There is no browser in this test run to prove that on, so what is
 * held here is the arrangement itself: the stylesheet that pins the root, the
 * pane both mounting points carry, and the helpers everything scrolls through.
 * Loosen any of them and the banner quietly starts blurring again on every
 * iPhone home screen.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appScroller, appScrollY, appScrollTo, appScrollBy } from './appScroll';

afterEach(() => {
  document.querySelectorAll('[data-app-scroll]').forEach((el) => el.remove());
});

function mountPane(): HTMLElement {
  const pane = document.createElement('div');
  pane.setAttribute('data-app-scroll', '');
  document.body.appendChild(pane);
  return pane;
}

describe('the stylesheet that holds the document still', () => {
  // Read off disk rather than imported: this asserts on the source Tailwind is
  // handed, and an import of a .css in happy-dom is a no-op module.
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

  it('pins html, body and #root to the viewport', () => {
    // All three, because a chain of height: 100% is only as tall as its
    // weakest link: drop #root and the shell's h-full resolves against auto.
    expect(css).toMatch(/html,\s*body,\s*#root\s*\{\s*height:\s*100%;\s*\}/);
    expect(css).toMatch(/html,\s*body\s*\{\s*overflow:\s*hidden;\s*\}/);
  });

  it('gives the pane the scrolling the document gave up', () => {
    const rule = css.match(/\.app-scroll\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain('height: 100%');
    expect(rule![1]).toContain('overflow-y: auto');
    // And no rubber banding or pull to refresh, which used to live on the body.
    expect(rule![1]).toContain('overscroll-behavior: none');
  });

  it('opens every box back up for print', () => {
    // Paper has no viewport. Without this the schedule prints as one page,
    // clipped at the fold, and the printer never hears about the rest.
    const print = css.match(/@media print\s*\{([\s\S]*)/);
    expect(print).not.toBeNull();
    const reset = print![1].match(
      /html,\s*body,\s*#root,\s*\.app-shell,\s*\.app-panel,\s*\.app-scroll\s*\{([^}]*)\}/
    );
    expect(reset).not.toBeNull();
    expect(reset![1]).toContain('height: auto !important');
    expect(reset![1]).toContain('overflow: visible !important');
  });
});

describe('the pane both mounting points carry', () => {
  // Source-level on purpose: App mounts for the app, LiveSessionPage instead
  // of it for a shared link, and whichever one is up must bring the pane or
  // that whole page cannot scroll at all.
  for (const file of ['src/App.tsx', 'src/components/live/LiveSessionPage.tsx']) {
    it(`is in ${file}`, () => {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source).toContain('data-app-scroll');
    });
  }
});

describe('the helpers everything scrolls through', () => {
  it('finds the pane by its attribute', () => {
    const pane = mountPane();
    expect(appScroller()).toBe(pane);
  });

  it('reads how far down the pane is', () => {
    const pane = mountPane();
    pane.scrollTop = 120;
    expect(appScrollY()).toBe(120);
  });

  it('hands scrollTo through to the pane, with its options intact', () => {
    // The behaviour matters: Back to Top scrolls smooth unless the phone has
    // asked for less movement, and a helper that dropped the option would
    // flatten that choice everywhere at once.
    const pane = mountPane();
    const calls: ScrollToOptions[] = [];
    pane.scrollTo = ((options: ScrollToOptions) => calls.push(options)) as never;
    appScrollTo({ top: 0, behavior: 'smooth' });
    expect(calls).toEqual([{ top: 0, behavior: 'smooth' }]);
  });

  it('falls back to scrollTop where the element has no scroll methods', () => {
    // jsdom and happy-dom, which is what lets every other test drive the real
    // App without stubbing scrolling first.
    const pane = mountPane();
    (pane as { scrollTo?: unknown }).scrollTo = undefined;
    (pane as { scrollBy?: unknown }).scrollBy = undefined;
    appScrollTo({ top: 40 });
    expect(pane.scrollTop).toBe(40);
    appScrollBy(-15);
    expect(pane.scrollTop).toBe(25);
  });

  it('does nothing at all without a pane', () => {
    // A dialog mounted alone in a test has no App around it. Its scroll lock
    // and its scrolls must be no-ops rather than crashes.
    expect(appScroller()).toBeNull();
    expect(appScrollY()).toBe(0);
    expect(() => appScrollTo({ top: 10 })).not.toThrow();
    expect(() => appScrollBy(10)).not.toThrow();
  });
});
