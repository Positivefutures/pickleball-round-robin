/**
 * Shown in the footer and attached to every bug report, so it must be bumped
 * with each deploy — a stale version sends you looking at the wrong code.
 *
 * Scheme: two numbers, no patch, moving one hundredth at a time. 3.20 → 3.21,
 * whether the deploy carries one fix or a page rebuilt from scratch. Jeff's
 * call on 2026-08-15, after 3.20 → 3.30 went out for an afternoon's work: the
 * number is a build counter, not a measure of how much shipped.
 *
 * The second digit is a milestone and moves only when he says so. Nothing
 * parses this string, so the shape is free to change.
 */
export const APP_VERSION = '3.38';

/**
 * The copyright line, at the foot of the app and of the settings drawer.
 *
 * One constant so the two cannot drift apart, and one that names a person
 * rather than a company because that is what the terms say the app is: made and
 * run by Jeff Baker, in Alberta, one person and not a company.
 *
 * The year is written down rather than read off the clock. `getFullYear()`
 * would be a notice that changes on a device whose date is wrong, and this app
 * is installed and cached for months at a time. Bump it in January.
 */
export const COPYRIGHT = '© 2026 Jeff Baker. All rights reserved.';

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
