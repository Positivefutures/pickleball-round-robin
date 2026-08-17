/**
 * @vitest-environment happy-dom
 *
 * The cream band above the banner, and the one thing it is for.
 *
 * iOS 26 draws its scroll edge effect over the top of an installed web app: it
 * samples the page's own first rows, blurs them, and paints the result back
 * over them and up under the clock. It cannot be switched off. The only lever
 * is what it has to blur, and a blur of a flat colour is that flat colour — so
 * the banner's artwork has to start below everything the effect touches, with
 * nothing but cream above it.
 *
 * Two earlier attempts sized that band off `env(safe-area-inset-top)` and both
 * shipped a band of zero: this app runs the opaque iOS status bar, so the
 * viewport it is handed already starts below the clock and the inset inside the
 * page is 0. Which is why the height is now a plain number, in the stylesheet,
 * behind an attribute — and why all three halves of that are held here. Delete
 * any one of them and the band silently goes back to nothing.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Header } from './Header';
import { isHomeScreenApp, markHomeScreenApp } from '../../lib/homeScreen';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLElement;

function open() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(Header, { title: 'Pickleball Round Robin Generator' }));
  });
}

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  document.documentElement.removeAttribute('data-home-screen');
});

/** A navigator, of only the parts either check reads. */
function nav(over: Partial<Navigator> & { standalone?: unknown }): Navigator {
  return { userAgent: '', maxTouchPoints: 0, ...over } as unknown as Navigator;
}

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15';

describe('the banner', () => {
  it('opens with the band, above the artwork rather than inside it', () => {
    // Above: the whole point is that nothing saturated is in the rows iOS
    // samples, and the wedge is on the header's first row.
    open();
    const band = container.querySelector('.top-band')!;
    expect(band).not.toBeNull();
    expect(band.getAttribute('aria-hidden')).toBe('true');
    expect(
      band.compareDocumentPosition(container.querySelector('header')!)
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('fills the band with the cream the banner itself sits on', () => {
    // Any other colour and the band is a stripe rather than an extension of
    // the page, which is worse than the blur it replaces. Compared against the
    // header's own fill rather than a hex written out twice here.
    open();
    const band = container.querySelector('.top-band') as HTMLElement;
    const header = container.querySelector('header') as HTMLElement;
    expect(band.style.backgroundColor.toUpperCase()).toBe('#FBFAF6');
    expect(band.style.backgroundColor).toBe(header.style.backgroundColor);
  });
});

describe('the stylesheet behind it', () => {
  // Read off disk rather than imported: this asserts on the source Tailwind is
  // handed, and an import of a .css in happy-dom is a no-op module.
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

  it('gives the band no height at all by default', () => {
    // Forty blank pixels buy nothing in a browser tab, on a desktop, or on an
    // Android install. They are spent only where the blur is.
    expect(css).toMatch(/\.top-band\s*\{\s*height:\s*0;/);
  });

  it('gives it a real height on a home screen app, past the safe area', () => {
    const rule = css.match(/html\[data-home-screen\]\s+\.top-band\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    // The fixed term is what makes this work today; the inset term is what
    // keeps it working the day this app takes the translucent status bar and
    // the viewport grows upward. Measured need is 36pt — see the comment there.
    expect(rule![1]).toContain('env(safe-area-inset-top, 0px)');
    expect(rule![1]).toMatch(/\+\s*40px/);
  });
});

describe('deciding whether this is a home screen app', () => {
  it('takes Apple’s own answer where there is one', () => {
    // navigator.standalone is iOS only and installed only, so `=== true` is
    // both halves of the question in one read and no user agent sniffing.
    expect(isHomeScreenApp(nav({ standalone: true }))).toBe(true);
    expect(isHomeScreenApp(nav({ standalone: false, userAgent: IPHONE }))).toBe(false);
  });

  it('falls back to display-mode plus the platform, for the day Apple drops it', () => {
    const media = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('standalone') })) as never;
    try {
      expect(isHomeScreenApp(nav({ userAgent: IPHONE }))).toBe(true);
      // iPadOS calls itself a Mac. No real Mac reports more than one touch point.
      expect(isHomeScreenApp(nav({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 }))).toBe(true);
      expect(isHomeScreenApp(nav({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0 }))).toBe(false);
      // An installed app on anything else. It has no scroll edge effect, so it
      // must not pay for one.
      expect(isHomeScreenApp(nav({ userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/140' }))).toBe(
        false
      );
    } finally {
      window.matchMedia = media;
    }
  });

  it('is not a home screen app in an ordinary browser', () => {
    // matchMedia here is happy-dom's, which answers no to everything. That is
    // the right answer for a tab.
    expect(isHomeScreenApp(nav({ userAgent: IPHONE }))).toBe(false);
  });

  it('writes the answer onto the document, which is where the rule reads it', () => {
    const standalone = Object.getOwnPropertyDescriptor(navigator, 'standalone');
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    try {
      markHomeScreenApp();
      expect(document.documentElement.getAttribute('data-home-screen')).toBe('true');
    } finally {
      if (standalone) Object.defineProperty(navigator, 'standalone', standalone);
      else Reflect.deleteProperty(navigator, 'standalone');
    }
  });

  it('leaves the document alone otherwise', () => {
    markHomeScreenApp();
    expect(document.documentElement.hasAttribute('data-home-screen')).toBe(false);
  });
});
