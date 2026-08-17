import { useState } from 'react';
import { combineWithAccount, adoptAccountCopy, type Counts, type SyncReport } from '../../lib/sync';
import { AccountShell } from './AccountShell';
import { blurb, primary, secondary } from './accountStyles';

function tally(counts: Counts): string {
  const groups = `${counts.rosters} ${counts.rosters === 1 ? 'group' : 'groups'}`;
  const players = `${counts.players} ${counts.players === 1 ? 'player' : 'players'}`;
  return `${groups}, ${players}`;
}

/**
 * Label above value rather than beside it. Side by side, "2 groups, 14 players"
 * wrapped at 390px while "1 group, 9 players" did not, so the two halves of the
 * comparison came out different heights.
 */
function Side({ where, counts }: { where: string; counts: Counts }) {
  return (
    <div className="px-4 py-3">
      <p className="text-sm text-[#6B7684]">{where}</p>
      <p className="text-lg font-bold text-[#1F293D]">{tally(counts)}</p>
    </div>
  );
}

/**
 * The one decision this app will not make on anybody's behalf.
 *
 * It comes up when the account already holds groups, or when this device's
 * groups were last saved to a different account. Either way both sides hold real
 * work, and both answers are reasonable, so the numbers go on screen and the
 * person picks. Combining is offered first when the two sides are probably the
 * same person, and replacing first when they are probably not.
 *
 * It gets the whole card, with no Close and no backdrop dismiss. As a note
 * tucked inside the account screen it sat above Change email, Sign out and
 * Close, and the easiest thing to do with the most consequential question in the
 * app was walk past it.
 */
export function MergeChoicePanel({
  reason,
  account,
  device,
  matched,
  onDone
}: {
  reason: 'server-has-data' | 'other-account';
  account: Counts;
  device: Counts;
  /** Names held on both sides, which combining would fold into one. */
  matched: string[];
  onDone: (report: SyncReport) => void;
}) {
  const [busy, setBusy] = useState<null | 'combine' | 'replace'>(null);
  const [confirming, setConfirming] = useState(false);

  async function run(which: 'combine' | 'replace') {
    setBusy(which);
    onDone(await (which === 'combine' ? combineWithAccount() : adoptAccountCopy()));
  }

  const combine = (
    <button
      type="button"
      onClick={() => void run('combine')}
      disabled={busy !== null}
      className={reason === 'server-has-data' ? primary : secondary}
    >
      {busy === 'combine' ? 'Combining...' : 'Combine Them'}
    </button>
  );

  const replace = (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      disabled={busy !== null}
      className={reason === 'server-has-data' ? secondary : primary}
    >
      Use the Account&rsquo;s Copy
    </button>
  );

  return (
    <AccountShell statusLine="Pick what to keep">
      <p className={blurb}>
        {reason === 'server-has-data'
          ? 'Your account already has groups saved to it.'
          : 'The groups on this device were saved to a different account.'}
      </p>
      <p className="mt-2 text-center text-[#69727F]">Nothing moves until you choose.</p>

      <div className="mt-5 divide-y divide-[#E4E8EE] rounded-xl border border-panel-edge bg-[#F8F9FB]">
        <Side where="On your account" counts={account} />
        <Side where="On this device" counts={device} />
      </div>

      {matched.length > 0 && (
        <p className="mt-3 leading-snug text-[#495668]">
          Combining merges these duplicates into one person each: {matched.join(', ')}.
        </p>
      )}

      {confirming ? (
        <>
          <p className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 font-medium text-amber-900">
            Replace what is on this device? Anything here that is not already on your account will
            be gone.
          </p>
          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() => void run('replace')}
              disabled={busy !== null}
              className={primary}
            >
              {busy === 'replace' ? 'Replacing...' : 'Yes, Replace'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy !== null}
              className={secondary}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="mt-5 space-y-3">
          {reason === 'server-has-data' ? combine : replace}
          {reason === 'server-has-data' ? replace : combine}
        </div>
      )}
    </AccountShell>
  );
}
