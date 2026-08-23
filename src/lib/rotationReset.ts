/**
 * Puts the document back at the top after the phone is turned.
 *
 * The document never scrolls in this app — html and body are `overflow: hidden`
 * and everything moves inside the `[data-app-scroll]` pane; see the scroll
 * architecture at the top of index.css. iOS does not treat that as a promise.
 * Rotate an installed app to landscape and back and the page is left taller
 * than the window it is shown in, and iOS scrolls the document down to make up
 * the difference. Nothing scrolls it back: `overflow: hidden` means there is no
 * gesture that reaches it. The app is simply stuck with its banner off the top
 * of the screen. Jeff's report on 2026-08-23, from every tab.
 *
 * The height rule in index.css is what stops the page outgrowing the window in
 * the first place. This is the belt to that pair of braces, because the failure
 * it guards against is one the user cannot get out of: a stuck page is a
 * relaunch, and the cost of being wrong here is one scroll position nobody
 * asked to keep.
 *
 * Only on a turn, never on a resize. iOS scrolls the document on purpose when
 * the keyboard comes up, to bring a focused field into view, and undoing that
 * would put the field back under the keyboard. A keyboard changes the height
 * and never the width, so watching the width alone tells the two apart without
 * having to ask what is focused.
 *
 * Twice, because iOS settles the new viewport after it has told us about it.
 * The immediate pass covers the ordinary case and the late one covers the
 * frame where the numbers were still moving; both are cheap, and setting a
 * scroll offset that is already zero does nothing at all.
 */

/** How long iOS is given to finish rearranging before the second look. */
const SETTLE_MS = 350;

function toTop(): void {
  const root = document.scrollingElement;
  if (root && root.scrollTop !== 0) root.scrollTop = 0;
}

/**
 * Starts watching, and hands back the way to stop.
 *
 * The app calls this once and never stops it — there is no moment in the life
 * of the page when a turned phone stops mattering. The disposer is for the
 * tests, which would otherwise leave one run's listener holding one run's idea
 * of how wide the window is and answering the next run's turns with it.
 */
export function startRotationReset(): () => void {
  let width = window.innerWidth;

  function onResize() {
    if (window.innerWidth === width) return;
    width = window.innerWidth;
    toTop();
    setTimeout(toTop, SETTLE_MS);
  }

  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}
