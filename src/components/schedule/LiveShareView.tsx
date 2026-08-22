import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { QrCode } from '../QrCode';
import { CodeEntry } from '../CodeEntry';
import { LivePill } from '../LivePill';
import { Toggle } from '../Toggle';
import { CopyIcon, PersonIcon, ReplayIcon, ShareIcon, StopIcon } from '../icons';
import { TileButton, TILE_ALONE, TILE_ROW } from '../TileButton';
import { DiscardScheduleDialog } from './DiscardScheduleDialog';
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

const QUIET_TEXT = '#636A77';

/** Both switches on the card, so the two rows cannot drift apart. */
const SWITCH_ROW = 'flex items-center justify-between gap-4';
/** Sized as Keep Score? on the Setup panel, which is the switch these follow. */
const SWITCH_LABEL = 'text-lg font-semibold text-gray-800';

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
  /**
   * Whether Stop Sharing has been pressed but not yet meant.
   *
   * It is the one irreversible button on this card. Stopping deletes the row
   * and throws the key away, and the link that fourteen people have already
   * scanned cannot be brought back — pressing Share This Session afterwards
   * mints a new one and everybody has to scan again. A thumb landing on it by
   * accident costs the host an afternoon of explaining.
   */
  const [confirmingStop, setConfirmingStop] = useState(false);
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
          <div className={`${TILE_ALONE} pt-3`}>
            <TileButton
              tone="quiet"
              Icon={PersonIcon}
              label="Create an Account or Sign In"
              onClick={onCreateAccount}
            />
          </div>
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
        {/* One sentence, and it is the true one. What used to follow it said
            making another link puts the session back on the phones that scanned
            the old one, which is not what happens: the key is gone, a new one is
            minted, and everybody has to scan again. */}
        <p className="text-[15px] leading-snug text-[#3D495A]">
          Sharing has stopped and the old link no longer works.
        </p>

        {status.state === 'problem' && (
          <p className="mt-3 text-sm font-medium text-red-700">{status.message}</p>
        )}

        {/* Under what it is answering, like every other panel's buttons. It
            used to be pinned to the foot of a near-full-height sheet, three
            lines away from the sentence explaining it.

            A tile in the lead teal, not the solid green it wore before it. A
            solid fill beside the pale tiles on the live card reads as the one
            button on this panel that is really a button, and this is the same
            decision as the Share Link tile it replaces on the way back. */}
        <div className={`${TILE_ALONE} pt-6`}>
          <TileButton
            tone="teal"
            Icon={ShareIcon}
            label={status.state === 'starting' ? 'Making a Link…' : 'Share This Session'}
            disabled={status.state === 'starting'}
            onClick={begin}
          />
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
            <div className={`${TILE_ALONE} pt-6`}>
              <TileButton tone="teal" Icon={ReplayIcon} label="Try Again" onClick={begin} />
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
      {/* The same pill the watchers see in the corner of their page, and the
          same one that now sits under the Schedule tab. Here it is a statement
          rather than a way anywhere: this panel is already the panel it opens.

          Above the code rather than beside the heading, because what it is
          telling the host is that the thing directly below it is working — and
          in one block with it rather than as a second item in the card's
          `space-y-3`. The code carries a four-module white quiet zone inside
          its own box, about 26px of it, so any gap written here is added on top
          of white the eye already reads as space. */}
      <div className="flex flex-col items-center">
        <LivePill />
        <QrCode value={url} size={220} label="Scan to watch this session" />
      </div>

      {/* The two decisions about what the link opens on, above the buttons that
          hand it out: they are settled once, before anybody scans anything, and
          the row of tiles is what the host presses when they are settled. */}
      <ShareStandings scoring={scoring} />
      <ScoreEditing scoring={scoring} />

      {/* Absent on a browser with no share sheet, and then the row is two tiles
          wide rather than three. TileButton is basis-0, so whichever are there
          split the width evenly. */}
      <div className={`${TILE_ROW} pt-1`}>
        {hasSheet && (
          <TileButton tone="quiet" Icon={ShareIcon} label="Share Link" onClick={handleShare} />
        )}

        <TileButton
          tone="quiet"
          Icon={CopyIcon}
          label={copied ? 'Copied' : 'Copy Link'}
          onClick={handleCopy}
        />

        <TileButton
          tone="red"
          Icon={StopIcon}
          label="Stop Sharing"
          onClick={() => setConfirmingStop(true)}
        />
      </div>

      {/* select-all: one tap selects the whole address. */}
      <p className="select-all break-all rounded-md border border-panel-edge bg-[#F8F9FB] px-3 py-2.5 text-sm font-medium text-[#3D495A]">
        {url}
      </p>

      {/* The fine print, under a rule and at the foot of the card. Said here
          rather than on a panel before this one, and said whatever the
          publisher is doing: it is what somebody would want to know before they
          hold the code up, so it cannot be the line an error replaces. */}
      <div className="space-y-3 border-t border-panel-edge pt-3">
        <p className="text-sm" style={{ color: QUIET_TEXT }}>
          {scoring
            ? 'Names, courts and scores are shared. Player ratings are not.'
            : 'Names and courts are shared. Player ratings are not.'}
        </p>

        {status.state === 'problem' ? (
          // The link on the table is still the right one, so it stays on
          // screen. Only the last upload failed, and the next one is already
          // scheduled.
          <p className="text-sm font-medium text-red-700">{status.message}</p>
        ) : (
          <p className="text-sm" style={{ color: QUIET_TEXT }}>
            Changes you make appear on their phones. The link stops working
            after 24 hours.
          </p>
        )}
      </div>

      {/* The same dialog the tabs ask their question with, for the same reason:
          this is work that cannot be got back. It is `fixed`, and the sheet
          holding this card is transformed, so it lands over the sheet rather
          than over the document. That is where it is wanted — the sheet is
          92vh, and the question belongs on top of the card it is about. */}
      {confirmingStop && (
        <DiscardScheduleDialog
          heading="Stop Sharing?"
          body={
            <>
              The link stops working straight away, and everyone watching loses
              this session. Sharing again makes a <strong className="font-bold">new</strong>{' '}
              link for them all to scan.
            </>
          }
          cancelLabel="Keep Sharing"
          cancelIcon={ShareIcon}
          confirmLabel="Yes, Stop"
          confirmIcon={StopIcon}
          onConfirm={() => {
            setConfirmingStop(false);
            setStopped(true);
            void stopSharing();
          }}
          onCancel={() => setConfirmingStop(false)}
        />
      )}
    </div>
  );
}

