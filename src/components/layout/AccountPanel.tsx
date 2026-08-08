import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  authStore,
  initAuth,
  sendSignInEmail,
  verifyCode,
  signOut,
  changeEmail,
} from '../../lib/auth';
import { syncStatusStore } from '../../lib/sync';

interface Props {
  onClose: () => void;
}

/** Long enough for the shortest code Supabase will issue, short enough to reject a typo. */
const MIN_CODE = 6;

const field =
  'w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500';
const primary =
  'w-full rounded-md bg-green-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400';
const secondary =
  'w-full rounded-md border border-[#999] bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300';

/**
 * What has and has not reached the account.
 *
 * Worth stating plainly rather than reducing to a tick. Someone who has just
 * driven away from a court with an edited group wants to know whether it is
 * safe, and "3 changes waiting" is the true answer often enough to be the one
 * worth writing well.
 */
function SyncNote() {
  const sync = useSyncExternalStore(
    syncStatusStore.subscribe,
    syncStatusStore.get,
    syncStatusStore.get
  );

  const note = 'mt-4 rounded-md border px-3 py-2 text-sm';

  if (sync.state === 'saved') {
    return (
      <p className={`${note} border-green-200 bg-green-50 text-green-900`}>
        Your groups and players are saved to your account.
      </p>
    );
  }

  if (sync.state === 'waiting') {
    return (
      <p className={`${note} border-amber-200 bg-amber-50 text-amber-900`}>
        {sync.pending === 1 ? '1 change' : `${sync.pending} changes`} still to save.{' '}
        {sync.problem ?? 'Saving now.'}
      </p>
    );
  }

  if (sync.state === 'blocked') {
    return (
      <p className={`${note} border-amber-200 bg-amber-50 text-amber-900`}>
        {sync.reason === 'server-has-data'
          ? 'This account already has groups saved to it, so nothing on this device is being sent up yet. Combining the two is coming next.'
          : 'The groups on this device were last saved to a different account, so nothing is being sent up. Combining the two is coming next.'}
      </p>
    );
  }

  // off, starting, saving
  return (
    <p className={`${note} border-gray-200 bg-gray-50 text-gray-600`}>
      {sync.state === 'saving' ? 'Saving to your account...' : 'Checking your account...'}
    </p>
  );
}

function Problem({ children }: { children: string }) {
  return (
    <p
      role="alert"
      className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
    >
      {children}
    </p>
  );
}

/**
 * Signing in, and what you can do once you have.
 *
 * One panel rather than two, because which one you want depends on state the
 * drawer does not know: the client has to load before anyone can say whether
 * you are signed in. Loading it here, on open, is also what keeps the Supabase
 * chunk off the critical path for everyone else.
 *
 * Nothing in here moves data. Signing in at this stage changes what this panel
 * says and nothing else, and the panel says so rather than implying a backup
 * that does not exist yet.
 */
