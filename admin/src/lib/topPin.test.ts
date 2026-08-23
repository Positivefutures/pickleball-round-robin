/**
 * The anti-blur strip, held to its contract.
 *
 * Every one of these guards a failure that is invisible from a desk: the blur
 * only appears on a real iPhone, only when the page is installed to the home
 * screen, and the two ways the main app broke this rule both passed a
 * production check first. So the rules are asserted against the file on disk
 * rather than against a rendered page.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAINT_FLOOR_MS, shouldGhost } from './topPin';

const root = join(import.meta.dirname, '..', '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'src', 'index.css'), 'utf8');

/** Everything between the first <style> and its close, which is where the strip's rules live. */
const inlineStyle = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

describe('the strip is in the document', () => {
  it('exists, and is inert', () => {
    expect(html).toContain('<div id="top-pin" aria-hidden="true"></div>');
  });

  it('sits after #root, so it paints over whatever the app puts on the page', () => {
    expect(html.indexOf('id="root"')).toBeLessThan(html.indexOf('id="top-pin"'));
  });

  it('is static HTML rather than something React mounts', () => {
    // The decision is made at launch, before any module has run. An element
    // created by the app is created after the window it is meant to cover.
    expect(html.indexOf('id="top-pin"')).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
  });
});

describe('its rules are inline, and stay inline', () => {
  // src/index.css is fetched over JavaScript in dev, so rules that live there
  // arrive after the frames that matter. `vite build` turns it into a
  // render-blocking <link>, which hides the mistake everywhere except a phone.
  it('are in the head, not in the stylesheet', () => {
    expect(inlineStyle).toContain('#top-pin');
    expect(css).not.toContain('#top-pin');
  });

  it('is fixed, not sticky', () => {
    // Measured: position:sticky does not make iOS stand down.
    expect(inlineStyle).toMatch(/#top-pin\s*\{[^}]*position:\s*fixed/);
    expect(inlineStyle).not.toMatch(/#top-pin\s*\{[^}]*position:\s*sticky/);
  });

  it('owns the whole top edge', () => {
    const block = inlineStyle.slice(inlineStyle.indexOf('#top-pin {'));
    for (const rule of ['top: 0', 'left: 0', 'right: 0']) expect(block).toContain(rule);
  });

  it('is at least the 8px of paint that was measured to be the floor', () => {
    const height = /#top-pin\s*\{[^}]*height:\s*(\d+)px/.exec(inlineStyle);
    expect(height).not.toBeNull();
    expect(Number(height![1])).toBeGreaterThanOrEqual(8);
  });

  it('is painted, because a transparent strip does not make the decision', () => {
    expect(inlineStyle).toMatch(/#top-pin\s*\{[^}]*background:\s*#[0-9a-f]{6}/i);
  });
});

describe('it is invisible at rest', () => {
  it('is painted the same teal as the header bar it lands on', () => {
    // If the palette moves and this does not, the strip stops being camouflage
    // and becomes a stripe across the top of the page.
    const token = /--color-brand-teal:\s*(#[0-9a-f]{6})/i.exec(css);
    const paint = /#top-pin\s*\{[^}]*background:\s*(#[0-9a-f]{6})/i.exec(inlineStyle);
    expect(token).not.toBeNull();
    expect(paint).not.toBeNull();
    expect(paint![1].toLowerCase()).toBe(token![1].toLowerCase());
  });
});

describe('the ghost, and the floor under it', () => {
  it('stays painted through the launch window however far the page is scrolled', () => {
    expect(shouldGhost(0, 4000)).toBe(false);
    expect(shouldGhost(PAINT_FLOOR_MS, 4000)).toBe(false);
  });

  it('fades once the window has passed and the page has left the top', () => {
    expect(shouldGhost(PAINT_FLOOR_MS + 1, 2)).toBe(true);
  });

  it('comes back when the page returns to the top', () => {
    expect(shouldGhost(PAINT_FLOOR_MS + 10_000, 0)).toBe(false);
  });

  it('ignores the rubber-band pixel', () => {
    expect(shouldGhost(PAINT_FLOOR_MS + 1, 1)).toBe(false);
  });

  it('keeps a floor of at least the 1.5s the blur lab proved', () => {
    expect(PAINT_FLOOR_MS).toBeGreaterThanOrEqual(1500);
  });
});
