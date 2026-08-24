/**
 * Telling a refused token apart from a refused request.
 *
 * Written after the dashboard showed "JWT issued at future" to the one person
 * who reads it. That is PostgREST refusing a token whose `iat` is a second
 * ahead of its clock, and its whole remedy is to sign in again, so the page
 * now says that instead. What matters is that the sorting is right in both
 * directions: a token fault the page fails to recognise is a raw server string
 * on screen again, and an ordinary fault it mistakes for a token fault is
 * worse, because the reader is sent to sign in over something signing in will
 * not fix, and the real error never gets read.
 *
 * The wordings below are the ones PostgREST and GoTrue actually emit.
 */

import { describe, expect, it } from 'vitest';
import { looksStale } from './api';

describe('a token the server will not take', () => {
  it.each([
    'JWT issued at future',
    'JWT expired',
    'invalid JWT: unable to parse or verify signature',
    'JWSError JWSInvalidSignature',
    'token is expired by 3m0s',
    'invalid claim: missing sub claim',
  ])('is recognised: %s', (message) => {
    expect(looksStale(message)).toBe(true);
  });

  it('is recognised by code, whatever the wording', () => {
    expect(looksStale('anything at all', 'PGRST301')).toBe(true);
    expect(looksStale('anything at all', 'PGRST302')).toBe(true);
  });
});

describe('everything else is left alone', () => {
  it.each([
    // The allowlist refusal. unwrap checks this first, but it must not match
    // here either: being told to sign in again would be a lie, since a fresh
    // token for the same address is refused in exactly the same way.
    'permission denied: not permitted',
    // The faults that would be hidden by a confident "sign in again".
    'relation "admin.metric_day" does not exist',
    'function admin_metrics(unknown, unknown) does not exist',
    'canceling statement due to statement timeout',
    'could not connect to server',
    'duplicate key value violates unique constraint',
    'new row violates row-level security policy',
  ])('is not mistaken for a stale token: %s', (message) => {
    expect(looksStale(message)).toBe(false);
  });

  it('does not match a code it does not know', () => {
    expect(looksStale('something went wrong', 'PGRST116')).toBe(false);
    expect(looksStale('something went wrong', undefined)).toBe(false);
  });

  it('does not fire on the word jwt buried inside another word', () => {
    // \b on both sides, so a column or a table that happens to contain the
    // letters does not send the reader to the sign-in page.
    expect(looksStale('column "jwtoken_audit" does not exist')).toBe(false);
    expect(looksStale('relation "myjwt" does not exist')).toBe(false);
  });
});
