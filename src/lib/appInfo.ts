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
export const APP_VERSION = '3.92';

/**
 * The commit this build was made from, written in by vite.config.ts.
 *
 * It sits beside `APP_VERSION` in the settings drawer and answers the question
 * that one cannot: two phones both saying 3.63 are either the same build or a
 * deploy that forgot to bump, and there is no way to tell them apart. This is
 * derived from the build rather than typed, so it is always the truth.
 *
 * Undeclared rather than imported, and read through `typeof`, so that a test
 * importing this file — where the build never ran and nothing was replaced —
 * gets the fallback instead of a ReferenceError. Same bargain sw.ts strikes
 * with its injected precache list.
 */
declare const __BUILD_ID__: string | undefined;
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

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
 * Master switch for Suggest a Feature and Report a Bug.
 *
 * Off since 2026-08-23, and the reason is not in the app. 3.80 moved the
 * sending address to feedback@roundrobinator.com, and the Resend key is not
 * allowed to send from that domain, so Resend answers 403 and the panel tells
 * everyone their report did not send. A door that always fails is worse than
 * no door, and the only other way to reach Jeff is the address at the foot of
 * the menu, which stays.
 *
 * Nothing here is broken and nothing was ripped out. The panel, its tests and
 * the endpoint are all still in place, so this is one word to turn back on.
 *
 * **Two things have to be true before it goes back to true.** The key has to
 * be allowed to send from whatever domain `api/feedback.ts` names as `from`,
 * and mail to FEEDBACK_EMAIL has to actually reach a mailbox. Getting the
 * first right and not the second turns a visible failure into reports that
 * quietly vanish, which is the worse of the two.
 */
export const FEEDBACK_ENABLED = false;

/**
 * Public address of the app — what Share App sends.
 *
 * Not quite the one place to change: `index.html` writes this host out again in
 * its og:url and og:image, because share-preview scrapers need absolute URLs and
 * static HTML cannot import a constant. Change this and change those too.
 * `appDomain.test.ts` holds the two together.
 *
 * Moved here from `app.pbroundrobin.com` on 2026-08-23, with the rename. That
 * host is banned from this source and must stay alive on the internet forever:
 * printed QR codes carry it, and every install made before the move keeps its
 * rosters in that origin's storage. Retiring it would erase them.
 */
export const APP_URL = 'https://app.roundrobinator.com/';

/** Where Suggest a Feature and Report a Bug are sent. */
export const FEEDBACK_EMAIL = 'jeff@roundrobinator.com';

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
export const DONATE_URL: string = 'https://ko-fi.com/roundrobinator';

/**
 * The app's name, and the line that says what it is.
 *
 * Two strings rather than one because the banner draws them as two lines in two
 * colours and two sizes: the coined name in orange over the plain words in
 * black. `AppWordmark` is the only thing that should be laying them out; every
 * other caller wants one of the two, or `APP_FULL_NAME`.
 *
 * Renamed from "Pickleball Round Robin Generator" on 2026-08-22. The old name
 * was three other apps' names in a row and could never be searched for or
 * owned; the reasoning is section 13 of PRODUCT-CONTEXT.md.
 */
export const APP_NAME = 'RoundRobinator';
export const APP_SUBTITLE = 'Round Robin Generator';

/**
 * The sport, drawn above the name in the banner.
 *
 * Not part of the name and not in `APP_FULL_NAME`: the app was deliberately
 * renamed off "Pickleball" so it could be owned and searched for, and the word
 * is here as the one thing a stranger needs to know at a glance from across a
 * court. It belongs to the drawn mark only, which is why `AppWordmark` is the
 * only thing that reads it and why the watchers' page leaves it off.
 *
 * Uppercase in the constant rather than in a class, so grep for the word that
 * is actually on the screen finds it.
 */
export const APP_SPORT = 'PICKLEBALL';

/**
 * Both at once, for the places that get one string and no styling: the browser
 * tab, the share sheet's subject, the manifest, the static legal pages.
 *
 * A colon and not a dash. The name alone would tell a search engine and a
 * stranger nothing, and the words alone are what every competitor is called.
 */
export const APP_FULL_NAME = `${APP_NAME}: ${APP_SUBTITLE}`;
