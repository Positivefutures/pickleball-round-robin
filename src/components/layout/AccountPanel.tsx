import { useEffect, useState, useSyncExternalStore } from 'react';
import { authStore, initAuth, signOut, changeEmail } from '../../lib/auth';
import { syncStatusStore, type SyncReport } from '../../lib/sync';
import { MailIcon, SignOutIcon, TrashIcon } from '../icons';
import { AccountShell, Problem } from './AccountShell';
import { AccountDeletedPanel, DeleteAccountPanel } from './DeleteAccountPanel';
import { DownloadMyData } from './DownloadMyData';
import { MergeChoicePanel } from './MergeChoicePanel';
import { SignInPanel } from './SignInPanel';
import {
  blurb,
  field,
  label,
  note,
  primary,
  row,
  rowDanger,
  rowDangerTitle,
  rowIcon,
  rowIconDanger,
  rowNote,
  rowTitle,
  secondary
} from './accountStyles';

interface Props {
  onClose: () => void;
  /** Set only when a link opened this panel and failed. Shown on Sign In. */
  notice?: string | null;
}

/**
 * What has and has not reached the account.
 *
 * Worth stating plainly rather than reducing to a tick. Someone who has just
 * driven away from a court with an edited group wants to know whether it is
 * safe, and "3 changes waiting" is the true answer often enough to be the one
 * worth writing well.
 */
