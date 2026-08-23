/**
 * What this dashboard is called, in one place.
 *
 * The main app has the same rule and its own copy in `src/lib/appInfo.ts`. This
 * is deliberately a second copy rather than an import: nothing under `admin/`
 * may reach into `src/`, because the two are separate Vercel projects built
 * from separate roots and an import across that line breaks the admin build.
 * See the note in CLAUDE.md.
 *
 * If the app is ever renamed again, both files change. Two places is the price
 * of the separation, and it is a smaller price than a shared module that only
 * one of the two builds can resolve.
 */

/** The heading on the sign-in page and along the top of every panel. */
export const ADMIN_NAME = 'RoundRobinator Admin';

/**
 * The robin badge, copied from the app's `public/logo.png` rather than linked.
 * A cross-project URL would make this page depend on the app being up, which
 * is precisely the thing this page exists to tell you about.
 */
export const LOGO_SRC = '/logo.png';
