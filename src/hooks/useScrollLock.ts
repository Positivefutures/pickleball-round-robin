import { useEffect } from 'react';
import { appScroller } from '../lib/appScroll';

/**
 * Freezes the page behind an overlay.
 *
 * The page is the `[data-app-scroll]` pane rather than the document — the
 * document never scrolls in this app; see the scroll architecture at the top
 * of index.css — and a real element, unlike the body, honours
 * `overflow: hidden` on iOS. So freezing is one property on and off, the
 * scroll offset stays exactly where it was, and none of the old
 * pin-the-body-with-position:fixed dance survives. Restoring to '' hands the
 * pane back to its own `.app-scroll` rules.
 *
 * Still counted, because overlays overlap. Create an Account on the Share Live
 * Session sheet opens My Account while the sheet is still sliding out, so for
 * a moment two locks are held, and the sheet's is released first. Only the
 * first holder freezes and only the last one lets go, so the order they come
 * and go in does not matter.
 */

let holders = 0;

function freeze() {
  holders += 1;
  if (holders > 1) return;
  const pane = appScroller();
  if (pane) pane.style.overflow = 'hidden';
}

function release() {
  holders -= 1;
  if (holders > 0) return;
  const pane = appScroller();
  if (pane) pane.style.overflow = '';
}

export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    freeze();
    return release;
  }, [locked]);
}