export function AccountPanel({ onClose }: Props) {
  const auth = useSyncExternalStore(authStore.subscribe, authStore.get, authStore.get);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [nextEmail, setNextEmail] = useState('');

  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void initAuth();
  }, []);

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
    if (await run(() => sendSignInEmail(address))) {
      setSentTo(address);
      setCode('');
    }
  }

  async function handleVerify() {
    if (!sentTo) return;
    if (await run(() => verifyCode(sentTo, code))) {
      setSentTo(null);
      setCode('');
      setEmail('');
    }
  }

  async function handleSignOut() {
    if (await run(signOut)) {
      setNotice(null);
      setChanging(false);
    }
  }

  async function handleChangeEmail() {
    if (await run(() => changeEmail(nextEmail))) {
      setChanging(false);
      setNextEmail('');
      setNotice(
        'Check both inboxes. The change only takes effect once you confirm from the old address and the new one.'
      );
    }
  }

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-lg border-[3px] border-[#444] bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-[1.35rem] font-extrabold text-[#222]">Account</h2>

        {auth.status === 'unknown' && (
          <p className="mt-4 text-center text-sm text-gray-600">Checking...</p>
        )}

        {auth.status === 'unavailable' && (
          <>
            <p className="mt-4 text-center text-sm text-gray-600">
              Couldn&rsquo;t reach the server. Check your connection and try again.
            </p>
            <p className="mt-3 text-center text-sm text-gray-600">
              Your groups and players are on this device either way. Nothing is lost.
            </p>
          </>
        )}

        {auth.status === 'signed-out' && !sentTo && (
          <>
            <p className="mt-1 mb-4 text-center text-sm text-gray-600">
              Sign in and your groups are backed up to your account. There is no password.
            </p>

            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="acct-email">
              Your email
            </label>
            <input
              id="acct-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSend();
              }}
              className={field}
            />

            {problem && <Problem>{problem}</Problem>}

            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={busy || !email.trim()}
              className={`mt-5 ${primary}`}
            >
              {busy ? 'Sending...' : 'Email me a code'}
            </button>
          </>
        )}

        {auth.status === 'signed-out' && sentTo && (
          <>
            <p className="mt-1 text-center text-sm text-gray-600">
              Check your email. We sent a link and a code to{' '}
              <span className="font-medium text-gray-800">{sentTo}</span>.
            </p>
            <p className="mt-3 text-center text-sm text-gray-600">
              Using the app from your home screen? Type the code. The link opens your browser
              instead, which signs you in there rather than here.
            </p>

            <label className="mt-4 mb-1 block text-sm font-medium text-gray-700" htmlFor="acct-code">
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
              className={`${field} text-center text-2xl tracking-[0.4em]`}
            />

            {problem && <Problem>{problem}</Problem>}

            <button
              type="button"
              onClick={() => void handleVerify()}
              disabled={busy || code.length < MIN_CODE}
              className={`mt-5 ${primary}`}
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
              className="mt-3 w-full text-sm text-gray-600 underline underline-offset-2 hover:text-gray-800"
            >
              Use a different address
            </button>
          </>
        )}

        {auth.status === 'signed-in' && (
          <>
            <p className="mt-1 text-center text-sm text-gray-600">Signed in as</p>
            <p className="mt-1 break-all text-center font-medium text-gray-800">
              {auth.email ?? 'this account'}
            </p>

            <SyncNote />

            {notice && (
              <p className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
                {notice}
              </p>
            )}

            {changing ? (
              <>
                <label
                  className="mt-4 mb-1 block text-sm font-medium text-gray-700"
                  htmlFor="acct-next-email"
                >
                  New email address
                </label>
                <input
                  id="acct-next-email"
                  type="email"
                  inputMode="email"
                  value={nextEmail}
                  onChange={(e) => setNextEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleChangeEmail();
                  }}
                  className={field}
                />
                {problem && <Problem>{problem}</Problem>}
                <button
                  type="button"
                  onClick={() => void handleChangeEmail()}
                  disabled={busy || !nextEmail.trim()}
                  className={`mt-4 ${primary}`}
                >
                  {busy ? 'Sending...' : 'Send confirmation'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChanging(false);
                    setNextEmail('');
                    setProblem(null);
                  }}
                  disabled={busy}
                  className="mt-3 w-full text-sm text-gray-600 underline underline-offset-2 hover:text-gray-800"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                {problem && <Problem>{problem}</Problem>}
                <button
                  type="button"
                  onClick={() => {
                    setChanging(true);
                    setNotice(null);
                  }}
                  disabled={busy}
                  className={`mt-4 ${secondary}`}
                >
                  Change email
                </button>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={busy}
                  className={`mt-3 ${secondary}`}
                >
                  {busy ? 'Signing out...' : 'Sign out'}
                </button>
                <p className="mt-2 text-center text-xs text-gray-500">
                  Signing out leaves your groups and players on this device.
                </p>
              </>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className={`mt-4 ${secondary}`}
        >
          Close
        </button>
      </div>
    </div>
  );
}