function SyncNote({ report }: { report: SyncReport | null }) {
  const sync = useSyncExternalStore(
    syncStatusStore.subscribe,
    syncStatusStore.get,
    syncStatusStore.get
  );

  if (report) {
    return (
      <div className={`${note} border-green-200 bg-green-50 text-green-900`}>
        <p className="font-bold">{report.title}</p>
        {report.details.map((line) => (
          <p key={line} className="mt-1">
            {line}
          </p>
        ))}
      </div>
    );
  }

  if (sync.state === 'saved') {
    return (
      <p className={`${note} border-green-200 bg-green-50 text-green-900`}>
        Your groups and players have been saved to your account.
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

  if (sync.state === 'unready') {
    return (
      <div className={`${note} border-amber-200 bg-amber-50 text-amber-900`}>
        <p>{sync.problem}</p>
        <p className="mt-2">Your groups and players are safe on this device.</p>
        {/* The raw message, small. This state should be rare, and when it
            happens the one thing nobody can get at is what the server
            actually said — least of all on a phone. */}
        {sync.detail && (
          <p className="mt-2 break-all font-mono text-xs text-amber-700">{sync.detail}</p>
        )}
      </div>
    );
  }

  // off, starting, saving
  return (
    <p className={`${note} border-panel-edge bg-[#F8F9FB] text-[#495668]`}>
      {sync.state === 'saving' ? 'Saving to your account...' : 'Checking your account...'}
    </p>
  );
}

/** Signed in: who you are, whether your data is safe, and the two account jobs. */
function SignedIn({
  email,
  report,
  onDelete,
  onClose
}: {
  email: string | null;
  report: SyncReport | null;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [nextEmail, setNextEmail] = useState('');

  async function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setProblem(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setProblem(result.message ?? 'Something went wrong.');
    return result.ok;
  }

  async function handleChangeEmail() {
    if (!nextEmail.trim()) {
      setProblem('Enter the new email address.');
      return;
    }
    if (await run(() => changeEmail(nextEmail))) {
      setChanging(false);
      setNextEmail('');
      setNotice(
        'Check both inboxes. The change only takes effect once you confirm from the old address and the new one.'
      );
    }
  }

  return (
    <AccountShell statusLine="You are signed in" onClose={onClose}>
      <p className="mt-1 text-center text-lg font-bold break-all text-[#1F293D]">
        {email ?? 'this account'}
      </p>

      <SyncNote report={report} />

      {notice && (
        <p className={`${note} border-green-200 bg-green-50 text-green-900`}>{notice}</p>
      )}

      {changing ? (
        <>
          <div className="mt-5">
            <label className={label} htmlFor="acct-next-email">
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
          </div>

          {problem && <Problem>{problem}</Problem>}

          <button
            type="button"
            onClick={() => void handleChangeEmail()}
            disabled={busy}
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
            className={`mt-3 ${secondary}`}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          {problem && <Problem>{problem}</Problem>}

          {/* Rows reading as a list, then one button. The old panel stacked
              identical grey slabs and Sign out looked exactly like Close. */}
          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={() => {
                setChanging(true);
                setNotice(null);
              }}
              disabled={busy}
              className={row}
            >
              <MailIcon className={rowIcon} />
              <span>
                <span className={rowTitle}>Change My Email Address</span>
                <span className={rowNote}>Requires confirming from both email addresses</span>
              </span>
            </button>

            <DownloadMyData variant="row" />

            <button
              type="button"
              onClick={() => void run(signOut)}
              disabled={busy}
              className={row}
            >
              <SignOutIcon className={rowIcon} />
              <span>
                <span className={rowTitle}>{busy ? 'Signing out...' : 'Sign Out'}</span>
                <span className={rowNote}>Your data stays safe on this device</span>
              </span>
            </button>
          </div>

          {/* Set apart, and last. Nothing above it can be undone by pressing it
              accidentally, and the confirmation is a screen of its own. */}
          <div className="mt-5 border-t border-[#E6E9EE] pt-4">
            <button type="button" onClick={onDelete} disabled={busy} className={rowDanger}>
              <TrashIcon className={rowIconDanger} />
              <span>
                <span className={rowDangerTitle}>Delete Account</span>
                <span className={rowNote}>Ends your account for good. Nothing here is lost</span>
              </span>
            </button>
          </div>

          <button type="button" onClick={onClose} className={`mt-4 ${secondary}`}>
            Close
          </button>
        </>
      )}
    </AccountShell>
  );
}

/**
 * The My Account entry point, and the only thing App knows about.
 *
 * It routes rather than draws: which screen you want depends on state the drawer
 * cannot know, because the Supabase client has to load before anyone can say
 * whether you are signed in. Loading it here, on open, is also what keeps that
 * chunk off the critical path for everyone else.
 */
export function AccountPanel({ onClose, notice }: Props) {
  const auth = useSyncExternalStore(authStore.subscribe, authStore.get, authStore.get);
  const sync = useSyncExternalStore(
    syncStatusStore.subscribe,
    syncStatusStore.get,
    syncStatusStore.get
  );
  const [report, setReport] = useState<SyncReport | null>(null);
  const [screen, setScreen] = useState<'account' | 'delete' | 'deleted'>('account');

  useEffect(() => {
    void initAuth();
  }, []);

  // Before anything that reads auth. Deleting the account signs the person out,
  // so every check below would send them back to Sign In as though the tap had
  // done nothing at all.
  if (screen === 'deleted') return <AccountDeletedPanel onClose={onClose} />;

  if (auth.status === 'unknown') {
    return (
      <AccountShell onClose={onClose}>
        <p className={blurb}>Checking...</p>
      </AccountShell>
    );
  }

  if (auth.status === 'unavailable') {
    return (
      <AccountShell onClose={onClose}>
        <p className={blurb}>Couldn&rsquo;t reach the server. Check your connection and try again.</p>
        <p className="mt-3 text-center leading-snug text-[#69727F]">
          Your groups and players are on this device either way. Nothing is lost.
        </p>
        <button type="button" onClick={onClose} className={`mt-5 ${secondary}`}>
          Close
        </button>
      </AccountShell>
    );
  }

  // Only reached once the client has answered, which is what makes the notice
  // safe to pass down unconditionally: a link that worked ends up signed in,
  // and never renders it.
  if (auth.status === 'signed-out') {
    return <SignInPanel onClose={onClose} notice={notice} />;
  }

  // The decision takes the whole card until it is answered.
  if (sync.state === 'choice' && !report) {
    return (
      <MergeChoicePanel
        reason={sync.reason}
        account={sync.account}
        device={sync.device}
        matched={sync.matched}
        onDone={setReport}
      />
    );
  }

  if (screen === 'delete') {
    return (
      <DeleteAccountPanel
        email={auth.email}
        onCancel={() => setScreen('account')}
        onDeleted={() => setScreen('deleted')}
      />
    );
  }

  return (
    <SignedIn
      email={auth.email}
      report={report}
      onDelete={() => setScreen('delete')}
      onClose={onClose}
    />
  );
}
