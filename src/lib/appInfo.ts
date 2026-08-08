/**
 * Shown in the footer and attached to every bug report, so it must be bumped
 * with each deploy — a stale version sends you looking at the wrong code.
 *
 * Scheme: patch for small changes (1.20.1, 1.20.2 …), middle in steps of ten
 * for a batch of features (1.10 → 1.20 → 1.30).
 */
export const APP_VERSION = '1.60.5';

/**
 * Public address of the app — what Share App sends.
 *
 * Not quite the one place to change: `index.html` writes this host out again in
 * its og:url and og:image, because share-preview scrapers need absolute URLs and
 * static HTML cannot import a constant. Change this and change those too.
 */
export const APP_URL = 'https://app.pbroundrobin.com/';

/** Where Suggest a Feature and Report a Bug are sent. */
export const FEEDBACK_EMAIL = 'jeff@positivefutures.com';

/**
 * Ko-fi page behind the Donate item. Blanking this hides Donate from the menu,
 * so there is never a dead button. Typed as string rather than the literal so
 * that check stays meaningful.
 */
export const DONATE_URL: string = 'https://ko-fi.com/pbroundrobin';
