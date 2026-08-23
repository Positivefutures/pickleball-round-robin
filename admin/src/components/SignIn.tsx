/**
 * Sign in, the same way the app does: an email address, then a six digit code.
 *
 * Reusing the app's flow rather than inventing one is the whole argument for
 * this design. It is already built, already proven against a real inbox, and
 * costs nothing. There is no password here and there never will be.
 *
 * **This form is not what keeps anybody out.** Anyone may type their address
 * and receive a code; what they then get is a refusal from Postgres, because
 * every function this page calls checks admin.allowlist first. That check
 * cannot be edited from a browser, which is the point. See A001_admin_schema.sql.
 *
 * One consequence worth stating: a code sent from here comes out of the same
 * Resend allowance as everybody's sign-in codes, 100 a day. Signing in once a
 * week costs four of those a month.
 */

import { useState } from 'react';
import { supabase } from '../lib/api';
import { ADMIN_NAME, LOGO_SRC } from '../lib/appInfo';

type Stage = { name: 'email' } | { name: 'code'; email: string };

export function SignIn() {
  const [stage, setStage] = useState<Stage>({ name: 'email' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    const { error } = await supabase().auth.signInWithOtp({
      email,
      // No account is ever created from this page. Somebody who is not already
      // a user of the app has nothing here, and letting a stray address mint an
      // account would put a row in auth.users that this dashboard would then
      // count as a signup.
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (error) setProblem(error.message);
    else setStage({ name: 'code', email });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (stage.name !== 'code') return;
    setBusy(true);
    setProblem(null);
    const { error } = await supabase().auth.verifyOtp({
      email: stage.email,
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (error) setProblem(error.message);
    // On success the auth listener in App.tsx takes over.
  }

  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <div className="mb-1 flex items-center gap-3">
        <img src={LOGO_SRC} alt="" width={40} height={40} className="h-10 w-10 shrink-0" />
        <h1 className="m-0 text-xl font-semibold">{ADMIN_NAME}</h1>
      </div>
      <p className="mb-6 text-sm text-[var(--color-ink-quiet)]">
        Sign in with the owner address. Anything else gets a code and then a refusal.
      </p>

      <form onSubmit={stage.name === 'email' ? sendCode : verify} className="flex flex-col gap-3">
        {stage.name === 'email' ? (
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-md border border-[var(--color-panel-edge)] px-3 py-2.5 text-base focus:border-[var(--color-brand-teal)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-brand-teal)]"
          />
        ) : (
          <>
            <p className="m-0 text-sm text-[var(--color-ink-quiet)]">
              Code sent to {stage.email}.
            </p>
            <input
              // inputMode numeric rather than type number: a six digit code is a
              // string of digits, not a quantity, and a number input offers
              // spinners and strips leading zeros.
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="rounded-md border border-[var(--color-panel-edge)] px-3 py-2.5 text-center text-2xl tracking-[0.3em] tnum focus:border-[var(--color-brand-teal)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-brand-teal)]"
            />
          </>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[var(--color-brand-teal)] px-4 py-2.5 text-base font-medium text-white hover:bg-[var(--color-brand-teal-dark)] disabled:opacity-60 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-brand-teal)]"
        >
          {busy ? 'Working…' : stage.name === 'email' ? 'Send me a code' : 'Sign in'}
        </button>

        {problem && (
          <p role="alert" className="m-0 text-sm text-[var(--color-critical)]">
            {problem}
          </p>
        )}
      </form>
    </main>
  );
}
