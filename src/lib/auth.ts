import { getSupabase, isSupabaseConfigured } from './supabase';

/**
 * Sign-in, and the state of it.
 *
 * Passwordless only. Nothing here calls a password API, so there is no password
 * to leak, reset or reuse. Asking to sign in sends one email carrying both a
 * link and a code, and either one gets you in:
 *
 * - The **link** is one tap, and works in the browser that asked for it.
 * - The **code** works anywhere, which is the point of it. A link tapped in iOS
 *   Mail opens Safari, and Safari does not share storage with an app launched
 *   from the home screen, so an installed user who follows the link is signed
 *   in somewhere they were not looking. Typing the code never leaves the app.
 *
 * This module holds no user data and syncs nothing. Signing in and out changes
 * what the Account panel shows and nothing else.
 */

export type AuthState =
  /** Nobody has looked yet. */
  | { status: 'unknown' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; email: string | null; userId: string }
  /** Configured, but the client could not be reached or loaded. */
  | { status: 'unavailable' };

/** Every operation reports back in this shape, with copy fit to show a user. */
export type AuthResult = { ok: true } | { ok: false; message: string };

// ---------------------------------------------------------------------------

let state: AuthState = { status: 'unknown' };
const listeners = new Set<() => void>();

function setState(next: AuthState) {
  state = next;
  for (const listener of listeners) listener();
}

/**
 * Subscribable in the shape useSyncExternalStore wants, so the panel follows
 * along when the SDK signs someone in from the URL rather than from a click.
 */
export const authStore = {
  get: (): AuthState => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

// ---------------------------------------------------------------------------

/**
 * Supabase's errors are written for developers. These are the ones a host can
 * actually hit, in words that say what to do next. Anything unrecognised falls
 * through to a plain apology rather than leaking an internal string.
 *
 * `action` changes one answer only. Sending is capped per project rather than
 * per person, so a rate limit there is usually nothing the user did and the
 * advice has to differ from a rate limit anywhere else.
 */
function friendlyError(error: unknown, action: 'send' | 'other' = 'other'): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');

  // Supabase's AuthError carries a code and an HTTP status alongside the
  // message. Folding those into what is matched means detection survives a
  // reworded message, which matching English prose on its own does not.
  //
  // Underscores become spaces on the way in, so that over_email_send_rate_limit
  // meets the same "rate limit" test the prose does. Without that the code, the
  // more reliable of the two signals, is the one that slips past.
  let tags = '';
  if (typeof error === 'object' && error !== null) {
    const { code, status } = error as { code?: unknown; status?: unknown };
    if (typeof code === 'string') tags += ` ${code.replace(/_/g, ' ')}`;
    if (typeof status === 'number') tags += ` ${status}`;
  }
  const text = `${raw}${tags}`.toLowerCase();

  if (text.includes('token has expired') || text.includes('expired')) {
    return 'That code has expired. Ask for a new one.';
  }
  if (text.includes('invalid') && (text.includes('token') || text.includes('otp'))) {
    return "That code didn't match. Check it and try again.";
  }

  // The per-address cooldown, and the one rate limit that names its own wait.
  // Supabase says "you can only request this after 41 seconds", so there is a
  // real number to repeat rather than rounding it off to "a minute".
  const wait = /after (\d+) seconds?/i.exec(raw);
  if (wait) {
    return `A code was just sent. Ask for another in ${wait[1]} seconds.`;
  }

  if (text.includes('rate limit') || text.includes('too many') || text.includes('429')) {
    // Sending is capped across the whole project, at 30 emails an hour, and
    // Resend caps the day at 100 on top of that. Someone who meets either
    // ceiling did nothing wrong and cannot wait it out in a minute. Saying so
    // is only half the job: the app needs no account, so the useful thing is
    // to point them back at it rather than leave them at a dead end.
    if (action === 'send') {
      return 'We cannot send sign-in emails just now. Try again later, or keep using the app without an account.';
    }
    return 'Too many tries just now. Wait a minute, then ask again.';
  }
  if (text.includes('email') && text.includes('invalid')) {
    return "That doesn't look like an email address.";
  }
  if (text.includes('already') && text.includes('registered')) {
    return 'That address is already in use on another account.';
  }
  if (
    text.includes('failed to fetch') ||
    text.includes('network') ||
    text.includes('load failed')
  ) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return 'Something went wrong. Try again in a moment.';
}

