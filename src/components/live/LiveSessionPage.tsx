import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { fetchShared, fetchSharedAt, submitScoreEdit, type LiveFetch } from '../../lib/liveViewer';
import type { SessionSnapshot } from '../../lib/sessionSnapshot';
import type { CourtScore } from '../../types';
import { APP_FULL_NAME, APP_URL } from '../../lib/appInfo';
import { appScrollTo } from '../../lib/appScroll';
import { BADGE_SIZE, Header } from '../layout/Header';
import { StandingsPanel } from '../schedule/StandingsPanel';
import { ScoreDialog } from '../schedule/ScoreDialog';
import {
  PLAYER_NAME_TEXT,
  ROUND_EDGE,
  ROUND_EDGE_DONE,
  ROUND_FILL,
  ROUND_FILL_DONE,
  ROUND_HEADING_TEXT,
  ROUND_PILL_DONE,
  ROUND_TEXT_DONE,
} from '../schedule/roundLook';
import { RoundTypeBadge } from '../schedule/RoundTypeBadge';
import { roundTypeOf } from '../../lib/roundTypes';
import { ChevronDownIcon } from '../icons';
import { CodePrompt } from './CodePrompt';
import { LiveCourt } from './LiveCourt';
import { LiveRoundTimer, LiveTimerChip, type WatchAlarm } from './LiveRoundTimer';
import * as stores from '../../lib/stores';
import { alertsFor, seedOwnAlerts, setOwnAlert } from '../../lib/watchAlerts';
import { sharedAlarming, sharedRemainingMs } from '../../lib/sessionSnapshot';
import { useCountdownTick } from '../../hooks/useCountdownTick';
import { useSharedAlarm } from '../../hooks/useSharedAlarm';
import { useWakeLock } from '../../hooks/useWakeLock';
import { warmUpAudio } from '../../lib/alarmSounds';
import { MakeYourOwn } from './MakeYourOwn';
import { LivePill } from '../LivePill';

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

/**
 * How often to ask whether anything has changed.
 *
 * Not how often the session is fetched. That question costs one timestamp —
 * see fetchSharedAt — so it can be asked at a cadence that suits the thing
 * people are actually waiting on, which is the host's round timer appearing.
 * Three seconds is under a second and a half of waiting on average, on top of
 * the second and a half the host spends batching the publish.
 */
const PROBE_MS = 3_000;

/**
 * How often to fetch the whole session regardless.
 *
 * Two jobs. On a database without 0009 the probe is unavailable, and this is
 * the polling the page did before any of this existed, unchanged. And even
 * where the probe works, a fetch this far apart is the backstop for the one
 * failure a probe cannot report: a document that changed without its timestamp
 * moving. That should not happen — the column is written from the snapshot's
 * own `at` — but twenty seconds of insurance costs one request.
 */
const POLL_MS = 20_000;

/**
 * The robin standing over every notice, at twice the size the banner draws it.
 *
 * A notice is the whole of what a visitor gets when there is nothing to show
 * them, and a page of grey type with no mark on it says nothing about where
 * they are. Sized off the banner's own badge rather than a pixel count, so the
 * two stay in step at every width the banner clamps to.
 */
