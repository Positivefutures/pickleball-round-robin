import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchShared, type LiveFetch } from '../../lib/liveViewer';
import { APP_URL } from '../../lib/appInfo';
import { Header } from '../layout/Header';
import { StandingsPanel } from '../schedule/StandingsPanel';
import {
  PLAYER_NAME_TEXT,
  ROUND_EDGE,
  ROUND_FILL,
  ROUND_HEADING_TEXT,
} from '../schedule/roundLook';
import { ChevronDownIcon } from '../icons';
import { LiveCourt } from './LiveCourt';

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

interface Props {
  shareKey: string;
}

export function LiveSessionPage({ shareKey }: Props) {
  const [result, setResult] = useState<LiveFetch | null>(null);
  const [seenAt, setSeenAt] = useState<Date | null>(null);
  const [pulling, setPulling] = useState(false);

  const pull = useCallback(async () => {
    const got = await fetchShared(shareKey);
    setResult(got);
    if (got.state === 'ok') setSeenAt(new Date());
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
      if (got.state === 'ok') setSeenAt(new Date());
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* The app's own banner, with the LIVE pill standing where its buttons
          do. No drawer here, so no button to open one. */}
      <Header
        title="Pickleball Round Robin"
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

        {result?.state === 'ok' && (
          <Session snapshot={result.snapshot} seenAt={seenAt} />
        )}
      </main>
    </div>
  );
}

function Session({
  snapshot,
  seenAt
}: {
  snapshot: Extract<LiveFetch, { state: 'ok' }>['snapshot'];
  seenAt: Date | null;
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
      {snapshot.schedule.rounds.map((round) => {
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
                    />
                  ))}
                </div>

                {round.sitOuts.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 font-bold text-white">SITTING OUT</p>
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
                )}

                {/* The way down to the table this round feeds, the same link the
                    host's rounds carry. Only while the round is open, and only
                    when there is a table under all of this to go to. */}
                {snapshot.scoringEnabled && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        standingsRef.current?.scrollIntoView({
                          behavior: scrollBehavior(),
                          block: 'start',
                        })
                      }
                      // Set against SITTING OUT above it, as on the host's card.
                      className="flex items-center gap-1 text-base font-bold text-white underline decoration-white/50 underline-offset-2 transition-colors hover:text-white/75"
                    >
                      View Standings
                      <ChevronDownIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
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
      <p className="text-center">
        <a href={APP_URL} className={HOME_LINK}>
          Make your own round robin
        </a>
      </p>
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
    <div className="rounded-lg border border-[#ddd] bg-white px-4 py-8 text-center shadow">
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
