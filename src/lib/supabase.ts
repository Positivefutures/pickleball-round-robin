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
        // The default. Worth naming, because it is why the emailed link only
        // works in the browser that asked for it: PKCE keeps a verifier in that
        // browser's storage, and the link carries a code that is useless
        // without it. The 6-digit code has no such tie, which is what makes it
        // the way in from a home-screen app.
        flowType: 'pkce',
        // The link comes back to "/" with ?code=... on it. Letting the client
        // consume that is the whole of the link flow.
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  );
  return client;
}

/**
 * Whether this page load looks like a return trip from the emailed link.
 *
 * Checked before anything is imported, so an ordinary visit never pays for the
 * client. A false positive costs one wasted import; a false negative would
 * leave someone staring at the app wondering whether they were signed in.
 */
export function hasAuthCallback(): boolean {
  if (typeof window === 'undefined') return false;
  const { hash, search } = window.location;
  const params = new URLSearchParams(search);
  return (
    params.has('code') ||
    params.has('error_description') ||
    hash.includes('access_token=') ||
    hash.includes('error=')
  );
}
