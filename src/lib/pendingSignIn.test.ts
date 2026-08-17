/**
 * @vitest-environment happy-dom
 *
 * The code that was emailed, and outliving the page that asked for it.
 *
 * Fetching a sign-in code means leaving the app: to the mail app, and back.
 * iOS reloads a backgrounded Safari tab whenever it wants the memory, and the
 * panel that was on screen is ordinary component state, so it does not come
 * back. What a new host saw was the app blink, the panel vanish, and the
 * schedule underneath — holding a code with nowhere to type it. Reopening My
 * Account offered the email field again, which sends a second code to the same
 * dead end, and that is a loop with no exit in it.
 *
 * So a send is recorded, and the record is what the panel and the app both read
 * on the way up. These are the rules it lives by.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const verifyOtp = vi.fn(() => Promise.resolve({ error: null as { message: string } | null }));
const signInWithOtp = vi.fn(() => Promise.resolve({ error: null as { message: string } | null }));

vi.mock('./supabase', () => ({
  isSupabaseConfigured: () => true,
  hasStoredSession: () => false,
  hasAuthCallback: () => false,
  clearAuthParams: () => {},
  getSupabase: () => Promise.resolve({ auth: { signInWithOtp, verifyOtp } }),
}));

const {
  sendSignInEmail,
  verifyCode,
  pendingSignIn,
  signInInterrupted,
  dismissPendingSignIn,
  forgetPendingSignIn,
} = await import('./auth');
const stores = await import('./stores');

/** An hour, which is how long Supabase lets an emailed code live. */
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  window.localStorage.clear();
  stores.pendingSignIn.set(null);
  verifyOtp.mockClear();
  signInWithOtp.mockClear();
  verifyOtp.mockResolvedValue({ error: null });
  signInWithOtp.mockResolvedValue({ error: null });
});

describe('a code on its way', () => {
  it('is remembered, so the box to type it in survives the trip to the mail app', async () => {
    await sendSignInEmail('host@example.com');

    // Not "some state somewhere": the address, because the code screen names it
    // back so a typo is visible.
    expect(pendingSignIn()).toBe('host@example.com');
  });

  it('is remembered under the address that was really sent to', async () => {
    // A phone keyboard puts a space after an address. The code goes to the
    // trimmed one, so that is what has to be typed against.
    await sendSignInEmail('  host@example.com ');

    expect(pendingSignIn()).toBe('host@example.com');
  });

  it('is not remembered when the email never went', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'Email rate limit exceeded' } });
    await sendSignInEmail('host@example.com');

    // Reopening on a code screen for an email that was never sent is a worse
    // dead end than the one this whole record exists to fix.
    expect(pendingSignIn()).toBeNull();
    expect(signInInterrupted()).toBe(false);
  });

  it('brings the app back to the panel by itself, since nothing else will', async () => {
    await sendSignInEmail('host@example.com');

    expect(signInInterrupted()).toBe(true);
  });
});

describe('a code that has been used', () => {
  it('is forgotten, so the code screen does not reopen over somebody who is in', async () => {
    await sendSignInEmail('host@example.com');
    await verifyCode('host@example.com', '123456');

    expect(pendingSignIn()).toBeNull();
    expect(signInInterrupted()).toBe(false);
  });

  it('is kept when the code was refused, because they are still mid-sign-in', async () => {
    await sendSignInEmail('host@example.com');
    verifyOtp.mockResolvedValue({ error: { message: 'Invalid OTP' } });
    await verifyCode('host@example.com', '000000');

    expect(pendingSignIn()).toBe('host@example.com');
  });
});

describe('a code nobody used', () => {
  it('expires with the code itself, rather than outliving it', async () => {
    await sendSignInEmail('host@example.com');

    // Supabase will not accept the code past the hour, and a box that cannot
    // take anything is a worse place to be put than the email field.
    const record = stores.pendingSignIn.get()!;
    stores.pendingSignIn.set({ ...record, sentAt: Date.now() - HOUR - 1000 });

    expect(pendingSignIn()).toBeNull();
    expect(signInInterrupted()).toBe(false);
  });

  it('is still good a moment before the hour is up', async () => {
    await sendSignInEmail('host@example.com');
    const record = stores.pendingSignIn.get()!;
    stores.pendingSignIn.set({ ...record, sentAt: Date.now() - HOUR + 5000 });

    expect(pendingSignIn()).toBe('host@example.com');
  });

  it('is cleared out of storage as it is found dead, not just hidden', async () => {
    await sendSignInEmail('host@example.com');
    const record = stores.pendingSignIn.get()!;
    stores.pendingSignIn.set({ ...record, sentAt: Date.now() - HOUR - 1000 });

    pendingSignIn();

    expect(stores.pendingSignIn.get()).toBeNull();
  });
});

/**
 * The difference between the app letting itself in and the host asking for it.
 *
 * Somebody who shut My Account with a code still unused has said they are done
 * for now. The box stays waiting for them, because they may well come back to
 * it; what stops is the app putting the panel up on every launch for the rest
 * of the hour.
 */
describe('a panel the host closed themselves', () => {
  it('stops the app opening it again unasked', async () => {
    await sendSignInEmail('host@example.com');
    dismissPendingSignIn();

    expect(signInInterrupted()).toBe(false);
  });

  it('still has the code screen waiting when they open it themselves', async () => {
    await sendSignInEmail('host@example.com');
    dismissPendingSignIn();

    expect(pendingSignIn()).toBe('host@example.com');
  });

  it('is harmless when there was no code out at all', () => {
    dismissPendingSignIn();

    expect(stores.pendingSignIn.get()).toBeNull();
  });
});

describe('Use a Different Address', () => {
  it('throws the code away rather than hiding it', async () => {
    await sendSignInEmail('host@example.com');
    forgetPendingSignIn();

    // Left stored, it would reopen the code screen on the next launch, for an
    // address they have just told us is the wrong one.
    expect(pendingSignIn()).toBeNull();
    expect(signInInterrupted()).toBe(false);
  });
});
