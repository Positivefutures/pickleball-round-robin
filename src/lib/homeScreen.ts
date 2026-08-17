/**
 * Whether this is the app running from an iPhone or iPad home screen.
 *
 * It exists for one reason: iOS 26 draws its scroll edge effect over the top of
 * a home screen web app, and nothing else does. See Header.tsx for what that
 * costs and `.top-band` in index.css for what is done about it. The band is
 * forty pixels of blank cream, so it is worth spending only where the blur is,
 * and this is the narrowest honest way to ask.
 *
 * `navigator.standalone` is the answer where it exists. It is not standard and
 * never was, but it is Apple's own, it has been there since 2008, and no other
 * engine implements it — so `=== true` is already "iOS, installed" in one read,
 * with no user agent sniffing at all.
 *
 * The fallback is for the release that finally removes it: the standard
 * display-mode query says installed, and the user agent says which OS. iPadOS
 * reports itself as a Mac and is caught by the touch points, which no real Mac
 * has more than one of.
 */
export function isHomeScreenApp(nav: Navigator = navigator): boolean {
  if ((nav as Navigator & { standalone?: unknown }).standalone === true) return true;

  const installed = window.matchMedia?.('(display-mode: standalone)').matches === true;
  if (!installed) return false;

  return (
    /iP(hone|ad|od)/.test(nav.userAgent) ||
    (/Mac/.test(nav.userAgent) && nav.maxTouchPoints > 1)
  );
}

/**
 * Puts the answer on the document, where the stylesheet can read it.
 *
 * An attribute rather than a class so nothing in the app can clear it by
 * rewriting className on <html>, and so it reads as a fact about the device
 * rather than a style somebody chose.
 */
export function markHomeScreenApp(root: HTMLElement = document.documentElement): void {
  if (isHomeScreenApp()) root.setAttribute('data-home-screen', 'true');
}
