/**
 * The pane the app scrolls in, and the only way code should reach it.
 *
 * The document itself never scrolls in this app: index.css holds <html>, <body>
 * and #root to the viewport, and everything from the banner to the footer lives
 * inside one `[data-app-scroll]` pane that scrolls instead. That architecture
 * exists for iOS 26, which paints its scroll edge effect — a blur of the page's
 * own top rows, drawn up under the clock — over any installed web app whose
 * *document* can scroll. It keys off the root scroller alone: with the root
 * held still the effect never engages, which this app proved by screenshot when
 * the tutorial's scroll lock left the banner sharp to the byte. An inner pane
 * can scroll all it likes; the system is not watching it.
 *
 * So the banner sits on the first row of the screen with nothing blurred and
 * nothing spent, where the previous defence — a blank cream band above the
 * artwork, tall enough to soak up the whole effect — cost forty pixels of every
 * home screen. See git history for that band if the effect ever needs feeding
 * again.
 *
 * Everything that used to call window.scrollTo / scrollBy / scrollY goes
 * through here now. The helpers tolerate two absences on purpose: a missing
 * pane (a dialog mounted alone in a test) is a no-op, and a pane whose element
 * lacks the scroll methods (jsdom, happy-dom) falls back to setting scrollTop,
 * so tests exercise the same code path the browser runs.
 */

export function appScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-app-scroll]');
}

/** How far down the pane is — what window.scrollY used to answer. */
export function appScrollY(): number {
  return appScroller()?.scrollTop ?? 0;
}

export function appScrollTo(options: ScrollToOptions): void {
  const pane = appScroller();
  if (!pane) return;
  if (typeof pane.scrollTo === 'function') pane.scrollTo(options);
  else if (options.top !== undefined) pane.scrollTop = options.top;
}

export function appScrollBy(top: number): void {
  const pane = appScroller();
  if (!pane) return;
  if (typeof pane.scrollBy === 'function') pane.scrollBy({ top, behavior: 'auto' });
  else pane.scrollTop += top;
}
