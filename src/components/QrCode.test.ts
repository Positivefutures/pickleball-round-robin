/**
 * @vitest-environment happy-dom
 *
 * The QR code on screen.
 *
 * qr.test.ts covers the encoding. This is about the drawing: that the square
 * holds its size while the encoder is still loading, that it is one path rather
 * than nine hundred rects, and that it says something useful to a screen reader
 * instead of describing a pattern of dots.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QrCode } from './QrCode';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LINK = 'https://app.roundrobinator.com/?s=K7M2QXV9TB';

let root: Root;
let container: HTMLElement;

async function mount(props: { value: string; size?: number; label: string }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(QrCode, props));
  });
  // The encoder is a dynamic import, so the first pass renders the placeholder.
  // How many turns of the microtask queue that import takes is not ours to
  // predict — the very first call in a run pays for loading the module, later
  // ones do not — so this settles rather than counting passes.
  for (let pass = 0; pass < 20 && !container.querySelector('svg'); pass++) {
    await act(async () => {});
  }
  return container;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('drawing a code', () => {
  it('is one path, not a rect for every module', async () => {
    const el = await mount({ value: LINK, label: 'Link to this session' });
    const svg = el.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(el.querySelectorAll('path')).toHaveLength(1);
    expect(el.querySelector('path')!.getAttribute('d')!.length).toBeGreaterThan(100);
  });

  it('scales with its box rather than being fixed at some number of pixels', async () => {
    // It is looked at across a table and sometimes printed. A viewBox is what
    // lets both of those be the same drawing.
    const el = await mount({ value: LINK, size: 200, label: 'Link to this session' });
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toMatch(/^0 0 \d+ \d+$/);
    expect(svg.getAttribute('width')).toBe('200');
  });

  it('paints its own white background, so the quiet zone is really white', async () => {
    const el = await mount({ value: LINK, label: 'Link to this session' });
    expect(el.querySelector('rect')!.getAttribute('fill')).toBe('#ffffff');
  });

  it('keeps its edges hard, because a soft module does not scan', async () => {
    const el = await mount({ value: LINK, label: 'Link to this session' });
    expect(el.querySelector('svg')!.getAttribute('shape-rendering')).toBe('crispEdges');
  });

  it('says what it is rather than describing dots', async () => {
    const el = await mount({ value: LINK, label: 'Link to this session' });
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Link to this session');
  });

  it('holds its size before the encoder has loaded', async () => {
    // The placeholder is the same box. Without it the Copy Link button jumps
    // out from under the finger already on its way to it.
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(createElement(QrCode, { value: LINK, size: 240, label: 'Link' }));
    });
    const holder = container.firstElementChild as HTMLElement;
    expect(holder.tagName).toBe('DIV');
    expect(holder.style.width).toBe('240px');
    expect(holder.style.height).toBe('240px');
    // And it is not read out, because there is nothing there yet.
    expect(holder.getAttribute('aria-hidden')).toBe('true');
    await act(async () => {});
  });
});