const NOTICE_LOGO = `calc(2 * ${BADGE_SIZE})`;

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
    /**
     * The `at` of the document on screen, as epoch ms, so a probe can be
     * compared against it. Kept here rather than read off `result`, which this
     * effect deliberately does not depend on: re-running it on every poll would
     * restart the interval and the page would never settle into a cadence.
     */
    let showing: number | null = null;
    /** When the whole session was last pulled, for the POLL_MS backstop. */
    let pulledAt = 0;

    async function full() {
      const got = await fetchShared(shareKey);
      if (!live) return;
      pulledAt = Date.now();
      setResult(got);
      if (got.state === 'ok') {
        showing = Date.parse(got.snapshot.at);
        setSeenAt(new Date());
        setPending((prev) => settled(prev, got.snapshot, Date.now()));
      } else {
        // Gone, outdated or offline. Nothing on screen to compare a probe
        // against, so the next pass fetches rather than probes.
        showing = null;
      }
    }

    async function poll() {
      // A tab in the background is a phone in a pocket. Asking all afternoon
      // would be somebody else's battery.
      if (document.visibilityState !== 'visible') return;

      const due = Date.now() - pulledAt >= POLL_MS;
      if (showing === null || due) {
        await full();
        return;
      }

      const probe = await fetchSharedAt(shareKey);
      if (!live) return;
      // 'unavailable' is a database without 0009, or a probe that failed. Both
      // are answered the same way: say nothing, and let the POLL_MS backstop
      // above fetch the document as this page always used to.
      if (probe.state === 'unavailable') return;
      // 'gone' still goes through fetchShared, so that the session ending is
      // reported by the one function that knows how to say it.
      if (probe.state === 'gone' || probe.at !== showing) await full();
    }

    void poll();
    const timer = setInterval(() => void poll(), PROBE_MS);
    // Straight away on coming back, rather than a poll later looking at a
    // stale court.
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
    // The live view mounts instead of App, so it brings its own scroll pane —
    // the document is held still for it too; see index.css.
    <div data-app-scroll className="app-scroll bg-gray-50">
      {/* The app's own banner, with the LIVE pill standing where its buttons
          do. No drawer here, so no button to open one. */}
      <Header
        // The app's full name here rather than on the host's banner, where the
        // group's name takes its place. Somebody watching arrived by scanning a
        // code and may have no idea what they are looking at, so the title says
        // what it is and goes there.
        eyebrow="MADE WITH"
        title={APP_FULL_NAME}
        wordmark
        titleHref={APP_URL}
        corner={
          // No onClick: there is no Share Live Session panel on this side of
          // the link, and nothing this could usefully open.
          result?.state === 'ok' ? <LivePill /> : undefined
        }
      />

      <main className="mx-auto max-w-5xl space-y-4 px-2 pb-10 pt-4">
        {result === null && <Notice title="Loading this session…" />}

        {result?.state === 'gone' && (
          <>
            <Notice
              title="This session link has ended."
              body="Ask whoever is running it for a new one."
            />
            {/* The only notice that carries it. A link that has ended is the
                one dead end here where there is nothing left to wait for, so
                the app itself is the only thing left worth offering. */}
            <MakeYourOwn />
          </>
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
            shareKey={shareKey}
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

  // The bottom offset clears the home indicator. `viewport-fit=cover` in
  // index.html put the bottom safe area inside the viewport, so a flat bottom-4
  // would sit this notice half under the bar on a phone.
  return (
    <div className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
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
  shareKey,
  seenAt,
  onEditScore
}: {
  snapshot: Extract<LiveFetch, { state: 'ok' }>['snapshot'];
  /** Names this afternoon when the schedule predates sessions having names. */
  shareKey: string;
  seenAt: Date | null;
  /** Absent when nobody may change anything, which is most sessions. */
  onEditScore?: (at: Where) => void;
}) {
  const done = new Set(snapshot.completedRounds);

  /**
   * Rounds somebody has folded away.
   *
   * It starts holding whatever the host had already ticked DONE, so a page that
   * opens part way through an afternoon opens on the round being played. The
   * rule this reverses said an arriving page should never look half shut. That
   * was right about a tidy page and wrong about the question being asked of it:
   * somebody who scans the code at round four is looking for round four, and
   * three finished rounds standing open above it are three screens of courts
   * nobody is on, with the live one found by reading numbers. Folded, they are
   * three bars, each still saying its number and still opening to a tap.
   */
  const [folded, setFolded] = useState<ReadonlySet<number>>(
    () => new Set(snapshot.completedRounds)
  );

  /**
   * Every round whose DONE has already had its say here.
   *
   * The host ticking DONE folds that round away on this phone, once. It is the
   * only thing the host does that moves anything on somebody else's screen, and
   * it earns that because it is the moment the round stopped being the one to
   * look at: folding it puts the next round under the thumb that was about to
   * scroll.
   *
   * Once, though, and never again. After that fold the round belongs to
   * whoever is holding this phone: they open it to check a score, and it stays
   * open through every poll, including the ones where the host unticks DONE and
   * ticks it back. A set that only ever grows is what says so.
   *
   * It starts holding whatever was already finished when this page opened.
   * Those rounds are folded by the initializer above, and naming them here as
   * settled is what stops the first poll folding them a second time over a
   * visitor who has since opened one to look at a score.
   */
  const settled = useRef<ReadonlySet<number> | null>(null);

  useEffect(() => {
    const finished = snapshot.completedRounds;
    if (settled.current === null) {
      settled.current = new Set(finished);
      return;
    }
    const seen = settled.current;
    const fresh = finished.filter((roundNumber) => !seen.has(roundNumber));
    if (fresh.length === 0) return;
    settled.current = new Set([...seen, ...fresh]);
    setFolded((cur) => new Set([...cur, ...fresh]));
  }, [snapshot.completedRounds]);

  /**
   * Whether the timer sheet is up. Opened by tapping the clock and closed by
   * hand, never by a poll: a countdown that reaches zero on the host's phone
   * is a thing to look at, not a reason to take over the screen of somebody
   * who is mid-point on the far court.
   */
  const [timerOpen, setTimerOpen] = useState(false);
  const timer = snapshot.roundTimer;

  /**
   * Which afternoon this is, so a decision about the alarm lasts exactly as
   * long as the session it was made during. The share key stands in for a
   * schedule generated before sessions were named, the same substitution the
   * publisher makes when it writes the row.
   */
  const session = snapshot.sessionId ?? shareKey;
  // Subscribed rather than read once: turning the sound off has to redraw the
  // switch that was just pressed.
  const own = useSyncExternalStore(
    stores.watchAlerts.subscribe,
    stores.watchAlerts.get,
    stores.watchAlerts.get
  );
  // Worked out with or without a timer, because the switches are on the screen
  // somebody opens while waiting for one.
  const alerts = alertsFor(timer, session, own);

  // The host's choices, copied down as this phone's own the first time a real
  // timer arrives. After that the switches on this screen are this phone's and
  // the host cannot move them. See watchAlerts.
  useEffect(() => {
    if (timer) seedOwnAlerts(session, timer);
  }, [timer, session]);

  /**
   * The round this phone has run out and nobody here has acknowledged.
   *
   * The alarm is the one thing on a watcher's screen that outlives the
   * document it came from. Everything else on this page is a view of the
   * host's: they finish a round and it goes pale here, they reset the timer
   * and the countdown goes away. Not this. A host who presses Close is
   * answering the alarm on their own phone, and doing it the instant it starts
   * — they are stood over it — while somebody on the far court is mid-point
   * with the noise going in their pocket. Taking TIME'S UP off that screen
   * because the host has seen it means the one person who most needed telling
   * is the one who never finds out. Jeff's report on 2026-08-20.
   *
   * So it latches, and this phone answers it. `answered` is that answer, and
   * it is deliberately not the same as the latch going away: the round is
   * still over once the noise has stopped, so the screen still says so at
   * 0:00 and the chip on the round still reads 0:00. Only the host starting
   * the next countdown clears the thing entirely, which answers the question
   * the alarm was asking anyway.
   *
   * Answering has to be its own state rather than dropping the latch, because
   * the host's document may still say `alarming` for minutes afterwards. The
   * first version of this read the document as well as the latch, so pressing
   * Close while the host's own timer was still ringing silenced nothing at
   * all: the document put it straight back. Jeff's report on 2026-08-20, and
   * it is the case that happens every time — a host answers their own alarm
   * after the players, not before.
   *
   * State, set from an effect, which the react-hooks rule below objects to on
   * the grounds that an effect should synchronise with an external system
   * rather than cascade a render. This is that case rather than an exception to
   * it: the external system is the host's published document, arriving on a
   * poll this page does not control, and the latch is the fold over it. The two
   * ways of writing it without the effect were both worse — a ref written
   * during render is impure and `react-hooks/refs` says so, and hoisting it
   * into the poll callback would miss the alarm this phone reaches on its own
   * clock before the host's next document says anything.
   */
  const [alarm, setAlarm] = useState<WatchAlarm | null>(null);
  /**
   * What the arriving document has to say about the latch, or nothing at all.
   *
   * Most polls say nothing — a paused clock, a reset, the host going quiet —
   * and none of those is an answer to an alarm that has already sounded here.
   */
  // This phone's own clock, not the host's phase: the tick re-renders on the
  // second the deadline passes, so zero here is zero here.
  const latch = !timer
    ? undefined
    : sharedAlarming(timer)
      ? timer.roundNumber
      // A countdown with time left on it is the next round starting, which is
      // the one thing the host does that is allowed to take the last one down.
      : timer.phase === 'running' && sharedRemainingMs(timer) > 0
        ? null
        : undefined;
  useEffect(() => {
    if (latch === undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setAlarm((cur) => {
      if (latch === null) return null;
      // The same round still ringing on the host's phone. Whatever this one
      // has already said about it stands.
      return cur && cur.round === latch ? cur : { round: latch, answered: false };
    });
  }, [latch]);

  /** Ringing, flashing, and not yet answered on this phone. */
  const sounding = alarm !== null && !alarm.answered;

  /**
   * This phone saying it has heard the alarm. Both tiles on the sheet do it,
   * so whichever one a startled thumb lands on stops the noise.
   */
  const answerAlarm = useCallback(() => {
    setAlarm((cur) => (cur && !cur.answered ? { ...cur, answered: true } : cur));
  }, []);

  /**
   * Unlocks the audio on the first touch anywhere on this page.
   *
   * A host unlocks theirs by pressing Start Timer, which is a real gesture with
   * a sound pushed through it, and is why their alarm rings. A watcher presses
   * nothing: they scan a code, read a schedule and put the phone down, and the
   * alarm minutes later is the first sound the page has ever tried to make. iOS
   * refuses that outright — a context first built outside a gesture cannot be
   * resumed by a timer — so the alarm was silent on exactly the phones it was
   * for. Any touch will do, and one is all this spends.
   */
  const unlocked = useRef(false);
  useEffect(() => {
    if (unlocked.current) return;
    const tone = alerts.alarmTone;
    const spend = () => {
      if (unlocked.current) return;
      unlocked.current = true;
      warmUpAudio(tone);
    };
    document.addEventListener('pointerdown', spend, { capture: true, passive: true });
    return () => document.removeEventListener('pointerdown', spend, { capture: true });
  }, [alerts.alarmTone]);

  // A thirteen minute game against a phone that sleeps after five: somebody who
  // opens the timer to watch it wants to be able to look at it, and was getting
  // a black screen for the last eight minutes of every round.
  //
  // Narrower than the host's lock, which is held for the whole countdown with
  // the sheet closed. A host started the timer and asked for their own phone to
  // stay lit; twenty people watching did not all ask for thirteen minutes of
  // screen. So it is held while the timer screen is open and there is something
  // on it to count, and dropped the moment either stops being true.
  useWakeLock(
    timerOpen && (sounding || (!!timer && (timer.phase === 'running' || sharedAlarming(timer))))
  );

  // Counted here rather than in the sheet, because the sheet is only mounted
  // when somebody has opened it and the alarm is most for the phone that has
  // been put down. The tick is what makes zero arrive at zero.
  useCountdownTick(timer?.phase === 'running');
  // The latch rather than the document, in both directions: the host putting
  // their timer away does not reach into somebody else's pocket and silence
  // it, and the host's still ringing does not overrule somebody who has.
  useSharedAlarm(sounding, alerts.soundOn, alerts.alarmTone);

  // Where View Standings on every round goes.
  const standingsRef = useRef<HTMLDivElement>(null);

  /**
   * Whether this page has a standings table at all.
   *
   * Two things have to be true: the session keeps score, and the host has left
   * the switch on the Share card where it starts. One answer, worked out once,
   * because the table and every link down to it must appear and disappear
   * together — a link that scrolls to nothing is worse than no link.
   */
  // `!== false` rather than a plain read, the same way liveViewer takes the
  // field off the wire: only a host who has moved the switch takes the table
  // away, and a document that predates the switch keeps it.
  const showStandings = snapshot.scoringEnabled && snapshot.standingsShared !== false;

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
        const roundType = roundTypeOf(round);
        const finished = done.has(round.roundNumber);

        /**
         * The same two states the host's card separates, and separated here for
         * the same reason — except that on this page they genuinely come apart.
         *
         * The wash follows **finished**, which is the host's DONE arriving on a
         * poll. The saved height follows **folded**, which is whoever is holding
         * this phone tapping the arrow, and they may well fold a round that is
         * still being played to get at the next one. So a folded live round is
         * short and still rich, and a finished round somebody has opened to
         * check a score is pale and full height. Each says the thing it means.
         */
        const look = finished
          ? { fill: ROUND_FILL_DONE, edge: ROUND_EDGE_DONE, text: ROUND_TEXT_DONE }
          : { fill: ROUND_FILL, edge: ROUND_EDGE, text: 'text-white' };
        return (
          // Wrapped so the gap the page puts between rounds falls above the
          // tab, not between the tab and the card it belongs to.
          <div key={round.roundNumber}>
            {roundType && <RoundTypeBadge type={roundType} />}
            <section
              // Folded, the padding comes in to six pixels a side. It buys less
              // here than on the host's card because the 42px arrow sets the
              // floor and the text is nowhere near it: 4px of border plus 42
              // plus 12 is 58, against 78.5 open, which is the quarter Jeff
              // asked for. The arrow keeps its size — on this page it is the
              // only thing there is to press.
              className={`rounded-lg border-2 px-1.5 shadow ${
                expanded ? 'pt-[0.83rem] pb-[1.2rem]' : 'py-1.5'
              }`}
              style={{ backgroundColor: look.fill, borderColor: look.edge }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2
                    className={`${ROUND_HEADING_TEXT} ${
                      finished ? 'font-bold' : 'font-extrabold'
                    } uppercase ${look.text}`}
                  >
                    Round {round.roundNumber}
                  </h2>
                  {finished && (
                    // A tint of the ink rather than of white: white at a quarter
                    // over a pale card is very nearly the card.
                    <span
                      className={`rounded ${ROUND_PILL_DONE} px-2 py-0.5 text-xs font-medium ${look.text}`}
                    >
                      Done
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {/* On every round, exactly as the host's page draws it, and
                      only the round holding the timer shows a time. The clock
                      is the way in to the timer screen, so it has to be there
                      before there is a timer: that screen is where somebody
                      finds out whether the host has started one. */}
                  <LiveTimerChip
                    timer={timer}
                    // Answered or not: the round is over either way, and that
                    // is what a clock reading 0:00 says.
                    heldAlarm={alarm?.round ?? null}
                    roundNumber={round.roundNumber}
                    // A tap, and the only one on this page that is certainly
                    // about the alarm. Spent on the audio as well as on the
                    // sheet, the same way the host's Start Timer is.
                    onOpen={() => {
                      warmUpAudio(alerts.alarmTone);
                      setTimerOpen(true);
                    }}
                    ink={look.text}
                  />
                  {/* Down while the round is open, sideways once it is folded:
                      the arrow points at where the courts are. */}
                  <button
                    type="button"
                    onClick={() => toggleFold(round.roundNumber)}
                    aria-expanded={expanded}
                    aria-label={
                      expanded
                        ? `Hide round ${round.roundNumber}`
                        : `Show round ${round.roundNumber}`
                    }
                    className={`${look.text} transition-opacity hover:opacity-75`}
                  >
                    {/* Twice the size it opened at. The glyph is solid rather
                        than drawn in a stroke, so scaling it is what makes it
                        heavier. */}
                    <ChevronDownIcon
                      className={`h-[42px] w-[42px] transition-transform ${expanded ? '' : '-rotate-90'}`}
                    />
                  </button>
                </div>
              </div>

              {expanded && (
                <>
                  {/* Two across on a wide screen, never three. See RoundCard:
                      this is the watcher's copy of the same grid. */}
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    const link = showStandings ? (
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
          </div>
        );
      })}

      {showStandings && (
        <StandingsPanel
          schedule={snapshot.schedule}
          players={snapshot.players}
          panelRef={standingsRef}
          readOnly
          onBackToTop={() => appScrollTo({ top: 0, behavior: scrollBehavior() })}
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

      {/* Held open across a timer arriving and a timer going. The host starting
          one turns the waiting line into a countdown where it stands; the host
          resetting one turns it back, rather than pulling the screen out from
          under somebody who is still looking at it. */}
      {timerOpen && (
        <LiveRoundTimer
          timer={timer}
          alarm={alarm}
          alerts={alerts}
          onChangeAlerts={(patch) => setOwnAlert(session, patch)}
          // Both answer the alarm. Close puts the screen away with it; Stop
          // leaves it standing, which is for somebody who wants the noise to
          // end and the next round's countdown to appear where they are
          // already looking.
          onClose={() => {
            answerAlarm();
            setTimerOpen(false);
          }}
          onStop={answerAlarm}
        />
      )}
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
      {/* Width alone, with the height left to follow: the file is a hair off
          square. Its own ring is the edge, so nothing here needs the white
          disc the banner's badge is held off its artwork by. */}
      <img
        src="/logo.png"
        alt=""
        aria-hidden="true"
        width={913}
        height={907}
        className="mx-auto mb-5 h-auto select-none"
        style={{ width: NOTICE_LOGO }}
      />
      <p className="text-lg font-bold text-[#222]">{title}</p>
      {body && <p className="mt-1 text-sm text-gray-600">{body}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-4 rounded-md bg-brand-teal px-4 py-2 font-bold text-white transition-colors hover:bg-brand-teal-dark disabled:opacity-40"
        >
          {retrying ? 'Trying…' : 'Try Again'}
        </button>
      )}
    </div>
  );
}
