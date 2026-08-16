import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchShared, submitScoreEdit, type LiveFetch } from '../../lib/liveViewer';
import type { SessionSnapshot } from '../../lib/sessionSnapshot';
import type { CourtScore } from '../../types';
import { APP_URL } from '../../lib/appInfo';
import { Header } from '../layout/Header';
import { StandingsPanel } from '../schedule/StandingsPanel';
import { ScoreDialog } from '../schedule/ScoreDialog';
import {
  PLAYER_NAME_TEXT,
  ROUND_EDGE,
  ROUND_FILL,
  ROUND_HEADING_TEXT,
} from '../schedule/roundLook';
import { ChevronDownIcon } from '../icons';
import { CodePrompt } from './CodePrompt';
import { LiveCourt } from './LiveCourt';
import { MakeYourOwn } from './MakeYourOwn';

/**
 * Somebody else's session, read-only.
 *
 * The whole page for a visitor, rather than a panel inside the app. It is
 * branched to in main.tsx and App never mounts, which is the point: a visitor
 * has their own saved session in this browser, and App reads every bit of it in
 * lazy initializers before any early return inside it could fire. Sitting
 * outside means a person who scans a code at a court cannot have their own
 * afternoon disturbed by looking at somebody else's.
 *
 * It also means no settings drawer, no tabs and no sync. What it does share is
 * the banner — drawn without the drawer's button, since there is no drawer —
 * and every component that draws a session, which is what the scoring release
 * was careful to leave free of stores.
 */

/** Long enough not to hammer, short enough that a score lands while people look. */
const POLL_MS = 20_000;

/**
 * The way home, worn by the link under the schedule and the one on every
 * notice. Sized as a player's name because it is the one thing on the page a
 * visitor might actually want to press, and orange because everything else
 * down there is grey.
 */
const HOME_LINK = `${PLAYER_NAME_TEXT} font-medium text-brand-orange underline hover:text-brand-orange-dark transition-colors`;

/**
 * How long a score this phone sent is shown before it gives up waiting.
 *
 * An edit does not come back the way it went out. It queues, the host's phone
 * takes it within ten seconds and republishes, and this page reads that within
 * twenty more, so half a minute of the old number is the ordinary case and
 * showing it would have people typing the same score twice.
 *
 * So it is held here in the meantime, and dropped as soon as the session comes
 * back agreeing. Three minutes is the other ending: a host whose phone is in a
 * bag will apply it eventually, but a number this page cannot stand behind is
 * worse left on screen all afternoon than taken down.
 */
const PENDING_MS = 3 * 60_000;

/** Which court, in the host's own coordinates. Positions, as the queue stores. */
interface Where {
  round: number;
  court: number;
}

const slot = (at: Where) => `${at.round}:${at.court}`;

interface Held {
  score: CourtScore;
  /** When it was sent, for PENDING_MS above. */
  at: number;
}

/**
 * The session as it should look to the person who just typed a score: what the
 * host published, with anything this phone has sent and not seen come back
 * written over the top.
 */
function withPending(
  snapshot: SessionSnapshot,
  pending: ReadonlyMap<string, Held>
): SessionSnapshot {
  if (pending.size === 0) return snapshot;

  const rounds = snapshot.schedule.rounds.map((round, roundIndex) => {
    let courts = round.courts;
    round.courts.forEach((court, courtIndex) => {
      const held = pending.get(slot({ round: roundIndex, court: courtIndex }));
      if (!held) return;
      if (courts === round.courts) courts = [...round.courts];
      courts[courtIndex] = { ...court, score: held.score };
    });
    return courts === round.courts ? round : { ...round, courts };
  });

  return { ...snapshot, schedule: { rounds } };
}

/**
 * The same map with anything the session has caught up on taken out, and
 * anything it never will.
 *
 * Called where a fetch lands rather than in an effect watching one: this is
 * derived from what just arrived, and an effect would be a second render every
 * twenty seconds to work out something already in hand.
 *
 * Returns the map it was given when nothing was dropped, so a poll that changed
 * nothing does not re-render the page.
 */
function settled(
  pending: ReadonlyMap<string, Held>,
  snapshot: SessionSnapshot,
  now: number
): ReadonlyMap<string, Held> {
  if (pending.size === 0) return pending;

  const next = new Map(pending);
  for (const [at, held] of pending) {
    const [roundIndex, courtIndex] = at.split(':').map(Number);
    const score = snapshot.schedule.rounds[roundIndex]?.courts[courtIndex]?.score;
    const landed = score?.team1 === held.score.team1 && score?.team2 === held.score.team2;
    if (landed || now - held.at > PENDING_MS) next.delete(at);
  }
  return next.size === pending.size ? pending : next;
}

