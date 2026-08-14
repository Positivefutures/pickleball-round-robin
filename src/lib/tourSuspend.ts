import { useLayoutEffect } from 'react';

/**
 * Which of the app's own panels the tour has to stand down for, and when.
 *
 * The tour cannot get out of a panel's way with a z-index. It is mounted outside
 * `.app-panel`, which it has to be — that element takes a transform when the
 * settings drawer slides, and a transformed ancestor becomes the containing
 * block for its fixed children, which would carry the spotlight off the screen
 * with it. But `.app-panel` also carries `z-10`, so every panel inside it,
 * however high it sets its own z-index, is stacked inside that one context and
 * the overlay sitting outside comes out over the lot. So it hides instead.
 *
 * This is a counter and not a boolean because two of those panels can be open at
 * once: Manage Groups opens Duplicate and Delete inside itself.
 *
 * It replaces a `document.querySelector` run once a frame. That worked, and it
 * flickered: the panel opened, the page painted with the tour still drawn over
 * it, and only the frame after that did the poll notice and take the tour down.
 * The same on the way back, a frame of undimmed page before the tour returned.
 * Registered from a layout effect instead, so the two happen in the same commit
 * and nothing is ever painted half way between them.
 */

let depth = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of [...listeners]) listener();
}

export function subscribeSuspend(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function tourSuspended(): boolean {
  return depth > 0;
}

/**
 * Called by a panel that the tour must not draw over. Nothing is passed and
 * nothing comes back: being mounted is the whole message.
 */
export function useSuspendsTour() {
  useLayoutEffect(() => {
    depth += 1;
    emit();
    return () => {
      depth -= 1;
      emit();
    };
  }, []);
}

export const __suspendTesting = {
  reset() {
    depth = 0;
    listeners.clear();
  },
};
