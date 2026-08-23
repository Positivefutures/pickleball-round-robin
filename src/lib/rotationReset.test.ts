/**
 * @vitest-environment happy-dom
 *
 * Holds the two halves of the rotation fix to what they are for.
 *
 * Turning an installed app to landscape and back left iOS having scrolled the
 * document down under a page that had outgrown its window — and with html and
 * body at `overflow: hidden` there is no gesture that scrolls it back, so the
 * banner stayed off the top of the screen until the app was relaunched. Jeff's
 * report on 2026-08-23. The CSS half stops the page outgrowing the window; the
 * listener half puts the document back if it is ever pushed off anyway.
 *
 * The keyboard case is the one that makes this delicate rather than obvious:
 * iOS scrolls the document on purpose to lift a focused field clear of the
 * keyboard, and a listener that undid every scroll would put the field back
 * under it. That is why the width is what is watched, and it is asserted here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { startRotationReset } from './rotationReset';

/** The listener under test, taken away again after each one. */
let stop: (() => void) | null = null;
function watching(): void {
  stop = startRotationReset();
}

const css = readFileSync('src/index.css', 'utf8');

/** Says the viewport is now this size, the way a turn or a keyboard would. */
function resizeTo(width: number, height: number): void {
  window.innerWidth = width;
  window.innerHeight = height;
  window.dispatchEvent(new Event('resize'));
}

describe('the height the shell is measured against', () => {
  it('gives <html> a dvh height, so the page cannot outlive its window', () => {
    // The rule as written: `height: 100%` first for a browser that has never
    // heard of the unit, then the dvh line the cascade prefers.
    const rule = css.match(/\nhtml \{[^}]*\}/);
    expect(rule?.[0]).toContain('height: 100dvh');
  });

  it('keeps the 100% fallback on html, body and #root', () => {
    expect(css).toMatch(/html,\s*body,\s*#root \{\s*height: 100%;\s*\}/);
  });

  it('still holds the document still, which is what makes a stuck scroll stuck', () => {
    expect(css).toMatch(/html,\s*body \{\s*overflow: hidden;\s*\}/);
  });
});

describe('putting the document back after a turn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.innerWidth = 390;
    window.innerHeight = 844;
    document.scrollingElement!.scrollTop = 0;
  });

  afterEach(() => {
    stop?.();
    stop = null;
    vi.useRealTimers();
  });

  it('scrolls the document home when the width changes', () => {
    watching();
    document.scrollingElement!.scrollTop = 62;
    resizeTo(844, 390);
    expect(document.scrollingElement!.scrollTop).toBe(0);
  });

  it('looks again once iOS has settled, because the first look can be early', () => {
    watching();
    resizeTo(844, 390);
    // Pushed off *after* the event, which is the frame the immediate pass
    // cannot see and the whole reason there is a second one.
    document.scrollingElement!.scrollTop = 62;
    vi.advanceTimersByTime(1000);
    expect(document.scrollingElement!.scrollTop).toBe(0);
  });

  it('leaves a keyboard alone: height moved, width did not', () => {
    watching();
    document.scrollingElement!.scrollTop = 62;
    resizeTo(390, 500);
    vi.advanceTimersByTime(1000);
    expect(document.scrollingElement!.scrollTop).toBe(62);
  });

  it('tracks the new width, so turning back is a turn too', () => {
    watching();
    resizeTo(844, 390);
    document.scrollingElement!.scrollTop = 62;
    resizeTo(390, 844);
    expect(document.scrollingElement!.scrollTop).toBe(0);
  });
});
