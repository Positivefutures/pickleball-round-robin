/**
 * What the service worker is allowed to answer.
 *
 * Almost every rule in `route()` is a rule about what must *not* be cached, and
 * those are the ones worth testing, because each has a failure that looks like
 * nothing at all from the outside.
 *
 * A cached Supabase read serves a roster from last week and calls it synced. A
 * cached analytics beacon is counted once and then silently never again, so the
 * numbers do not fall to zero, they just stop moving. A cached POST is worse
 * than either: it is a change to somebody's account replayed out of storage.
 *
 * The other half is the share banner, which is 957 KB and only ever fetched by
 * a scraper on somebody else's server. Nothing on a phone would ever show it,
 * so caching it would be the single largest thing here, for no one.
 */

import { describe, expect, it } from 'vitest';
import { route, isStale, cacheKey, NEVER_CACHE, CACHE_PREFIX } from './sw';

const ORIGIN = 'https://app.roundrobinator.com';

/** A realistic list, including one hashed script and both static pages. */
const PRECACHE = [
  '/index.html',
  '/assets/index-B4pwFpNh.js',
  '/assets/index-DXD46Kb4.css',
  '/icon-192.png',
  '/privacy.html',
  '/terms.html',
];

const ask = (url: string, method = 'GET') =>
  route({ url, method, origin: ORIGIN, precache: PRECACHE });

describe('what the worker refuses to touch', () => {
  it('never answers a call to Supabase', () => {
    expect(ask('https://abcdefg.supabase.co/rest/v1/players?select=*')).toBe('pass');
    expect(ask('https://abcdefg.supabase.co/auth/v1/otp', 'POST')).toBe('pass');
    // The one that does the work. The two above are refused by the last line of
    // route() as much as by the origin check, so on their own they would still
    // pass with that check deleted. Storage serves ordinary image addresses
    // from another host, and those are exactly what the image rule would take.
    expect(ask('https://abcdefg.supabase.co/storage/v1/object/public/avatars/ava.png')).toBe(
      'pass'
    );
  });

  it('never answers a crash report on its way to Sentry', () => {
    expect(ask('https://o123.ingest.sentry.io/api/456/envelope/', 'POST')).toBe('pass');
  });

  it('never answers anything Vercel serves, whatever it looks like', () => {
    // The trap in the whole file. This is our own origin, so the rule above
    // misses it, and a cached page view would be counted once and then quietly
    // never again. The numbers would not fall to zero, they would stop moving.
    expect(ask(`${ORIGIN}/_vercel/insights/view`, 'POST')).toBe('pass');
    expect(ask(`${ORIGIN}/_vercel/insights/script.js`)).toBe('pass');
    // That whole path belongs to the platform rather than to this app, so a
    // file under it is passed through on the strength of where it lives and not
    // what it is called. Without that, an image address there would be cached.
    expect(ask(`${ORIGIN}/_vercel/insights/pixel.png`)).toBe('pass');
  });

  it('never replays anything but a GET, whatever the address', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
      expect(ask(`${ORIGIN}/index.html`, method)).toBe('pass');
    }
  });

  it('refuses to store the share banner, which no user ever sees', () => {
    expect(ask(`${ORIGIN}/og-banner.png`)).toBe('pass');
    // And the reason it is refused is the list, not an accident of the name.
    expect(NEVER_CACHE.has('/og-banner.png')).toBe(true);
  });

  it('leaves an unknown address alone, so a typo stays a 404', () => {
    // No fallback to the app on purpose. One would turn every mistyped address
    // into a copy of the app that says nothing is wrong.
    expect(ask(`${ORIGIN}/schedule`)).toBe('pass');
    expect(ask(`${ORIGIN}/privacy`)).toBe('pass');
  });

  it('leaves a request it cannot even parse alone', () => {
    expect(ask('not a url at all')).toBe('pass');
  });
});

describe('what the worker serves offline', () => {
  it('serves the app under either of its two addresses', () => {
    expect(ask(`${ORIGIN}/`)).toBe('shell');
    expect(ask(`${ORIGIN}/index.html`)).toBe('shell');
  });

  it('keeps serving the app when the address carries a query', () => {
    // ?crashtest is read by the app itself, so it must not miss the cache.
    expect(ask(`${ORIGIN}/?crashtest`)).toBe('shell');
  });

  it('serves the static pages under their own addresses, not the app', () => {
    expect(ask(`${ORIGIN}/privacy.html`)).toBe('shell');
    expect(ask(`${ORIGIN}/terms.html`)).toBe('shell');
  });

  it('serves the scripts and styles this build was made with', () => {
    expect(ask(`${ORIGIN}/assets/index-B4pwFpNh.js`)).toBe('shell');
    expect(ask(`${ORIGIN}/assets/index-DXD46Kb4.css`)).toBe('shell');
  });

  it('stores a panel illustration the first time it is shown', () => {
    expect(ask(`${ORIGIN}/donate-top.png`)).toBe('image');
    expect(ask(`${ORIGIN}/account-top.png`)).toBe('image');
  });

  it('stores an alarm tone the first time it is played', () => {
    // Picking a tone plays it, so this is the one fetch it ever gets. Miss it
    // and the alarm is fine at home and silent at a court with no signal.
    expect(ask(`${ORIGIN}/alarms/police-whistle.mp3`)).toBe('image');
    expect(ask(`${ORIGIN}/alarms/marimba-ringtone.mp3`)).toBe('image');
  });

  it('treats a bare slash and index.html as one entry', () => {
    // Without this the cache stores the app under one address and is asked for
    // it under the other, which is a miss, which offline is a blank page.
    expect(cacheKey('/')).toBe('/index.html');
    expect(cacheKey('/privacy.html')).toBe('/privacy.html');
  });
});

describe('clearing out old builds', () => {
  const current = 'pbrr-2e63e7761051';

  it('deletes an earlier build of this app', () => {
    expect(isStale('pbrr-0000aaaa1111', current)).toBe(true);
  });

  it('keeps the one this build is using', () => {
    expect(isStale(current, current)).toBe(false);
  });

  it('never touches a cache belonging to anything else', () => {
    // Shared origin. Deleting by anything looser than the prefix would take
    // out storage this app did not create and cannot put back.
    expect(isStale('workbox-precache-v2', current)).toBe(false);
    expect(isStale('some-other-app', current)).toBe(false);
    expect(CACHE_PREFIX).toBe('pbrr-');
  });
});
