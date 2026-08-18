/**
 * Lets the anti-blur strip step aside once the app has scrolled.
 *
 * #top-pin (index.html) must be painted whenever iOS decides how to treat the
 * top of the screen, and the decision is made at launch: mode J of
 * public/blurtest.html painted for 1.5 seconds, went transparent, and stayed
 * sharp through backgrounding and hard reopens on a real iPhone. So the strip
 * holds its paint for that long no matter what, and after that it fades out
 * whenever the pane has left the top — where its sliver of banner over
 * foreign content read as a defect — and returns when the pane comes home,
 * where it is invisible against the banner it copies.
 *
 * The scroll listener rides the document in the capture phase because scroll
 * events do not bubble, and because which element scrolls varies: the app and
 * the live view each bring their own [data-app-scroll] pane, and anything
 * else (a list inside a dialog) should leave the strip alone, which reading
 * the pane's own scrollTop does on its own.
 */
import { appScroller } from './appScroll';

/** Mode J's window: how long the launch paint must outlive first paint. */
const PAINT_FLOOR_MS = 1500;

export function startTopPinGhost(): void {
  const pin = document.getElementById('top-pin');
  if (!pin) return;

  const born = Date.now();
  const look = () => {
    const pane = appScroller();
    const top = pane ? pane.scrollTop : (document.scrollingElement?.scrollTop ?? 0);
    pin.classList.toggle('ghost', Date.now() - born > PAINT_FLOOR_MS && top > 1);
  };

  document.addEventListener('scroll', look, { capture: true, passive: true });
  // A scroll that happened inside the floor would otherwise leave the strip
  // painted over content until the next scroll event. One late look settles it.
  setTimeout(look, PAINT_FLOOR_MS + 100);
}
