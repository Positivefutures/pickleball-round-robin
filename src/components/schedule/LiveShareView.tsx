import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { QrCode } from '../QrCode';
import { CopyIcon, PersonIcon, ShareIcon, StopIcon } from '../icons';
import {
  liveStatusStore,
  sharingAvailable,
  startSharing,
  stopSharing
} from '../../lib/liveSession';
import { canShare, sessionPayload, shareLink } from '../../lib/share';
import * as stores from '../../lib/stores';
import { useStoredValue } from '../../hooks/useStoredValue';

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
/**
 * The three things you can do with a live link, side by side and built like the
 * cards on the Actions sheet: the glyph large, the label under it, the whole
 * tile a target. They are one row because they are one decision — how this link
 * gets to people, or that it stops — and stacked full-width they read as three
 * unrelated steps to work through in order.
 */
const TILE =
  'flex flex-1 basis-0 flex-col items-center gap-1.5 rounded-lg border px-1 py-3 shadow-sm transition-colors';
const TILE_QUIET = `${TILE} border-[#D8DEE4] bg-white text-[#3D495A] hover:bg-[#F1F3F6]`;
const TILE_STOP = `${TILE} border-[#F0C3C3] bg-[#FDF2F2] text-[#B42121] hover:bg-[#FBE6E6]`;
const TILE_LABEL = 'text-center text-sm font-bold leading-tight';
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
  // What the card promises has to be what the link opens on. A session with
  // scoring off shares a schedule and nothing else.
  const [scoring] = useStoredValue(stores.scoringEnabled);
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
    // Read now rather than subscribed to: what the message should say is
    // settled by the moment the sheet opens, and the host cannot reach the
    // scoring switch without leaving this card.
    //
    // Not awaited before the sheet opens: iOS only allows it from a live
    // gesture, and an await here spends it. See the note in share.ts.
    void shareLink(sessionPayload(url, stores.scoringEnabled.get()));
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
        Have people scan this QR code, or send the link.
      </p>

      {/* select-all: one tap selects the whole address. */}
      <p className="select-all break-all rounded-md border border-[#D8DEE4] bg-[#F8F9FB] px-3 py-2.5 text-sm font-medium text-[#3D495A]">
        {url}
      </p>

      {/* Said here rather than on a panel before this one, and said whatever
          the publisher is doing. It is what somebody would want to know before
          they hold the code up, so it cannot be the line an error replaces. */}
      <p className="text-sm" style={{ color: QUIET_TEXT }}>
        {scoring
          ? 'Names, courts and scores are shared. Player ratings are not.'
          : 'Names and courts are shared. Player ratings are not.'}
      </p>

      {status.state === 'problem' ? (
        // The link on the table is still the right one, so it stays on screen.
        // Only the last upload failed, and the next one is already scheduled.
        <p className="text-sm font-medium text-red-700">{status.message}</p>
      ) : (
        <p className="text-sm" style={{ color: QUIET_TEXT }}>
          Changes you make appear on their phones. The link stops working after
          24 hours.
        </p>
      )}

      <div className="flex gap-2 pt-1">
        {/* Absent on a browser with no share sheet, and then the row is two
            tiles wide rather than three. basis-0 on all of them so whichever
            are there split the width evenly. */}
        {hasSheet && (
          <button type="button" onClick={handleShare} className={TILE_QUIET}>
            <ShareIcon className="h-8 w-8" />
            <span className={TILE_LABEL}>Share link</span>
          </button>
        )}

        <button type="button" onClick={handleCopy} className={TILE_QUIET}>
          <CopyIcon className="h-8 w-8" />
          <span className={TILE_LABEL}>{copied ? 'Copied' : 'Copy link'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setStopped(true);
            void stopSharing();
          }}
          className={TILE_STOP}
        >
          <StopIcon className="h-8 w-8" />
          <span className={TILE_LABEL}>Stop Sharing</span>
        </button>
      </div>
    </div>
  );
}
