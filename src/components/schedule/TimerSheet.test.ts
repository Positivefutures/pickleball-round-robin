/**
 * @vitest-environment happy-dom
 *
 * The round timer's handle.
 *
 * It has been drawn at the top of this sheet since the sheet existed and did
 * nothing at all — a bar that says "pull me" and then ignores a pull is worse
 * than no bar. So: past DISMISS_PX and letting go closes the timer, short of it
 * the sheet goes back where it was, and while it is held it follows the finger.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TimerSheet } from './TimerSheet';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLElement;

function open(onClose: () => void) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(TimerSheet, {
        roundNumber: 2,
        alarming: false,
        remainingMs: 8 * 60 * 1000,
        light: true,
        flashOn: false,
        onClose,
      })
    );
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const sheet = () => container.querySelector('[role="dialog"]') as HTMLElement;
/** The grab area around the bar: the only thing in the sheet that takes a drag. */
const handle = () => container.querySelector('[aria-hidden="true"].touch-none') as HTMLElement;

/**
 * A pointer event happy-dom will carry a clientY on. Its PointerEvent ignores
 * the field, so this is a plain Event with the two properties React reads
 * written onto it.
 */
function pointer(type: string, clientY: number): Event {
  const e = new Event(type, { bubbles: true });
  Object.assign(e, { clientY, pointerId: 1, isPrimary: true, button: 0, pointerType: 'touch' });
  return e;
}

function pull(from: number, to: number, release = true) {
  const el = handle();
  act(() => {
    el.dispatchEvent(pointer('pointerdown', from));
  });
  act(() => {
    el.dispatchEvent(pointer('pointermove', to));
  });
  if (release) act(() => void el.dispatchEvent(pointer('pointerup', to)));
}

describe('pulling the timer sheet down by its handle', () => {
  it('is a handle at all: a target big enough to catch, that does not scroll the page', () => {
    // The bar itself is six pixels tall. Without the padded area around it and
    // touch-action none, a drag on a phone scrolls whatever is behind instead.
    open(() => {});
    expect(handle()).not.toBeNull();
    expect(handle().className).toContain('touch-none');
    expect(handle().querySelector('.h-1\\.5.w-14')).not.toBeNull();
  });

  it('follows the finger while it is held', () => {
    open(() => {});
    pull(200, 240, false);
    expect(sheet().style.transform).toBe('translateY(40px)');
    // No 300ms ease on a drag, or the sheet trails a third of a second behind.
    expect(sheet().style.transitionProperty).toBe('none');
  });

  it('does not follow it upward, where the sheet has nowhere to go', () => {
    open(() => {});
    pull(200, 120, false);
    expect(sheet().style.transform).toBe('translateY(0px)');
  });

  it('closes the timer when it is pulled far enough and let go', () => {
    const onClose = vi.fn();
    open(onClose);
    pull(200, 320);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('springs back, and closes nothing, on a nudge', () => {
    // The distance a thumb travels on its way to START. Closing on that would
    // throw away a running round.
    const onClose = vi.fn();
    open(onClose);
    pull(200, 230);
    expect(onClose).not.toHaveBeenCalled();
    // Handed back to the entrance animation's own classes rather than pinned
    // where the drag left it.
    expect(sheet().style.transform).toBe('');
    expect(sheet().style.transitionProperty).toBe('transform');
  });

  it('ignores a pointer that never went down on it', () => {
    // pointermove fires on the sheet for all sorts of reasons — a stylus
    // hovering, a mouse crossing it — and none of them are a drag.
    const onClose = vi.fn();
    open(onClose);
    act(() => void handle().dispatchEvent(pointer('pointermove', 400)));
    act(() => void handle().dispatchEvent(pointer('pointerup', 400)));
    expect(sheet().style.transform).toBe('');
    expect(onClose).not.toHaveBeenCalled();
  });
});