interface SessionLike {
  user: { id: string; email?: string | null };
}

function fromSession(session: SessionLike | null): AuthState {
  if (!session) return { status: 'signed-out' };
  return {
    status: 'signed-in',
    email: session.user.email ?? null,
    userId: session.user.id,
  };
}

// ---------------------------------------------------------------------------

let started: Promise<void> | null = null;

/**
 * Loads the client, reads any existing session, and follows it from then on.
 * Idempotent and safe to call from several places: the panel opening, and a
 * page load that looks like a return trip from the emailed link.
 */
export function initAuth(): Promise<void> {
  if (!isSupabaseConfigured()) {
    setState({ status: 'signed-out' });
    return Promise.resolve();
  }
  started ??= (async () => {
    try {
      const supabase = await getSupabase();
      // getSession resolves after the client has consumed any code in the URL,
      // so a link arrival lands here already signed in.
      const { data } = await supabase.auth.getSession();
      setState(fromSession(data.session));
      supabase.auth.onAuthStateChange((_event, session) => {
        setState(fromSession(session));
      });
    } catch {
      // Offline, or the chunk failed to load. Deliberately not 'signed-out':
      // claiming someone is signed out when we could not look would be a lie,
      // and the panel has something truer to say.
      setState({ status: 'unavailable' });
      started = null;
    }
  })();
  return started;
}

/** Sends the email carrying both the link and the code. */
export async function sendSignInEmail(email: string): Promise<AuthResult> {
  const address = email.trim();
  if (!address) return { ok: false, message: 'Enter your email address first.' };

  try {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        // The origin rather than the production URL, so this works from a dev
        // server too. Both are on the Supabase redirect allow list.
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    if (error) return { ok: false, message: friendlyError(error, 'send') };
    return { ok: true };
  } catch (error) {
    return { ok: false, message: friendlyError(error, 'send') };
  }
}

/**
 * Redeems the code from the email. Unlike the link this needs nothing stored in
 * the browser beforehand, which is why it works in an installed app.
 */
export async function verifyCode(email: string, code: string): Promise<AuthResult> {
  const token = code.replace(/\D/g, '');
  if (!token) return { ok: false, message: 'Enter the code from your email.' };

  try {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: 'email',
    });
    if (error) return { ok: false, message: friendlyError(error) };
    return { ok: true };
  } catch (error) {
    return { ok: false, message: friendlyError(error) };
  }
}

/**
 * Signs out without touching stored groups or players. The app carries on
 * exactly as it does for someone who never signed in, which is also what makes
 * this safe to offer: nothing is lost by tapping it.
 */
export async function signOut(): Promise<AuthResult> {
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signOut();
    if (error) return { ok: false, message: friendlyError(error) };
    return { ok: true };
  } catch (error) {
    return { ok: false, message: friendlyError(error) };
  }
}

/**
 * Starts an email change. Supabase is set to confirm on both the old and the
 * new address, so nothing moves until both are clicked. The panel says so,
 * because a change that looks done but is not is worse than a slow one.
 */
export async function changeEmail(next: string): Promise<AuthResult> {
  const address = next.trim();
  if (!address) return { ok: false, message: 'Enter the new email address.' };

  try {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.updateUser({ email: address });
    // 'send' as well: a change goes out as two confirmation emails, so it meets
    // the same ceiling as signing in does.
    if (error) return { ok: false, message: friendlyError(error, 'send') };
    return { ok: true };
  } catch (error) {
    return { ok: false, message: friendlyError(error, 'send') };
  }
}

/** Exported for the tests; the mapping is the part worth pinning down. */
export const __testing = { friendlyError, fromSession };
