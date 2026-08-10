/**
 * What the service worker does with each file in `public/`.
 *
 * Vite copies that folder verbatim and tells no plugin what is in it, so unlike
 * the scripts and stylesheets, which the build knows about, this has to be
 * written out by hand. `precache.test.ts` reads the real folder and fails if it
 * holds a file named in none of these lists. That is the point of splitting it
 * three ways rather than keeping one list of what to cache: adding an image
 * forces a decision instead of quietly leaving it unavailable offline.
 */

/**
 * Downloaded during install, before the app has ever been offline.
 *
 * Kept to the shell and the small icons, about 90 KB in total. Everything here
 * is either needed for the app to render at all or is small enough that its
 * cost is lost against the scripts.
 */
export const PRECACHED_PUBLIC = [
  '/site.webmanifest',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/favicon-48x48.png',
  '/apple-touch-icon.png',
  // Rendered as the settings drawer heading, and by both static pages below.
  '/icon-192.png',
  // Real documents with real addresses, linked from inside the app and from
  // Ko-fi. They cost 35 KB together and reading the terms offline is fair.
  '/privacy.html',
  '/terms.html',
];

/**
 * Cached the first time somebody looks at them, and not before.
 *
 * These are the panel illustrations, which come to about 320 KB. Most people
 * never open Donate, so precaching them would spend a phone's data at a court
 * on pictures it will not show.
 */
export const RUNTIME_CACHED_PUBLIC = [
  '/account-top.png',
  '/donate-cup.png',
  '/donate-separator.png',
  '/donate-top.png',
  '/share-top.png',
  '/share.png',
  // Named in the manifest and fetched by the operating system when the app is
  // added to a home screen, which only happens online. 252 KB, and the app
  // itself never renders it.
  '/icon-512.png',
  // Referenced by nothing today. Left here rather than deleted because the
  // decision it needs is whether the app still uses it, not whether it caches.
  '/logo.png',
];

/**
 * Never stored, at any point. Currently only the share banner, which exists for
 * scrapers rather than for people.
 *
 * Written out again here rather than imported from `sw.ts`, which owns the copy
 * the worker actually enforces. That file has to stay free of imports, because
 * the build transpiles it on its own without bundling, and this file is read by
 * `vite.config.ts` under a tsconfig with no DOM library. Importing either way
 * round drags one into the wrong project. `precache.test.ts` asserts the two
 * lists agree, which is the part that matters.
 */
export const NEVER_CACHED_PUBLIC = ['/og-banner.png'];
