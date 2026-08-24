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
 * The dashboard's own robin: the app's bird in a collar and tie, with a
 * calculator under its wing. It is a separate drawing rather than the app's
 * `public/logo.png`, so a tab, a header and a sign-in page all say which of
 * the two sites you are looking at.
 *
 * Local rather than a cross-project URL. Pulling it from the app would make
 * this page depend on the app being up, which is precisely the thing this page
 * exists to tell you about.
 *
 * `index.html` names the same file again for the favicon. Static HTML cannot
 * import, so that copy is unavoidable.
 */
export const LOGO_SRC = '/robin-admin.png';
