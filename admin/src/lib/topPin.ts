/**
 * Lets the anti-blur strip step aside once the page has scrolled.
 *
 * `#top-pin` in index.html must be painted whenever iOS decides how to treat
 * the top of the screen, and that decision is made at launch. The main app's
 * blur lab painted for 1.5 seconds, went transparent, and stayed sharp through
 * backgrounding and hard reopens on a real iPhone, so the strip holds its paint
 * for that long no matter what. After that it fades whenever the page has left
 * the top, where an 8px teal bar over white panels reads as a defect, and comes
 * back when the page returns, where it is invisible against the header it
 * copies.
 *
 * **The floor is the invariant.** Everything else here is cosmetic; removing
 * `PAINT_FLOOR_MS` brings the blur back and does so only on a phone, only when
 * installed, and only if the page happens to be scrolled during launch. There
 * is no way to catch that in CI, which is why it is a constant with a test
 * rather than a number inside the condition.
 *
 * Simpler than the main app's version of this file, which has to find whichever
 * `[data-app-scroll]` pane is live. This page scrolls the document and nothing
 * else.
 */

/** How long the launch paint must outlive first paint. */
export const PAINT_FLOOR_MS = 1500;

/** Whether the strip should be transparent, given its age and the scroll. */
export function shouldGhost(ageMs: number, scrollTop: number): boolean {
  return ageMs > PAINT_FLOOR_MS && scrollTop > 1;
}

export function startTopPinGhost(): void {
  const pin = document.getElementById('top-pin');
  if (!pin) return;

  const born = Date.now();
  const look = () => {
    const top = document.scrollingElement?.scrollTop ?? 0;
    pin.classList.toggle('ghost', shouldGhost(Date.now() - born, top));
  };

  // Capture, because scroll events do not bubble.
  document.addEventListener('scroll', look, { capture: true, passive: true });
  // A scroll inside the floor would otherwise leave the strip painted over
  // content until the next scroll event. One late look settles it.
  setTimeout(look, PAINT_FLOOR_MS + 100);
}