/**
 * Whether the watchers get the standings table.
 *
 * On unless the host says otherwise, and the first of the two switches because
 * it is the one that changes what the page they open looks like. Switched off,
 * the table goes from the watchers' page and every link down to it goes with
 * it; the schedule and the scores are untouched.
 *
 * Only offered on a session that keeps score, the same rule the switch below it
 * follows. With scoring off there is no table on anybody's page to take away,
 * and a switch promising one would be promising a page that does not exist.
 */
function ShareStandings({ scoring }: { scoring: boolean }) {
  const [shared, setShared] = useStoredValue(stores.standingsShared);

  if (!scoring) return null;

  return (
    <div className={SWITCH_ROW}>
      <h3 className={SWITCH_LABEL}>
        Share Standings{' '}
        {/* The word people actually use for it, in the size of an aside. The
            heading has to stay two words to sit level with the switch below. */}
        <span className="font-normal" style={{ color: QUIET_TEXT }}>
          (leaderboard)
        </span>
      </h3>
      <Toggle checked={shared} onChange={setShared} label="Share Standings" />
    </div>
  );
}

/**
 * Letting the people watching change the scores, behind a four digit code.
 *
 * The second of the two switches, under the one about the standings and above
 * the tiles, because both are decisions about what the link opens on and the
 * tiles are what hands the link out.
 *
 * Only offered on a session that keeps score. With scoring off there are no
 * scores on the watchers' phones to edit, and a switch promising otherwise
 * would be a promise the shared page cannot keep.
 */
function ScoreEditing({ scoring }: { scoring: boolean }) {
  const [allowed, setAllowed] = useStoredValue(stores.scoreEditingAllowed);
  const [code, setCode] = useStoredValue(stores.scoreEditCode);

  if (!scoring) return null;

  function handleToggle(on: boolean) {
    setAllowed(on);
    // Switching it off throws the code away rather than leaving it to come
    // back with the switch. Turning this on again is a new decision, and the
    // code is the thing the host has told people out loud.
    if (!on) setCode(null);
  }

  return (
    <div>
      <div className={SWITCH_ROW}>
        <h3 className={SWITCH_LABEL}>Allow Editing Scores</h3>
        <Toggle checked={allowed} onChange={handleToggle} label="Allow Editing Scores" />
      </div>

      {/*
        The reveal. Grid rows going 0fr to 1fr is what animates a height nobody
        has measured — max-height would need a guess, and a guess that is too
        small clips the boxes on a large-text phone. The inner div owns the
        overflow, because the grid track is what shrinks and the content has to
        be allowed to be taller than it for the duration of the slide.

        `invisible` once shut so the boxes leave the tab order. A zero height
        row still has focusable children in it.
      */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          allowed ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 invisible'
        }`}
      >
        <div className="overflow-hidden">
          {/* What to do, then the boxes to do it in, then what the code is for.
              The instruction is above the thing it is an instruction for, which
              is where somebody reading down the panel wants it; the sentence
              about telling people is the part they need once it is typed. */}
          <div className="pt-3">
            <p id="score-code-help" className="text-center text-sm" style={{ color: QUIET_TEXT }}>
              Enter four digits
            </p>
            <div className="pt-2">
              <CodeEntry
                value={code ?? ''}
                onChange={(next) => setCode(next === '' ? null : next)}
                label="Score editing code"
                describedBy="score-code-help"
              />
            </div>
            <p className="pt-3 text-sm" style={{ color: QUIET_TEXT }}>
              Tell this code to anyone you&rsquo;d like to be a scorekeeper. They
              are asked for it the first time they tap a score box.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
