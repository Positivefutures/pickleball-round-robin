/**
 * @vitest-environment happy-dom
 *
 * Holds the anti-blur strip together across the three files that share it.
 *
 * iOS 26 blurs an installed app's top rows into the status bar unless a
 * painted position:fixed element at least 8px tall owns the top of the
 * viewport. That rule was measured on a real iPhone with public/blurtest.html
 * (2026-08-17), and #top-pin is the app's answer: a static strip in
 * index.html drawn as a copy of the banner's own first rows. Everything
 * asserted here is a property the measurement showed to be load-bearing, or
 * a number the strip and the banner must agree on to stay invisible.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { startTopPinGhost } from './topPin';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('src/index.css', 'utf8');
const header = readFileSync('src/components/layout/Header.tsx', 'utf8');

/** The #top-pin rule block, so assertions cannot match some other selector. */
function pinRule(): string {
  const match = html.match(/#top-pin\s*\{[^}]*\}/);
  if (!match) throw new Error('index.html has no #top-pin rule');
  return match[0];
}

describe('the strip that keeps iOS from blurring the banner', () => {
  it('exists in index.html, after #root so its z-index wins the tie', () => {
    const root = html.indexOf('<div id="root">');
    const pin = html.indexOf('<div id="top-pin"');
    expect(root).toBeGreaterThan(-1);
    expect(pin).toBeGreaterThan(root);
  });

  it('carries both banner images, so at rest it copies what it covers', () => {
    const pin = html.slice(html.indexOf('<div id="top-pin"'));
    const block = pin.slice(0, pin.indexOf('</div>\n    <script'));
    expect(block).toContain('/header-left.png');
    expect(block).toContain('/header-right.jpg');
  });

  it('is styled from index.html itself, not from a stylesheet that loads late', () => {
    // These rules used to live in src/index.css, which in dev arrives through
    // JavaScript. Until it did, the browser laid the strip's two banner images
    // out at their natural size: a full-screen robin stacked on a full-screen
    // court, which is what Jeff reported on 2026-08-20 as the app looking
    // broken on load. `vite build` hid it behind a render-blocking <link>, so
    // it only ever showed on the dev server, but an element whose whole job is
    // to be painted before iOS looks cannot take its geometry from a late
    // file. Anything the strip needs on the first frame belongs in the
    // document.
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toMatch(/<style>[\s\S]*#top-pin\s*\{/);
    expect(css).not.toMatch(/^\s*#top-pin[^\n]*\{/m);
  });

  it('is fixed and painted, the two properties iOS decides by', () => {
    const rule = pinRule();
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/background:\s*#fbfaf6/i);
  });

  it('is 8px tall, the floor under launch-time detection', () => {
    // 2px was overlooked at launch on a real iPhone; 8px never was. Anything
    // thinner than 8 risks the blur coming back on a cold open.
    expect(pinRule()).toMatch(/height:\s*8px/);
  });

  it('never eats a tap', () => {
    expect(pinRule()).toMatch(/pointer-events:\s*none/);
  });

  it('sizes its artwork off the banner clamp Header.tsx actually uses', () => {
    // The strip is invisible only while these numbers match the banner's own.
    // If the banner height, the court aspect, or the title minimum changes in
    // Header.tsx, the strip has to change with it or the top 8px will show a
    // misaligned copy.
    const clamp = 'clamp(110px, 26.25vw, 165px)';
    expect(header).toContain(clamp);
    expect(html.split(clamp).length).toBeGreaterThanOrEqual(3);
    expect(header).toContain('1.3333');
    expect(html).toContain('calc(1.3333 * clamp(110px, 26.25vw, 165px))');
    expect(header).toContain("'12rem'");
    expect(html).toContain('calc(100% - 12rem)');
    // Without this the images ignore the height above and Tailwind's preflight
    // caps them at the strip's own width, which is the unstyled shape again.
    expect(html).toMatch(/#top-pin img\s*\{[^}]*height:\s*var\(--top-pin-art\)/);
    expect(html).toMatch(/#top-pin img\s*\{[^}]*max-width:\s*none/);
  });

  it('stays off the printed sheet', () => {
    const print = html.slice(html.indexOf('@media print'));
    expect(print).toMatch(/#top-pin\s*\{\s*[^}]*display:\s*none\s*!important/);
  });

  it('can ghost, and something actually starts the watcher', () => {
    expect(html).toMatch(/#top-pin\.ghost\s*\{\s*opacity:\s*0/);
    const main = readFileSync('src/main.tsx', 'utf8');
    expect(main).toContain('startTopPinGhost()');
  });
});

describe('the same strip on the static pages, in their teal', () => {
  // terms.html and privacy.html are their own documents with their own teal
  // header, so the app's strip cannot reach them; each carries its own copy.
  // Same measured rules: fixed, painted, 8px.
  for (const page of ['public/terms.html', 'public/privacy.html']) {
    it(`${page} pins a painted 8px strip to the top`, () => {
      const source = readFileSync(page, 'utf8');
      expect(source).toContain('<div id="top-pin" aria-hidden="true">');
      const rule = source.match(/#top-pin\s*\{[^}]*\}/)?.[0] ?? '';
      expect(rule).toMatch(/position:\s*fixed/);
      expect(rule).toMatch(/height:\s*8px/);
      expect(rule).toMatch(/background:\s*var\(--teal\)/);
      expect(rule).toMatch(/pointer-events:\s*none/);
      expect(source).toMatch(/@media print\s*\{\s*#top-pin\s*\{\s*display:\s*none/);
    });

    it(`${page} fades the strip out on scroll, after the launch window`, () => {
      const source = readFileSync(page, 'utf8');
      expect(source).toMatch(/#top-pin\.ghost\s*\{\s*opacity:\s*0/);
      // The same floor mode J proved: the paint must outlive the launch.
      expect(source).toContain('Date.now() - born > 1500');
      expect(source).toContain("addEventListener('scroll', look");
    });
  }
});

describe('the ghost that hides the strip once the app scrolls', () => {
  let pin: HTMLElement;
  let pane: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    pin = document.createElement('div');
    pin.id = 'top-pin';
    pane = document.createElement('div');
    pane.setAttribute('data-app-scroll', '');
    document.body.append(pin, pane);
    startTopPinGhost();
  });

  afterEach(() => {
    pin.remove();
    pane.remove();
    vi.useRealTimers();
  });

  const scroll = (top: number) => {
    pane.scrollTop = top;
    pane.dispatchEvent(new Event('scroll'));
  };

  it('holds its paint through the launch window even while scrolled', () => {
    // Mode J's guarantee only works if the paint is there when iOS looks.
    vi.advanceTimersByTime(500);
    scroll(400);
    expect(pin.classList.contains('ghost')).toBe(false);
  });

  it('settles a scroll that happened inside the window', () => {
    vi.advanceTimersByTime(500);
    scroll(400);
    vi.advanceTimersByTime(1200);
    expect(pin.classList.contains('ghost')).toBe(true);
  });

  it('fades out scrolled and returns at the top', () => {
    vi.advanceTimersByTime(2000);
    scroll(400);
    expect(pin.classList.contains('ghost')).toBe(true);
    scroll(0);
    expect(pin.classList.contains('ghost')).toBe(false);
  });

  it('ignores some other element scrolling while the pane is home', () => {
    vi.advanceTimersByTime(2000);
    const list = document.createElement('div');
    document.body.append(list);
    list.dispatchEvent(new Event('scroll'));
    expect(pin.classList.contains('ghost')).toBe(false);
    list.remove();
  });
});
