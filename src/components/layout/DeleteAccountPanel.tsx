import { useState } from 'react';
import { deleteMyAccount } from '../../lib/account';
import { AccountShell, Problem } from './AccountShell';
import { DownloadMyData } from './DownloadMyData';
import { danger, field, label, note, secondary } from './accountStyles';

/** Case and stray spaces forgiven. A phone that capitalises is not a wrong answer. */
const CONFIRM_WORD = 'DELETE';

function confirmed(typed: string): boolean {
  return typed.trim().toUpperCase() === CONFIRM_WORD;
}

/**
 * The confirmation, which is most of this feature.
 *
 * Deleting the account is one call. Being sure the person meant it is the part
 * worth building, and it is done three ways: the screen says what goes and what
 * stays before it asks anything, it offers the download right there rather than
 * telling anyone to go and find it, and it will not accept a tap alone.
 *
 * Typing a word is the standard gate, and it is here for the ordinary reason.
 * This is a panel reached from a list of grey rows on a phone, and the row
 * above it is Sign Out.
 *
 * **What stays is the reassuring part, and it is true.** The groups and players
 * live on the device. An account is a copy for getting them onto a second
 * phone, so ending one leaves the app exactly as it is for the many people who
 * never made one.
 */
export function DeleteAccountPanel({
  email,
  onCancel,
  onDeleted,
}: {
  email: string | null;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function run() {
    if (!confirmed(typed)) return;
    setBusy(true);
    setProblem(null);
    const result = await deleteMyAccount();
    // Deliberately not clearing busy on success. The panel is about to be
    // replaced, and re-enabling the button first gives a second tap somewhere
    // to land.
    if (result.ok) {
      onDeleted();
      return;
    }
    setBusy(false);
    setProblem(result.message);
  }

  return (
    <AccountShell title="Delete Account">
      <p className="mt-2 text-center text-lg font-bold text-[#9B2C2C]">This cannot be undone.</p>

      <div className={`${note} border-[#E7C3C0] bg-[#FDF3F2] text-[#7F1D1D]`}>
        <p className="font-bold">What goes</p>
        <p className="mt-1">
          The account under {email ?? 'this address'}, and the copy of your groups and players
          saved to it.
        </p>
      </div>

      <div className={`${note} border-green-200 bg-green-50 text-green-900`}>
        <p className="font-bold">What stays</p>
        <p className="mt-1">
          Your groups and players stay on this device. The app carries on working the way it did
          before you made an account.
        </p>
      </div>

      <DownloadMyData variant="button" />

      <div className="mt-5">
        <label className={label} htmlFor="acct-delete-confirm">
          Type {CONFIRM_WORD} to confirm
        </label>
        <input
          id="acct-delete-confirm"
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void run();
          }}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          className={field}
        />
      </div>

      {problem && <Problem>{problem}</Problem>}

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || !confirmed(typed)}
        className={`mt-4 ${danger}`}
      >
        {busy ? 'Deleting...' : 'Delete My Account'}
      </button>

      <button type="button" onClick={onCancel} disabled={busy} className={`mt-3 ${secondary}`}>
        Cancel
      </button>
    </AccountShell>
  );
}

/**
 * What is left to say afterwards.
 *
 * A screen of its own because the alternative is worse: deleting signs the
 * person out, and the panel would otherwise snap straight back to Sign In, as
 * though nothing had happened and they should start again.
 */
export function AccountDeletedPanel({ onClose }: { onClose: () => void }) {
  return (
    <AccountShell title="Account Deleted">
      <p className="mt-2 text-center text-lg leading-snug text-[#495668]">
        Your account is gone, along with everything that was saved to it.
      </p>
      <p className="mt-3 text-center leading-snug text-[#69727F]">
        Your groups and players are still on this device, and the app works as it always did. You
        can make a new account any time.
      </p>

      <button type="button" onClick={onClose} className={`mt-5 ${secondary}`}>
        Close
      </button>
    </AccountShell>
  );
}
