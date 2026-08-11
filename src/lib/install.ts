/**
 * - `native`    a browser install prompt is held and can be opened on demand
 * - `ios`       Safari on iOS: no API exists, so show the Share steps
 * - `ios-other` Chrome, Firefox or Edge on iOS: same lack of an API, but the
 *               item is in the browser's own menu rather than Safari's share sheet
 * - `manual`    no prompt and not iOS; point at the browser's own menu
 */
export type InstallRoute = 'native' | 'ios' | 'ios-other' | 'manual';

/** Already launched from a home-screen icon, so there is nothing to install. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // Safari's own flag, still the only signal on older iOS
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * iPadOS 13+ reports a Macintosh user agent, so the UA alone would send every
 * iPad user down the desktop path and every Mac user down the iPad one. Touch
 * points are the tell: a Mac reports 0, an iPad reports 5.
 */
export function isIos(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  maxTouchPoints: number = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0
): boolean {
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
}

/**
 * Every iOS browser is WebKit underneath, so none of them get an install API.
 * They differ in where the button lives, and that is the whole reason to tell
 * them apart: Safari keeps Add to Home Screen on the system share sheet, while
 * Chrome, Firefox and Edge each keep their own copy inside their own menu.
 * Sending one to the other's instructions is worse than saying nothing.
 *
 * These browsers announce themselves by appending to Safari's UA, so the test
 * is for their marks rather than for Safari's name. DuckDuckGo's iOS browser
 * leaves no mark at all and reads as Safari here, which is a near miss rather
 * than a wrong instruction: its own menu carries the share sheet this points at.
 */
export function isIosSafari(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  maxTouchPoints: number = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0
): boolean {
  if (!isIos(ua, maxTouchPoints)) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(ua);
}

export function installRoute(opts: {
  canPrompt: boolean;
  ua?: string;
  maxTouchPoints?: number;
}): InstallRoute {
  if (opts.canPrompt) return 'native';
  if (!isIos(opts.ua, opts.maxTouchPoints)) return 'manual';
  return isIosSafari(opts.ua, opts.maxTouchPoints) ? 'ios' : 'ios-other';
}
