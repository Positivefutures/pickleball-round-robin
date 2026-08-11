import { useEffect, useRef, useState } from 'react';
import { sendSignInEmail, verifyCode } from '../../lib/auth';
import { GroupsIcon, LockIcon, ShieldCheckIcon, SyncDevicesIcon } from '../icons';
import { AccountShell, Problem } from './AccountShell';
import { blurb, field, label, muted, note, primary, secondary } from './accountStyles';

interface Props {
  onClose: () => void;
  /**
   * Why this panel opened by itself, when a link put someone here. Amber rather
   * than the red of a Problem: nothing they did caused it, and the panel below
   * is the fix rather than the complaint.
   */
  notice?: string | null;
}

/** Long enough for the shortest code Supabase will issue, short enough to reject a typo. */
const MIN_CODE = 6;

/** What an account is for, in the order someone would ask it. */
const promises = [
  { Icon: GroupsIcon, text: 'Save your groups and players' },
  { Icon: SyncDevicesIcon, text: 'Sync across all your devices' },
  { Icon: ShieldCheckIcon, text: 'Securely backed up' }
];

function PromiseRow({ Icon, text }: { Icon: typeof GroupsIcon; text: string }) {
  return (
    <li className="flex items-center gap-4">
      {/* No disc behind these. The mockup drew one and Jeff cut it, so the icon
          carries the green on its own. */}
      <Icon className="h-8 w-8 shrink-0 text-[#3D7E34]" />
      <span className="text-lg leading-snug text-[#1F293D]">{text}</span>
    </li>
  );
}

/**
 * Signed out: what an account gets you, and the one field that starts it.
 *
 * Two screens in one, because they are the same task either side of an email
 * being sent. The second is deliberately narrow — once the code is on its way,
 * the only thing anyone wants is somewhere to type it.
 */
export function SignInPanel({ onClose, notice }: Props) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const codeRef = useRef<HTMLInputElement>(null);

  // The code field is the only thing anyone wants once the email is away.
  useEffect(() => {
    if (sentTo) codeRef.current?.focus();
  }, [sentTo]);

  async function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setProblem(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setProblem(result.message ?? 'Something went wrong.');
    return result.ok;
  }

  async function handleSend() {
    const address = email.trim();
    // Checked here rather than by disabling the button. A green button that
    // greys itself out before anyone has typed reads as broken, and the mockup
    // draws it solid.
    if (!address) {
      setProblem('Enter your email address.');
      return;
    }
    if (await run(() => sendSignInEmail(address))) {
      setSentTo(address);
      setCode('');
    }
  }

  async function handleVerify() {
    if (!sentTo) return;
    if (code.length < MIN_CODE) {
      setProblem('Enter the 6 digit code from the email.');
      return;
    }
    if (await run(() => verifyCode(sentTo, code))) {
      setSentTo(null);
      setCode('');
      setEmail('');
    }
  }

  if (sentTo) {
    return (
      <AccountShell statusLine="Check your email" onClose={onClose}>
        <p className={blurb}>
          We sent a 6 digit code to{' '}
          <span className="font-bold text-[#1F293D]">{sentTo}</span>.
        </p>

        <div className="mt-5">
          <label className={label} htmlFor="acct-code">
            Code from the email
          </label>
          <input
            id="acct-code"
            ref={codeRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={code}
            // Digits only, so a pasted code with a stray space still works.
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleVerify();
            }}
            className={`${field} text-center text-3xl font-bold tracking-[0.4em]`}
          />
        </div>

        {/* The one thing worth saying here, and the reason most codes look like
            they never arrived. */}
        <p className="mt-3 text-center leading-snug text-[#69727F]">
          Not there? Check your spam folder.
        </p>

        {problem && <Problem>{problem}</Problem>}

        <button
          type="button"
          onClick={() => void handleVerify()}
          disabled={busy}
          className={`mt-4 ${primary}`}
        >
          {busy ? 'Signing in...' : 'Sign in'}
        </button>

        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setCode('');
            setProblem(null);
          }}
          disabled={busy}
          className="mt-3 w-full text-[#4B6B45] underline underline-offset-2 hover:text-[#3D7E34]"
        >
          Use a different address
        </button>

        <button type="button" onClick={onClose} className={`mt-3 ${secondary}`}>
          Close
        </button>
      </AccountShell>
    );
  }

  return (
    <AccountShell statusLine="You are not signed in" onClose={onClose}>
      {/* Above everything, because it answers the question somebody arriving
          from a link is already asking. Without it this panel looks like the
          tap did nothing, and they start over. */}
      {notice && (
        <p role="status" className={`${note} border-amber-200 bg-amber-50 text-amber-900`}>
          {notice}
        </p>
      )}

      <p className={blurb}>Sign in with your email to save and sync your data.</p>

      <ul className="mt-5 space-y-4">
        {promises.map((p) => (
          <PromiseRow key={p.text} Icon={p.Icon} text={p.text} />
        ))}
      </ul>

      <div className="mt-6">
        <label className={label} htmlFor="acct-email">
          Email address
        </label>
        <input
          id="acct-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSend();
          }}
          className={field}
        />
      </div>

      {problem && <Problem>{problem}</Problem>}

      <button
        type="button"
        onClick={() => void handleSend()}
        disabled={busy}
        className={`mt-4 ${primary}`}
      >
        {busy ? 'Sending...' : 'Email me a login code'}
      </button>

      <p className="mt-3 text-center leading-snug text-[#495668]">
        New here? We&rsquo;ll create your account.
        <br />
        Already have one? We&rsquo;ll sign you in.
      </p>

      <p className={muted}>
        <LockIcon className="h-4 w-4 shrink-0" />
        No password needed.
      </p>

      <button type="button" onClick={onClose} className={`mt-4 ${secondary}`}>
        Close
      </button>
    </AccountShell>
  );
}
