import { useState } from 'react';
import { buildMyDataFile } from '../../lib/account';
import { downloadTextFile } from '../../utils/download';
import { DownloadIcon } from '../icons';
import { Problem } from './AccountShell';
import { note, row, rowIcon, rowNote, rowTitle, secondary } from './accountStyles';

/**
 * Take a copy of everything the account holds.
 *
 * One component in two shapes, because it belongs in two places and the second
 * one matters more than the first. It sits in the account list as an ordinary
 * job, and again on the delete screen, where it is the last chance anybody gets
 * to keep what they are about to remove.
 *
 * The file is built in `src/lib/account.ts` and handed over here, so what goes
 * into it can be asserted without a download happening.
 */
export function DownloadMyData({ variant }: { variant: 'row' | 'button' }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setProblem(null);
    setSaved(null);
    const result = await buildMyDataFile();
    setBusy(false);
    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    downloadTextFile(result.value.name, result.value.json, 'application/json');
    setSaved(result.value.name);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className={variant === 'row' ? row : `${secondary} mt-3`}
      >
        {variant === 'row' ? (
          <>
            <DownloadIcon className={rowIcon} />
            <span>
              <span className={rowTitle}>{busy ? 'Preparing...' : 'Download My Data'}</span>
              <span className={rowNote}>Everything your account holds, in one file</span>
            </span>
          </>
        ) : busy ? (
          'Preparing...'
        ) : (
          'Download My Data First'
        )}
      </button>

      {problem && <Problem>{problem}</Problem>}
      {saved && (
        <p className={`${note} border-green-200 bg-green-50 text-green-900`}>
          Saved as {saved}. Look in your downloads.
        </p>
      )}
    </>
  );
}