interface Props {
  shareKey: string;
}

export function LiveSessionPage({ shareKey }: Props) {
  const [result, setResult] = useState<LiveFetch | null>(null);
  const [seenAt, setSeenAt] = useState<Date | null>(null);
  const [pulling, setPulling] = useState(false);

  /**
   * The code, once the database has said it is the right one.
   *
   * Held in memory and nowhere else. It is not this phone's code — it belongs
   * to whoever is running the session, and it was said out loud to a court full
   * of people. Writing it into storage would leave it on a borrowed phone long
   * after the afternoon it was for, and typing four digits again after a reload
   * is not a hardship.
   */
  const [code, setCode] = useState<string | null>(null);
  /** Which court the prompt is standing in front of, and which is being typed. */
  const [asking, setAsking] = useState<Where | null>(null);
  const [editing, setEditing] = useState<Where | null>(null);
  const [pending, setPending] = useState<ReadonlyMap<string, Held>>(new Map());
  const [trouble, setTrouble] = useState<string | null>(null);
  // Stable, so the notice's own countdown is not restarted by a poll landing.
  const dismissTrouble = useCallback(() => setTrouble(null), []);

  const pull = useCallback(async () => {
    const got = await fetchShared(shareKey);
    setResult(got);
    if (got.state === 'ok') {
      setSeenAt(new Date());
      setPending((prev) => settled(prev, got.snapshot, Date.now()));
    }
    return got;
  }, [shareKey]);

  useEffect(() => {
    let live = true;

    async function poll() {
      // A tab in the background is a phone in a pocket. Asking every twenty
      // seconds all afternoon would be somebody else's battery.
      if (document.visibilityState !== 'visible') return;
      const got = await fetchShared(shareKey);
      if (!live) return;
      setResult(got);
      if (got.state === 'ok') {
        setSeenAt(new Date());
        setPending((prev) => settled(prev, got.snapshot, Date.now()));
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    // Straight away on coming back, rather than up to twenty seconds later
    // looking at a stale court.
    const wake = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', wake);

    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [shareKey]);

  async function retry() {
    setPulling(true);
    await pull();
    setPulling(false);
  }

  function tapScore(at: Where) {
    setTrouble(null);
    // Asked once. After that the code is what every edit this afternoon is
    // sent with, which is what the host meant by giving it out.
    if (code) setEditing(at);
    else setAsking(at);
  }

  function handleUnlocked(entered: string) {
    setCode(entered);
    setEditing(asking);
    setAsking(null);
  }

  async function handleSave(where: Where, score: CourtScore | null) {
    setEditing(null);
    // Null is a cleared score, which the dialog does not offer here: there is
    // no way to say "no score" to submit_score_edit. See allowClear.
    if (!code || !score) return;

    // On screen straight away, and taken back below if it was not taken. The
    // alternative is half a minute of the old number while the queue and two
    // polls do their work, and a person typing it in again.
    setPending((prev) => new Map(prev).set(slot(where), { score, at: Date.now() }));

    const answer = await submitScoreEdit(
      shareKey, code, where.round, where.court, score.team1, score.team2
    );
    if (answer === 'saved') return;

    setPending((prev) => {
      const next = new Map(prev);
      next.delete(slot(where));
      return next;
    });

    if (answer === 'refused') {
      // The code has stopped opening this share: switched off, stopped, or
      // expired. Forgetting it here means the next tap asks again rather than
      // failing silently in the same way.
      setCode(null);
      setTrouble('This session is not taking changes now. Ask whoever is running it.');
      return;
    }
    setTrouble(
      answer === 'offline'
        ? 'You are offline. That score was not sent.'
        : 'Could not send that score just now. Please try again.'
    );
  }

  // What is drawn, which is what arrived with this phone's own edits over it.
  const snapshot = result?.state === 'ok' ? withPending(result.snapshot, pending) : null;
  // Both, and not either. scoreEditing is the host's switch; scoringEnabled is
  // whether there are scores on this page at all.
  const editable = snapshot !== null && snapshot.scoreEditing && snapshot.scoringEnabled;
  const editingCourt = editing
    ? snapshot?.schedule.rounds[editing.round]?.courts[editing.court]
    : undefined;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* The app's own banner, with the LIVE pill standing where its buttons
          do. No drawer here, so no button to open one. */}
      <Header
        // The app's full name here rather than on the host's banner, where the
        // group's name takes its place. Somebody watching arrived by scanning a
        // code and may have no idea what they are looking at, so the title says
        // what it is and goes there.
        title="Pickleball Round Robin Generator"
        titleHref={APP_URL}
        corner={
          result?.state === 'ok' ? (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#149A30] ring-1 ring-[#149A30]/30">
              <span className="h-2 w-2 rounded-full bg-[#149A30]" aria-hidden="true" />
              LIVE
            </span>
          ) : undefined
        }
      />

      <main className="mx-auto max-w-5xl space-y-4 px-2 pb-10 pt-4">
        {result === null && <Notice title="Loading this session…" />}

        {result?.state === 'gone' && (
          <Notice
            title="This session link has ended."
            body="Ask whoever is running it for a new one."
            onRetry={retry}
            retrying={pulling}
          />
        )}

        {result?.state === 'outdated' && (
          <Notice
            title="This session needs a newer version of the app."
            body="Reload the page and it will update itself."
            onRetry={() => window.location.reload()}
          />
        )}

        {result?.state === 'offline' && (
          <Notice
            title="You are offline."
            body="This will fill in as soon as you are back on."
            onRetry={retry}
            retrying={pulling}
          />
        )}

        {result?.state === 'error' && (
          <Notice title={result.message} onRetry={retry} retrying={pulling} />
        )}

        {/* Said before the rounds, because it is the reason a score is worth
            tapping and nobody would guess it from a board that looks the same
            as it did yesterday. */}
        {editable && (
          <p className="text-center text-sm text-gray-600">
            {code
              ? 'Tap a score to change it.'
              : 'Tap a score to change it. You will be asked for a code.'}
          </p>
        )}

        {snapshot && (
          <Session
            snapshot={snapshot}
            seenAt={seenAt}
            onEditScore={editable ? tapScore : undefined}
          />
        )}
      </main>

      {asking && (
        <CodePrompt
          shareKey={shareKey}
          onUnlocked={handleUnlocked}
          onCancel={() => setAsking(null)}
        />
      )}

      {/* The host's own dialog, with its keypad and its tones, so a score is
          written down the same way on every phone at the court. Clearing is
          the one thing withheld: the queue has no way to carry it. */}
      {editing && editingCourt && (
        <ScoreDialog
          court={editingCourt}
          allowClear={false}
          onDone={(score) => void handleSave(editing, score)}
          onCancel={() => setEditing(null)}
        />
      )}

      {trouble && <Trouble message={trouble} onDone={dismissTrouble} />}
    </div>
  );
}

/**
 * Something that did not work, said where the thumb already is.
 *
 * At the foot rather than at the top of the page, because the person reading it
 * is looking at a court somewhere down the schedule and a notice above the
 * first round would be a notice nobody sees. It takes itself away.
 */
function Trouble({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 6000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <p
        role="status"
        className="max-w-sm rounded-lg bg-[#B42121] px-4 py-3 text-center text-sm font-medium text-white shadow-lg"
      >
        {message}
      </p>
    </div>
  );
}

function Session({
  snapshot,
  seenAt,
  onEditScore
}: {
  snapshot: Extract<LiveFetch, { state: 'ok' }>['snapshot'];
  seenAt: Date | null;
  /** Absent when nobody may change anything, which is most sessions. */
  onEditScore?: (at: Where) => void;
}) {
  const done = new Set(snapshot.completedRounds);

  // Rounds somebody has folded away. Everything starts open, including the
  // finished ones: a visitor was not there for the folding the host did, and a
  // page that arrives half shut looks broken rather than tidy.
  const [folded, setFolded] = useState<ReadonlySet<number>>(new Set());

  // Where View Standings on every round goes.
  const standingsRef = useRef<HTMLDivElement>(null);

  function toggleFold(roundNumber: number) {
    setFolded((cur) => {
      const next = new Set(cur);
      if (next.has(roundNumber)) next.delete(roundNumber);
      else next.add(roundNumber);
      return next;
    });
  }

  // Smooth unless the phone has asked for less movement, the same as the
  // host's page: neither scroll call consults that setting on its own.
  function scrollBehavior(): ScrollBehavior {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  return (
    <>
      {/* Rounds in the order they are played, not with the finished ones lifted
          to the top the way the host's page does. Somebody watching wants to
          know which court they are on next. */}
      {snapshot.schedule.rounds.map((round, roundIndex) => {
        const expanded = !folded.has(round.roundNumber);
        return (
          <section
            key={round.roundNumber}
            className="rounded-lg border-2 px-[0.6rem] pt-[0.83rem] pb-[1.2rem] shadow"
            style={{ backgroundColor: ROUND_FILL, borderColor: ROUND_EDGE }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className={`${ROUND_HEADING_TEXT} font-extrabold uppercase text-white`}>
                  Round {round.roundNumber}
                </h2>
                {done.has(round.roundNumber) && (
                  <span className="rounded bg-white/25 px-2 py-0.5 text-xs font-medium text-white">
                    Done
                  </span>
                )}
              </div>
              {/* Down while the round is open, sideways once it is folded: the
                  arrow points at where the courts are. */}
              <button
                type="button"
                onClick={() => toggleFold(round.roundNumber)}
                aria-expanded={expanded}
                aria-label={
                  expanded
                    ? `Hide round ${round.roundNumber}`
                    : `Show round ${round.roundNumber}`
                }
                className="text-white transition-colors hover:text-white/75"
              >
                {/* Twice the size it opened at. The glyph is solid rather than
                    drawn in a stroke, so scaling it is what makes it heavier. */}
                <ChevronDownIcon
                  className={`h-[42px] w-[42px] transition-transform ${expanded ? '' : '-rotate-90'}`}
                />
              </button>
            </div>

            {expanded && (
              <>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {round.courts.map((court, index) => (
                    <LiveCourt
                      // Keyed by position: two courts in one round can carry the same
                      // number while the host is part way through renaming them.
                      key={index}
                      court={court}
                      showScore={snapshot.scoringEnabled}
                      // The same two positions the queue is keyed on, and the
                      // same ones the host reads back. Not the round's number,
                      // which is the host's to change.
                      onEditScore={
                        onEditScore
                          ? () => onEditScore({ round: roundIndex, court: index })
                          : undefined
                      }
                    />
                  ))}
                </div>

                {/* The way down to the table this round feeds, the same link
                    the host's rounds carry and in the same place: the far end
                    of the SITTING OUT line, or its own row on a round where
                    nobody is sitting out. Only when there is a table to go to. */}
                {(() => {
                  const link = snapshot.scoringEnabled ? (
                    <button
                      type="button"
                      onClick={() =>
                        standingsRef.current?.scrollIntoView({
                          behavior: scrollBehavior(),
                          block: 'start',
                        })
                      }
                      // Set against SITTING OUT beside it, as on the host's card.
                      className="flex shrink-0 items-center gap-1 text-base font-bold text-white underline decoration-white/50 underline-offset-2 transition-colors hover:text-white/75"
                    >
                      View Standings
                      <ChevronDownIcon className="h-4 w-4" />
                    </button>
                  ) : null;

                  if (round.sitOuts.length === 0) {
                    return link && <div className="mt-3 flex justify-end">{link}</div>;
                  }

                  return (
                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="font-bold text-white">SITTING OUT</p>
                        {link}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {round.sitOuts.map((player) => (
                          <span
                            key={player.id}
                            className="inline-flex items-center rounded-md border bg-gray-100 px-3 py-2"
                            style={{ borderColor: ROUND_EDGE }}
                          >
                            <span className={`font-medium text-gray-900 ${PLAYER_NAME_TEXT}`}>
                              {player.name}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </section>
        );
      })}

      {snapshot.scoringEnabled && (
        <StandingsPanel
          schedule={snapshot.schedule}
          players={snapshot.players}
          panelRef={standingsRef}
          readOnly
          onBackToTop={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
        />
      )}

      {/* A live view that has quietly stopped updating is worse than one that
          says when it last managed to. */}
      <p className="pt-2 text-center text-base text-gray-500">
        {seenAt
          ? `Last Updated ${seenAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : 'Updating'}
      </p>
      <MakeYourOwn />
    </>
  );
}

function Notice({
  title,
  body,
  onRetry,
  retrying = false
}: {
  title: string;
  body?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="rounded-lg border border-panel-edge bg-white px-4 py-8 text-center shadow">
      <p className="text-lg font-bold text-[#222]">{title}</p>
      {body && <p className="mt-1 text-sm text-gray-600">{body}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-4 rounded-md bg-brand-teal px-4 py-2 font-medium text-white transition-colors hover:bg-brand-teal-dark disabled:opacity-40"
        >
          {retrying ? 'Trying…' : 'Try again'}
        </button>
      )}
      <p className="mt-6">
        <a href={APP_URL} className={HOME_LINK}>
          Make your own round robin
        </a>
      </p>
    </div>
  );
}
