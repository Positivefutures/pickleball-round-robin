/**
 * Shown in the footer and attached to every bug report, so it must be bumped
 * with each deploy — a stale version sends you looking at the wrong code.
 *
 * Scheme: patch for small changes (1.20.1, 1.20.2 …), middle in steps of ten
 * for a batch of features (1.10 → 1.20 → 1.30).
 */
export const APP_VERSION = '1.20.3';

/**
 * Master switch for the accounts feature.
 *
 * Back on 2026-08-08 to carry on testing. It was briefly off after a sign-in
 * email arrived with no code in it; that turned out to be a Supabase email
 * template, not app code, so there was nothing here to fix.
 *
 * It is deliberately separate from isSupabaseConfigured(), which answers a
 * different question: whether the app *could* talk to a server. This one says
 * whether it should offer to. Set it to false to hide the feature outright.
 *
 * **This is the rollback if sign-in email breaks under load.** Supabase caps
 * the project at 30 emails an hour and Resend caps the day at 100, so a busy
 * enough hour leaves everyone staring at a code that never arrives. Setting
 * this to false and deploying hides Account entirely, which is honest: the app
 * has always worked without one, and nobody loses data by not signing in.
 */
export const ACCOUNTS_ENABLED = true;

/**
 * Public address of the app — what Share App sends.
 *
 * Not quite the one place to change: `index.html` writes this host out again in
 * its og:url and og:image, because share-preview scrapers need absolute URLs and
 * static HTML cannot import a constant. Change this and change those too.
 */
export const APP_URL = 'https://app.pbroundrobin.com/';

/** Where Suggest a Feature and Report a Bug are sent. */
export const FEEDBACK_EMAIL = 'jeff@pbroundrobin.com';

/**
 * The privacy policy, as a real address rather than a panel.
 *
 * It is a static file in `public/`, so it has a URL that Ko-fi, an app store
 * listing and a scraper can all be given, and it opens with no JavaScript. The
 * app has no router, so an in-app version could not have an address at all.
 *
 * The extension is deliberate: this deployment serves the filesystem and 404s
 * anything else, so `/privacy` is not the same thing as `/privacy.html`.
 */
export const PRIVACY_URL = '/privacy.html';

/**
 * The terms of service, alongside the policy and for the same reasons: a real
 * address, no JavaScript, and its own styles so the app's build cannot break it.
 *
 * The two pages travel together. Anywhere one is linked the other belongs beside
 * it, which is what src/lib/terms.test.ts checks.
 */
export const TERMS_URL = '/terms.html';

/**
 * Ko-fi page behind the Donate item. Blanking this hides Donate from the menu,
 * so there is never a dead button. Typed as string rather than the literal so
 * that check stays meaningful.
 */
export const DONATE_URL: string = 'https://ko-fi.com/pbroundrobin';
