/**
 * - `native` a browser install prompt is held and can be opened on demand
 * - `ios`    no API exists; show the Share → Add to Home Screen steps
 * - `manual` no prompt and not iOS; point at the browser's own menu
 */
export type InstallRoute = 'native' | 'ios' | 'manual';

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

export function installRoute(opts: {
  canPrompt: boolean;
  ua?: string;
  maxTouchPoints?: number;
}): InstallRoute {
  if (opts.canPrompt) return 'native';
  return isIos(opts.ua, opts.maxTouchPoints) ? 'ios' : 'manual';
}
