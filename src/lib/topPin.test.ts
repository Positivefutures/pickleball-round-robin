/**
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
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('src/index.css', 'utf8');
const header = readFileSync('src/components/layout/Header.tsx', 'utf8');

/** The #top-pin rule block, so assertions cannot match some other selector. */
function pinRule(): string {
  const match = css.match(/#top-pin\s*\{[^}]*\}/);
  if (!match) throw new Error('index.css has no #top-pin rule');
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
    expect(css.split(clamp).length).toBeGreaterThanOrEqual(3);
    expect(header).toContain('1.3333');
    expect(css).toContain('calc(1.3333 * clamp(110px, 26.25vw, 165px))');
    expect(header).toContain("'11rem'");
    expect(css).toContain('calc(100% - 11rem)');
  });

  it('stays off the printed sheet', () => {
    const print = css.slice(css.indexOf('@media print'));
    expect(print).toMatch(/#top-pin\s*\{\s*[^}]*display:\s*none\s*!important/);
  });
});
