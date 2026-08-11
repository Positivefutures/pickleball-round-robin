/**
 * @vitest-environment happy-dom
 *
 * How a page load that came back from an emailed link is read, and what is left
 * on the address afterwards.
 *
 * The bug this exists for: a sign-in link only works in the browser that asked
 * for it, and on a phone the mail app hands it to a different one. That failure
 * used to be silent. The app reopened My Account, found nobody signed in, and
 * showed the same "enter your email" screen the person had just come from, so
 * they asked for another email and went round again. Nothing here signs anyone
 * in. What it does is make the failure say so, which is what ends the loop.
 *
 * Two things are load-bearing and neither is obvious. The answer is memoised,
 * because the Supabase client rewrites the address as soon as it has read it and
 * anything asking afterwards would conclude the visit was ordinary. And the
 * cleanup has to leave every other parameter alone, because a live session share
 * arrives on the query string too.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { clearAuthParams, hasAuthCallback, linkArrival, linkNotice, __testing } from './supabase';

/** A fresh page load at `url`, with nothing remembered from the last one. */
function arriveAt(url: string) {
  window.history.replaceState({}, '', url);
  __testing.reset();
}

beforeEach(() => {
  arriveAt('/');
});

// --------------------------------------------------------------------------

describe('reading the arrival', () => {
  it('calls an ordinary visit ordinary', () => {
    arriveAt('/');
    expect(linkArrival()).toEqual({ kind: 'none' });
    expect(hasAuthCallback()).toBe(false);
    expect(linkNotice()).toBeNull();
  });

  it('spots a code to spend', () => {
    arriveAt('/?code=abc123');
    expect(linkArrival()).toEqual({ kind: 'code' });
    expect(hasAuthCallback()).toBe(true);
  });

  // Told apart from every other refusal because the advice differs. An expired
  // link needs a new code; anything else needs the code from the email already
  // sitting in their inbox.
  it('tells an expired link apart from a refused one', () => {
    arriveAt('/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid');
    expect(linkArrival()).toEqual({ kind: 'expired' });

    arriveAt('/?error=server_error&error_description=Unexpected+failure');
    expect(linkArrival()).toEqual({ kind: 'error' });
  });

  // PKCE puts errors on the query string and the implicit flow puts them on the
  // fragment. Reading both means a flow change cannot turn this back into the
  // silent dead end it was.
  it('reads the fragment as well as the query string', () => {
    arriveAt('/#error=access_denied&error_code=otp_expired');
    expect(linkArrival()).toEqual({ kind: 'expired' });

    arriveAt('/#access_token=ey.some.token&type=magiclink');
    expect(linkArrival()).toEqual({ kind: 'code' });
  });

  it('is not fooled by a share link, which arrives on the query string too', () => {
    arriveAt('/?s=abcdef&k=012345');
    expect(linkArrival()).toEqual({ kind: 'none' });
    expect(hasAuthCallback()).toBe(false);
  });

  /**
   * The whole reason for the memo. detectSessionInUrl strips the code the
   * moment the client has read it, so a second reader gets a bare "/" and would
   * decide nothing had happened. Every caller has to see the page load the
   * first one saw.
   */
  it('remembers the arrival after the address is rewritten underneath it', () => {
    arriveAt('/?code=abc123');
    expect(linkArrival()).toEqual({ kind: 'code' });

    window.history.replaceState({}, '', '/');
    expect(linkArrival()).toEqual({ kind: 'code' });
    expect(hasAuthCallback()).toBe(true);
  });
});

describe('what it says on the way back', () => {
  it('offers a new code when the link had expired', () => {
    arriveAt('/?error=access_denied&error_code=otp_expired');
    expect(linkNotice()).toBe('That link has expired. Ask for a new code below.');
  });

  // The phone case, and the common one: the link was fine, this browser just
  // has no verifier for it.
  it('sends someone to the code when the link simply did not work here', () => {
    arriveAt('/?code=abc123');
    expect(linkNotice()).toBe('That link did not sign you in. Ask for a code below instead.');
  });

  it('says nothing at all on an ordinary visit', () => {
    arriveAt('/?s=abcdef');
    expect(linkNotice()).toBeNull();
  });
});

describe('clearing the address afterwards', () => {
  // A spent code replayed by a reload fails the second time, which would reopen
  // the panel to say the link did not work on a page where it did.
  it('takes the code back off', () => {
    arriveAt('/?code=abc123');
    clearAuthParams();
    expect(window.location.search).toBe('');
  });

  it('takes every part of a refusal off, not just the first', () => {
    arriveAt('/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid');
    clearAuthParams();
    expect(window.location.search).toBe('');
  });

  it('clears a token out of the fragment, where it would sit in the history', () => {
    arriveAt('/#access_token=ey.some.token&refresh_token=r1');
    clearAuthParams();
    expect(window.location.hash).toBe('');
  });

  /**
   * This runs on every arrival, including one carrying a session to watch. A
   * cleanup that took the share with it would drop the viewer out of the game
   * they were sent to.
   */
  it('leaves everything that is not ours exactly where it was', () => {
    arriveAt('/?s=abcdef&code=abc123&k=012345');
    clearAuthParams();

    const params = new URLSearchParams(window.location.search);
    expect(params.get('s')).toBe('abcdef');
    expect(params.get('k')).toBe('012345');
    expect(params.has('code')).toBe(false);
  });

  it('does not touch the address when there was nothing of ours on it', () => {
    arriveAt('/?s=abcdef#round-3');
    clearAuthParams();
    expect(window.location.search).toBe('?s=abcdef');
    expect(window.location.hash).toBe('#round-3');
  });
});
