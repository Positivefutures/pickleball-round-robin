/** Shown in the footer and attached to feedback — bump it in one place. */
export const APP_VERSION = '1.10.0';

/** Public address of the app — what Share App sends, and the one place to
 *  change if a custom domain ever points here. */
export const APP_URL = 'https://pickleball-round-robin.vercel.app/';

/** Where Suggest a Feature and Report a Bug are sent. */
export const FEEDBACK_EMAIL = 'jeff@positivefutures.com';

/**
 * Ko-fi page behind the Donate item. Blanking this hides Donate from the menu,
 * so there is never a dead button. Typed as string rather than the literal so
 * that check stays meaningful.
 */
export const DONATE_URL: string = 'https://ko-fi.com/pbroundrobin';
