import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The Supabase client, loaded only when something actually needs it.
 *
 * Two things are deliberate here.
 *
 * With no env vars the app is exactly what it was before accounts existed: no
 * client is built, the Account item is hidden, and nothing reaches the network.
 * That is the tested state, not a broken one, and it is what keeps the test
 * suite honest — the tests have no env vars, so they exercise the same path an
 * unconfigured build does.
 *
 * The import is dynamic because @supabase/supabase-js is a large chunk next to
 * the rest of this app, and someone opening the schedule at a court should not
 * pay for it. A type-only import of SupabaseClient costs nothing at runtime.
 */

// Read per call rather than into module constants. Vite still substitutes these
// literally at build time, so production is unchanged, but a test can stub the
// environment and exercise both the configured and unconfigured paths.
const url = () => import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = () => import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(url() && anonKey());
}

let client: Promise<SupabaseClient> | null = null;

export function getSupabase(): Promise<SupabaseClient> {
  if (!isSupabaseConfigured()) {
    return Promise.reject(new Error('Supabase is not configured'));
  }
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url()!, anonKey()!, {
      auth: {
        // The default, and it stays. PKCE keeps a verifier in the asking
        // browser's storage, which is exactly why the sign-in email carries no
        // link any more: a link is useless in any other browser, and on a phone
        // the mail app hands it to one. See docs/email-templates/README.md.
        // The 6-digit code has no tie to a browser, so it is the only way in.
        flowType: 'pkce',
        // Nothing we send lands here now, but a link emailed before the
        // template changed still can, and so can an email-change confirmation.
        // Letting the client consume those is free; linkArrival below is what
        // makes the failures speak.
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  );
  return client;
}

/**
 * Whether this browser already holds a Supabase session.
 *
 * Cheap, synchronous, and answered without loading the client — which is the
 * point. Sync has to know on boot whether anyone is signed in, and asking the
 * SDK would mean every visitor downloading it. Someone who has never signed in
 * still makes no network request at all, exactly as before accounts existed.
 *
 * The key is whatever the SDK chose to store under; matching its shape rather
 * than rebuilding its name means a false negative at worst, which costs a
 * deferred sync rather than a wrong answer.
 */
export function hasStoredSession(): boolean {
  try {
    const storage = window.localStorage;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith('sb-') && key.endsWith('-auth-token')) return true;
    }
  } catch {
    // Private-mode Safari, or no window at all.
  }
  return false;
}

/** What this page load looks like, if it looks like a return trip from a link. */
export type LinkArrival =
  /** An ordinary visit. */
  | { kind: 'none' }
  /** A code to spend, which needs a verifier this browser may not hold. */
  | { kind: 'code' }
  /** The link was real once. */
  | { kind: 'expired' }
  /** Anything else the server refused. */
  | { kind: 'error' };

function readArrival(): LinkArrival {
  if (typeof window === 'undefined') return { kind: 'none' };
  const { hash, search } = window.location;
  // Errors come back on the query string under PKCE and on the fragment under
  // the implicit flow. Reading both costs nothing and means a flow change
  // cannot quietly turn this into a dead end again.
  const params = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const code = params.get('error_code') ?? fragment.get('error_code') ?? '';

  if (params.has('error') || params.has('error_description') || fragment.has('error')) {
    return { kind: code.includes('expired') ? 'expired' : 'error' };
  }
  if (params.has('code') || hash.includes('access_token=')) return { kind: 'code' };
  return { kind: 'none' };
}

let arrival: LinkArrival | null = null;

/**
 * How this page load began, answered once and then remembered.
 *
 * Memoised because the answer has a short life: `detectSessionInUrl` rewrites
 * the address as soon as the client has read it, so anything asking later would
 * get 'none' and conclude nothing happened. First call wins, and every caller
 * after it sees the same page load the first one did.
 *
 * Read before anything is imported, so an ordinary visit never pays for the
 * client.
 */
export function linkArrival(): LinkArrival {
  arrival ??= readArrival();
  return arrival;
}

/**
 * Whether this page load looks like a return trip from an emailed link.
 *
 * A false positive costs one wasted import; a false negative would leave
 * someone staring at the app wondering whether they were signed in.
 */
export function hasAuthCallback(): boolean {
  return linkArrival().kind !== 'none';
}

/**
 * What to tell somebody a link has just dumped back on the sign-in screen.
 *
 * Null on an ordinary visit, so the panel opened from the menu says nothing
 * extra. Null is also the answer for a link that worked, by a route that cannot
 * go wrong: this is only ever rendered on the signed-out panel, and a link that
 * worked ends up on the signed-in one.
 */
export function linkNotice(): string | null {
  switch (linkArrival().kind) {
    case 'expired':
      return 'That link has expired. Ask for a new code below.';
    case 'code':
    case 'error':
      return 'That link did not sign you in. Ask for a code below instead.';
    default:
      return null;
  }
}

/**
 * Takes the auth parameters back off the address, once they have been read.
 *
 * Two reasons, and the second is the one that bites. A spent code left on the
 * URL is replayed by any reload, which fails the second time and reopens the
 * panel saying the link did not work — on a page where it did. And a token in
 * the address bar is a token in the history, on a screen someone may well be
 * holding up at a court.
 *
 * Everything not ours is left exactly where it was: this runs on every arrival,
 * including ones carrying a live session share.
 */
export function clearAuthParams(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const names = ['code', 'error', 'error_code', 'error_description'];

  let touched = false;
  for (const name of names) {
    if (url.searchParams.has(name)) {
      url.searchParams.delete(name);
      touched = true;
    }
  }

  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  if (names.some((name) => fragment.has(name)) || fragment.has('access_token')) {
    url.hash = '';
    touched = true;
  }

  // replaceState rather than pushState: the arrival is not a place anyone
  // should be able to press Back into.
  if (touched) window.history.replaceState(null, '', url.toString());
}

/** Exported for the tests. Nothing else may reach past the memo. */
export const __testing = {
  reset() {
    arrival = null;
  }
};
