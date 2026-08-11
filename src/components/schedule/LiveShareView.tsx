import { useState, useSyncExternalStore } from 'react';
import { QrCode } from '../QrCode';
import { CopyIcon, ShareIcon } from '../icons';
import {
  liveStatusStore,
  sharingAvailable,
  startSharing,
  stopSharing
} from '../../lib/liveSession';
import { canShare, sessionPayload, shareLink } from '../../lib/share';

/**
 * Sharing the session being run right now, from inside the Actions sheet.
 *
 * It takes no props and gives App nothing to thread. The publisher reads the
 * session off the stores itself, so there is nothing to hand it, and the status
 * arrives through useSyncExternalStore the same way AccountPanel reads authStore
 * and syncStatusStore. That is the whole reason this view can live in a sheet
 * whose other views are one question and one answer.
 */

const PRIMARY =
  'w-full rounded-lg bg-[#018D31] px-4 py-3 font-bold text-white transition-colors hover:bg-[#017129] disabled:opacity-40 disabled:hover:bg-[#018D31]';
const SECONDARY =
  'flex w-full items-center gap-3 rounded-lg border border-[#D8DEE4] bg-white px-4 py-3 text-left text-[#3D495A] transition-colors hover:bg-[#F1F3F6]';
const QUIET_TEXT = '#636A77';

export function LiveShareView() {
  const status = useSyncExternalStore(liveStatusStore.subscribe, liveStatusStore.get);
  const [copied, setCopied] = useState(false);
  const [hasSheet] = useState(canShare);

  const url = status.state === 'live' || status.state === 'publishing' || status.state === 'problem'
    ? status.url
    : null;

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked. The link is on screen and selectable by hand.
      setCopied(false);
    }
  }

  function handleShare() {
    if (!url) return;
    // Not awaited before the sheet opens: iOS only allows it from a live
    // gesture, and an await here spends it. See the note in share.ts.
    void shareLink(sessionPayload(url));
  }

  if (!sharingAvailable()) {
    return (
      <div className="space-y-3">
        <p className="text-[15px] leading-snug text-[#3D495A]">
          Sharing a session needs an account, because the session has to be kept
          somewhere the other phones can reach.
        </p>
        <p className="text-sm" style={{ color: QUIET_TEXT }}>
          Open the menu and choose My Account to sign in. Then come back here.
        </p>
      </div>
    );
  }

  if (url === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="text-[15px] leading-snug text-[#3D495A]">
          Everyone points a camera at one code and watches this session on their
          own phone. They can see it but not change it.
        </p>
        <p className="mt-2 text-sm" style={{ color: QUIET_TEXT }}>
          Names, courts and scores are shared. Player ratings are not.
        </p>

        {status.state === 'problem' && (
          <p className="mt-3 text-sm font-medium text-red-700">{status.message}</p>
        )}

        <div className="mt-auto pt-4">
          <button
            type="button"
            className={PRIMARY}
            disabled={status.state === 'starting'}
            onClick={() => void startSharing()}
          >
            {status.state === 'starting' ? 'Making a link…' : 'Share This Session'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <QrCode value={url} size={220} label="Scan to watch this session" />
      </div>

      <p className="text-center text-[15px] leading-snug text-[#3D495A]">
        Point a camera at the code, or send the link.
      </p>

      {/* select-all: one tap selects the whole address. */}
      <p className="select-all break-all rounded-md border border-[#D8DEE4] bg-[#F8F9FB] px-3 py-2.5 text-sm font-medium text-[#3D495A]">
        {url}
      </p>

      {status.state === 'problem' ? (
        // The link on the table is still the right one, so it stays on screen.
        // Only the last upload failed, and the next one is already scheduled.
        <p className="text-sm font-medium text-red-700">{status.message}</p>
      ) : (
        <p className="text-sm" style={{ color: QUIET_TEXT }}>
          Scores appear on their phones as you write them down. The link stops
          working after 24 hours.
        </p>
      )}

      {hasSheet && (
        <button type="button" onClick={handleShare} className={SECONDARY}>
          <ShareIcon className="h-6 w-6" />
          <span className="font-bold">Share&hellip;</span>
        </button>
      )}

      <button type="button" onClick={handleCopy} className={SECONDARY}>
        <CopyIcon className="h-6 w-6" />
        <span className="font-bold">{copied ? 'Copied' : 'Copy link'}</span>
      </button>

      <button
        type="button"
        onClick={() => void stopSharing()}
        className="w-full rounded-lg bg-red-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-red-700"
      >
        Stop Sharing
      </button>
    </div>
  );
}
