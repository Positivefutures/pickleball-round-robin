import { useEffect } from 'react';

/**
 * Freezes the page behind an overlay. `overflow: hidden` on the body is ignored
 * by iOS Safari, so the body is pinned with `position: fixed` at its current
 * offset instead — the page looks untouched but cannot move, and the exact
 * scroll position is restored on release.
 *
 * Counted, because overlays overlap. Create an Account on the Share Live Session
 * sheet opens My Account while the sheet is still sliding out, so for a moment
 * two locks are held; and the sheet's is released first. When each lock saved
 * and restored the body itself, the second read the offset of an already-pinned
 * body — zero — and the first release put those pinned values back as if they
 * were the page's own, leaving the app unscrollable on every tab with no lock
 * left to let it go. Only the first holder pins and only the last one releases,
 * so the order they come and go in stops mattering.
 */

let holders = 0;
let pinned: { position: string; top: string; left: string; right: string; width: string } | null =
  null;
let pinnedAt = 0;

function pin() {
  holders += 1;
  // Already frozen. Reading window.scrollY now would give 0, and pinning again
  // would move the page to the top under the overlay.
  if (holders > 1) return;

  const { body } = document;
  pinnedAt = window.scrollY;
  pinned = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
  };

  body.style.position = 'fixed';
  body.style.top = `-${pinnedAt}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
}

function release() {
  holders -= 1;
  // Something else still wants the page still. Leave it where it is.
  if (holders > 0 || !pinned) return;

  const { body } = document;
  body.style.position = pinned.position;
  body.style.top = pinned.top;
  body.style.left = pinned.left;
  body.style.right = pinned.right;
  body.style.width = pinned.width;
  pinned = null;
  window.scrollTo(0, pinnedAt);
}

export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    pin();
    return release;
  }, [locked]);
}
