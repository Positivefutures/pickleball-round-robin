import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { QrCode } from '../QrCode';
import { CopyIcon, PersonIcon, ShareIcon } from '../icons';
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
 *
 * Opening the card makes the link. Somebody who has chosen Share Live Session
 * has said what they want, and the panel that used to stand between them and the
 * code was asking the same question twice with a court full of people waiting.
 * What that panel said about what is shared is now on the code itself, where it
 * is still read before anybody scans it.
 *
 * Stopping is the one way back. The host has taken the session down, so the link
 * is gone and there is nothing to show; the panel goes back to offering to make
 * a new one, and the guard below is what stops it making one unasked.
 */

const PRIMARY =
  'w-full rounded-lg bg-[#018D31] px-4 py-3 font-bold text-white transition-colors hover:bg-[#017129] disabled:opacity-40 disabled:hover:bg-[#018D31]';
const SECONDARY =
  'flex w-full items-center gap-3 rounded-lg border border-[#D8DEE4] bg-white px-4 py-3 text-left text-[#3D495A] transition-colors hover:bg-[#F1F3F6]';
const QUIET_TEXT = '#636A77';

interface Props {
  /**
   * Opens My Account, having shut the sheet. Absent when the app was built
   * with no database at all, which is the one case where there is nothing an
   * account could do.
   */
  onCreateAccount?: () => void;
}

export function LiveShareView({ onCreateAccount }: Props) {
  const status = useSyncExternalStore(liveStatusStore.subscribe, liveStatusStore.get);
  const [copied, setCopied] = useState(false);
  const [hasSheet] = useState(canShare);
  // Set by Stop Sharing, and never cleared except by asking again. Without it
  // the effect below would publish the session again the moment it came down.
  const [stopped, setStopped] = useState(false);
  const asked = useRef(false);

  const url = status.state === 'live' || status.state === 'publishing' || status.state === 'problem'
    ? status.url
    : null;

  // Once per opening. StrictMode runs a mount effect twice in development, and
  // two of these is two rows minted where one was wanted.
  useEffect(() => {
    if (asked.current) return;
    if (!sharingAvailable()) return;
    if (liveStatusStore.get().state !== 'off') return;
    asked.current = true;
    void startSharing();
  }, []);

  function begin() {
    setStopped(false);
    void startSharing();
  }

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

  // Signed out, or a build with nowhere to publish to. The card is offered
  // either way: a host who has never signed in has no way of finding out that
  // sharing exists if the thing that explains it is the thing being hidden.
  if (!sharingAvailable()) {
    return (
      <div className="space-y-3">
        <p className="text-[15px] leading-snug text-[#3D495A]">
          Sharing a session needs an account, because the session has to be kept
          somewhere the other phones can reach.
        </p>
        <p className="text-sm" style={{ color: QUIET_TEXT }}>
          It is free, and it also keeps your groups and players safe if you lose
          your phone.
        </p>
        {onCreateAccount ? (
          <button type="button" onClick={onCreateAccount} className={SECONDARY}>
            <PersonIcon className="h-6 w-6" />
            <span className="font-bold">Create an account</span>
          </button>
        ) : (
          // No Supabase in this build, so there is no account to make. Saying
          // where to go would send them to a menu item that is not there.
          <p className="text-sm" style={{ color: QUIET_TEXT }}>
            Accounts are switched off in this version of the app.
          </p>
        )}
      </div>
    );
  }

  // Taken down by hand. The only view with a button to start, because it is the
  // only time the host has said they do not want this running.
  if (stopped) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="text-[15px] leading-snug text-[#3D495A]">
          Sharing has stopped and the old link no longer works. Making another
          one puts this session back on the phones that scan it.
        </p>

        {status.state === 'problem' && (
          <p className="mt-3 text-sm font-medium text-red-700">{status.message}</p>
        )}

        <div className="mt-auto pt-4">
          <button
            type="button"
            className={PRIMARY}
            disabled={status.state === 'starting'}
            onClick={begin}
          >
            {status.state === 'starting' ? 'Making a link…' : 'Share This Session'}
          </button>
        </div>
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

        {status.state === 'problem' ? (
          <>
            <p className="mt-3 text-sm font-medium text-red-700">{status.message}</p>
            <div className="mt-auto pt-4">
              <button type="button" className={PRIMARY} onClick={begin}>
                Try Again
              </button>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm" style={{ color: QUIET_TEXT }}>
            Making a link…
          </p>
        )}
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

      {/* Said here rather than on a panel before this one, and said whatever
          the publisher is doing. It is what somebody would want to know before
          they hold the code up, so it cannot be the line an error replaces. */}
      <p className="text-sm" style={{ color: QUIET_TEXT }}>
        Names, courts and scores are shared. Player ratings are not.
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
          <span className="font-bold">Share link&hellip;</span>
        </button>
      )}

      <button type="button" onClick={handleCopy} className={SECONDARY}>
        <CopyIcon className="h-6 w-6" />
        <span className="font-bold">{copied ? 'Copied' : 'Copy link'}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          setStopped(true);
          void stopSharing();
        }}
        className="w-full rounded-lg bg-red-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-red-700"
      >
        Stop Sharing
      </button>
    </div>
  );
}
