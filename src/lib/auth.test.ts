import { describe, it, expect, vi, afterEach } from 'vitest';
import { __testing } from './auth';
import { isSupabaseConfigured, getSupabase } from './supabase';

const { friendlyError, fromSession } = __testing;

describe('friendlyError', () => {
  it('names the fix for the errors a host can actually hit', () => {
    expect(friendlyError(new Error('Token has expired or is invalid'))).toMatch(/expired/i);
    expect(friendlyError(new Error('Invalid OTP'))).toMatch(/didn't match/i);
    expect(friendlyError(new Error('Email rate limit exceeded'))).toMatch(/too many/i);
    expect(friendlyError(new Error('Unable to validate email address: invalid format')))
      .toMatch(/email address/i);
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatch(/connection/i);
  });

  it('never passes an unrecognised message through to the user', () => {
    // Whatever Supabase says about its internals, a host sees plain English and
    // no stack, table name or column.
    const leaky = new Error('PGRST301: JWSError JWSInvalidSignature at public.players');
    const shown = friendlyError(leaky);
    expect(shown).toBe('Something went wrong. Try again in a moment.');
    expect(shown).not.toContain('players');
    expect(shown).not.toContain('PGRST');
  });

  it('copes with something that is not an Error at all', () => {
    expect(friendlyError(null)).toBeTruthy();
    expect(friendlyError(undefined)).toBeTruthy();
    expect(friendlyError('plain string')).toBeTruthy();
  });

  // The two rate limits are different conditions with different answers, and
  // the old copy gave both the same one. Supabase caps a project at 30 emails
  // an hour and Resend caps the day at 100, so the ceiling is not something a
  // user caused or can wait out in a minute.
  it('repeats the real wait for the per-address cooldown', () => {
    const cooldown = new Error('For security purposes, you can only request this after 41 seconds.');
    expect(friendlyError(cooldown, 'send')).toContain('41 seconds');
    // Not the ceiling's advice: waiting genuinely does work here.
    expect(friendlyError(cooldown, 'send')).not.toMatch(/without an account/i);
  });

  it('tells someone the app still works when the project ceiling is hit', () => {
    const ceiling = Object.assign(new Error('Email rate limit exceeded'), {
      code: 'over_email_send_rate_limit',
      status: 429,
    });
    const shown = friendlyError(ceiling, 'send');
    expect(shown).toMatch(/without an account/i);
    // "Wait a minute" would be a lie against an hourly cap.
    expect(shown).not.toMatch(/minute/i);
  });

  it('does not offer the send advice for a rate limit that sent nothing', () => {
    // Too many verify attempts is the user, and waiting does fix it.
    const tooMany = Object.assign(new Error('Request rate limit reached'), { status: 429 });
    expect(friendlyError(tooMany)).toMatch(/wait a minute/i);
  });

  it('recognises a rate limit from the code alone, whatever the message says', () => {
    // The message is Supabase's to reword. The code and status are the stable
    // part, so detection must not depend on the prose.
    const reworded = Object.assign(new Error('Something unhelpful'), {
      code: 'over_email_send_rate_limit',
    });
    expect(friendlyError(reworded, 'send')).toMatch(/without an account/i);
  });
});

describe('fromSession', () => {
  it('reads a session into the signed-in state', () => {
    expect(fromSession({ user: { id: 'u1', email: 'jeff@example.com' } })).toEqual({
      status: 'signed-in',
      email: 'jeff@example.com',
      userId: 'u1',
    });
  });

  it('treats no session as signed out', () => {
    expect(fromSession(null)).toEqual({ status: 'signed-out' });
  });

  it('survives a user with no email on it', () => {
    expect(fromSession({ user: { id: 'u1' } })).toEqual({
      status: 'signed-in',
      email: null,
      userId: 'u1',
    });
  });
});

describe('configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reports unconfigured when there are no env vars', () => {
    // vitest.config.ts blanks these for the whole suite, so this is the same
    // path a build with no Supabase env vars takes: no client, no Account item,
    // no network. The walkthrough tests then prove the app still works that way.
    expect(isSupabaseConfigured()).toBe(false);
  });

  it('refuses to build a client rather than reaching for undefined keys', async () => {
    await expect(getSupabase()).rejects.toThrow(/not configured/i);
  });

  it('reports configured once both vars are present, and not on one alone', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    expect(isSupabaseConfigured()).toBe(false);

    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_test');
    expect(isSupabaseConfigured()).toBe(true);
  });
});
